// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Splits live microphone audio into utterances for live captions (docs/architecture.md §4.6).
 * Muse Voice Transcribe takes whole clips, so each pause in speech closes a clip that can be
 * transcribed while the user keeps talking.
 *
 * Speech is detected with an energy gate over a noise floor that adapts during silence.
 */

export interface Utterance {
  /** Milliseconds from the first sample pushed. */
  startMs: number;
  endMs: number;
  samples: Float32Array;
}

export interface SegmenterOptions {
  sampleRate: number;
  onUtterance: (utterance: Utterance) => void;
  /** Speech shorter than this is treated as a click or bump and dropped. */
  minSpeechMs?: number;
  /** A pause this long ends the utterance. */
  endSilenceMs?: number;
  /** Long monologues are cut here so captions keep coming. */
  maxUtteranceMs?: number;
  /** Audio kept from before speech was detected, so first syllables aren't clipped. */
  preRollMs?: number;
  /** The gate never drops below this RMS (about −40 dBFS). */
  minThreshold?: number;
}

export class UtteranceSegmenter {
  readonly #options: Required<SegmenterOptions>;
  #samplesSeen = 0;
  #noiseFloor = 0.004;
  #preRoll: Float32Array[] = [];
  #preRollSamples = 0;
  #speech: Float32Array[] = [];
  #speechSamples = 0;
  #speechStart = 0;
  #voicedSamples = 0;
  #silentSamples = 0;
  #inSpeech = false;

  constructor(options: SegmenterOptions) {
    this.#options = {
      minSpeechMs: 300,
      endSilenceMs: 700,
      maxUtteranceMs: 12_000,
      preRollMs: 250,
      minThreshold: 0.01,
      ...options,
    };
  }

  /** Whether the speaker is mid-utterance (for a "listening" indicator). */
  get isSpeaking(): boolean {
    return this.#inSpeech;
  }

  #ms(samples: number): number {
    return (samples / this.#options.sampleRate) * 1000;
  }

  #threshold(): number {
    return Math.max(this.#options.minThreshold, this.#noiseFloor * 3);
  }

  /** Feeds the next chunk (any length, ~50 ms works well) and its RMS level. */
  push(chunk: Float32Array, rms: number): void {
    const voiced = rms >= this.#threshold();
    const chunkStart = this.#samplesSeen;
    this.#samplesSeen += chunk.length;

    if (!this.#inSpeech) {
      if (voiced) {
        this.#inSpeech = true;
        this.#speech = [...this.#preRoll, chunk];
        this.#speechSamples = this.#preRollSamples + chunk.length;
        this.#speechStart = chunkStart - this.#preRollSamples;
        this.#voicedSamples = chunk.length;
        this.#silentSamples = 0;
        this.#preRoll = [];
        this.#preRollSamples = 0;
        return;
      }
      // Track the room's noise slowly, so steady fans or hum don't count as speech.
      this.#noiseFloor = this.#noiseFloor * 0.95 + rms * 0.05;
      this.#preRoll.push(chunk);
      this.#preRollSamples += chunk.length;
      const keep = (this.#options.preRollMs / 1000) * this.#options.sampleRate;
      while (this.#preRoll.length > 1 && this.#preRollSamples - this.#preRoll[0]!.length >= keep) {
        this.#preRollSamples -= this.#preRoll.shift()!.length;
      }
      return;
    }

    this.#speech.push(chunk);
    this.#speechSamples += chunk.length;
    if (voiced) {
      this.#voicedSamples += chunk.length;
      this.#silentSamples = 0;
    } else {
      this.#silentSamples += chunk.length;
    }

    if (
      this.#ms(this.#silentSamples) >= this.#options.endSilenceMs ||
      this.#ms(this.#speechSamples) >= this.#options.maxUtteranceMs
    ) {
      this.#close();
    }
  }

  /** Ends any utterance in progress (call when recording stops). */
  flush(): void {
    if (this.#inSpeech) this.#close();
  }

  #close(): void {
    const voicedMs = this.#ms(this.#voicedSamples);
    // Trim the trailing silence, keeping a short tail so the last word isn't cut.
    const tail = Math.min(this.#silentSamples, (150 / 1000) * this.#options.sampleRate);
    const length = this.#speechSamples - this.#silentSamples + tail;
    const samples = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.#speech) {
      if (offset >= length) break;
      const part = chunk.subarray(0, Math.min(chunk.length, length - offset));
      samples.set(part, offset);
      offset += part.length;
    }
    const startMs = Math.max(0, this.#ms(this.#speechStart));

    this.#inSpeech = false;
    this.#speech = [];
    this.#speechSamples = 0;
    this.#voicedSamples = 0;
    this.#silentSamples = 0;

    if (voicedMs >= this.#options.minSpeechMs) {
      this.#options.onUtterance({ startMs, endMs: startMs + this.#ms(length), samples });
    }
  }
}
