// SPDX-License-Identifier: AGPL-3.0-only

import workletUrl from "./mic.worklet.ts?worker&url";

/**
 * Records narration from the microphone (docs/architecture.md §4.6). An AudioWorklet collects
 * raw samples off the main thread; the caller resamples and encodes them when recording stops.
 */
export class MicRecorder {
  #context: AudioContext | null = null;
  #stream: MediaStream | null = null;
  #node: AudioWorkletNode | null = null;
  #chunks: Float32Array[] = [];

  /** Latest level (RMS, 0–1), updated about 20 times a second. */
  level = 0;

  /** Called with every ~50-ms chunk as it arrives (live captions). */
  onChunk: ((samples: Float32Array, rms: number) => void) | null = null;

  get sampleRate(): number {
    return this.#context?.sampleRate ?? 0;
  }

  /** The microphone's name, as the system shows it. */
  get label(): string {
    return this.#stream?.getAudioTracks()[0]?.label ?? "";
  }

  async start(deviceId?: string): Promise<void> {
    this.#stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        channelCount: 1,
        noiseSuppression: true,
        echoCancellation: false,
        autoGainControl: true,
      },
    });
    this.#context = new AudioContext();
    await this.#context.audioWorklet.addModule(workletUrl);
    const source = this.#context.createMediaStreamSource(this.#stream);
    this.#node = new AudioWorkletNode(this.#context, "ivibe-mic-collector");
    this.#node.port.onmessage = (event: MessageEvent<{ samples: Float32Array; rms: number }>) => {
      this.#chunks.push(event.data.samples);
      this.level = event.data.rms;
      this.onChunk?.(event.data.samples, event.data.rms);
    };
    source.connect(this.#node);
  }

  /** Stops recording and returns every sample captured, at {@link sampleRate}. */
  async stop(): Promise<Float32Array> {
    this.#node?.port.close();
    this.#node?.disconnect();
    this.#stream?.getTracks().forEach((track) => track.stop());
    await this.#context?.close();
    const length = this.#chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.#chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    this.#chunks = [];
    return samples;
  }

  /** Drops everything recorded (Cancel). */
  async cancel(): Promise<void> {
    await this.stop();
  }
}
