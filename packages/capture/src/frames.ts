// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Samples frames from a screen-capture track (docs/architecture.md §4.5).
 *
 * Screen capture only delivers a frame when something changes, so the sampler keeps the newest
 * frame and takes it every `intervalMs`. If nothing new arrived, the screen didn't change and
 * the tick is reported as a repeat.
 */

// MediaStreamTrackProcessor is Chromium-only and missing from TypeScript's DOM types.
declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack; maxBufferSize?: number });
  readonly readable: ReadableStream<VideoFrame>;
}

export interface SampledFrame {
  /** Milliseconds since sampling started. */
  timeMs: number;
  /** The newest frame, or null when the screen hasn't changed since the last sample. */
  frame: VideoFrame | null;
}

export interface FrameSamplerOptions {
  intervalMs?: number;
  onSample: (sample: SampledFrame) => void | Promise<void>;
}

export class FrameSampler {
  readonly #track: MediaStreamTrack;
  readonly #intervalMs: number;
  readonly #onSample: FrameSamplerOptions["onSample"];
  #latest: VideoFrame | null = null;
  #reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #startedAt = 0;
  #busy = false;
  #stopped = false;

  constructor(track: MediaStreamTrack, options: FrameSamplerOptions) {
    this.#track = track;
    this.#intervalMs = options.intervalMs ?? 250;
    this.#onSample = options.onSample;
  }

  start(): void {
    const processor = new MediaStreamTrackProcessor({ track: this.#track, maxBufferSize: 2 });
    this.#reader = processor.readable.getReader();
    this.#startedAt = performance.now();
    void this.#pump();
    this.#timer = setInterval(() => void this.#tick(), this.#intervalMs);
  }

  async #pump(): Promise<void> {
    const reader = this.#reader;
    if (!reader) return;
    while (!this.#stopped) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      this.#latest?.close();
      this.#latest = value;
    }
  }

  async #tick(): Promise<void> {
    // Skip a tick rather than queue work: a frame is either fully processed or never sampled.
    if (this.#busy || this.#stopped) return;
    this.#busy = true;
    const frame = this.#latest;
    this.#latest = null;
    try {
      await this.#onSample({ timeMs: performance.now() - this.#startedAt, frame });
    } finally {
      frame?.close();
      this.#busy = false;
    }
  }

  /** Stops sampling and releases every frame still held. */
  async stop(): Promise<void> {
    this.#stopped = true;
    if (this.#timer) clearInterval(this.#timer);
    await this.#reader?.cancel().catch(() => undefined);
    this.#latest?.close();
    this.#latest = null;
  }
}
