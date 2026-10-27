// SPDX-License-Identifier: AGPL-3.0-only

// Runs in the AudioWorkletGlobalScope. Batches mono samples into ~50 ms messages.

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: unknown): void;

class MicCollector extends AudioWorkletProcessor {
  #buffer: number[] = [];
  readonly #batch = Math.round(sampleRate / 20);

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (const sample of channel) this.#buffer.push(sample);
      if (this.#buffer.length >= this.#batch) {
        const samples = Float32Array.from(this.#buffer);
        this.#buffer = [];
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        this.port.postMessage({ samples, rms: Math.sqrt(sum / samples.length) }, [samples.buffer]);
      }
    }
    return true;
  }
}

registerProcessor("ivibe-mic-collector", MicCollector);
