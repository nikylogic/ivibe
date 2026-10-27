// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The hidden recorder window (docs/architecture.md §4.2). Raw frames exist only here, in
 * memory, and never cross IPC: main receives progress events and, after redaction, the
 * finished bundle. Every keyframe is OCR-scanned and redacted as soon as it is kept, and the
 * raw bitmap is closed.
 */

import { FrameSampler, MicRecorder } from "@ivibe/capture";
import {
  NARRATION_SAMPLE_RATE,
  UtteranceSegmenter,
  encodeWav,
  resample,
  rms,
  toDbfs,
} from "@ivibe/encode";
import { frameId } from "@ivibe/ocr";
import type { OcrEngine } from "@ivibe/ocr";
import { createWebOcr } from "@ivibe/ocr/web";
import { redact, scanFrame } from "@ivibe/redact";
import type { RedactedFrame } from "@ivibe/redact";
import {
  KeyframeSelector,
  THUMB_HEIGHT,
  THUMB_WIDTH,
  compareThumbnails,
  toGrayscale,
} from "@ivibe/vision";
import type { RecorderBridge } from "../../preload/recorder.ts";

declare global {
  interface Window {
    ivibeRecorderBridge: RecorderBridge;
    ivibeRecorder: { start: (options: StartOptions) => Promise<void> };
  }
}

interface StartOptions {
  fps: number;
  maxWidth: number;
  scaleFactor: number;
}

interface Keyframe {
  timeMs: number;
  bitmap: ImageBitmap;
}

/** How the pill names each kind of hidden secret. */
const SECRET_LABELS: Record<string, string> = {
  "meta-key": "a Meta API key",
  "openai-key": "an OpenAI key",
  "anthropic-key": "an Anthropic key",
  "github-token": "a GitHub token",
  "aws-key": "an AWS key",
  "google-key": "a Google API key",
  "stripe-key": "a Stripe key",
  "slack-token": "a Slack token",
  jwt: "a session token",
  "private-key": "a private key",
  assignment: "a password",
  bearer: "a bearer token",
  "env-line": "an .env value",
  "connection-string": "a database password",
  "high-entropy": "a token",
};

/** Below this level (−50 dBFS) the narration counts as silence (§4.6). */
const SILENCE_DBFS = -50;

const bridge = window.ivibeRecorderBridge;

// Models and ONNX Runtime are served by the app (pnpm ocr:fetch), so loading needs no network.
const ocrReady: Promise<OcrEngine> = createWebOcr({ baseUrl: "/ocr/" });
ocrReady.catch((error: unknown) => console.error("OCR failed to load:", error));

class Session {
  readonly #options: StartOptions;
  #stream: MediaStream | null = null;
  #sampler: FrameSampler | null = null;
  #mic: MicRecorder | null = null;
  #levelTimer: ReturnType<typeof setInterval> | null = null;
  #selector = new KeyframeSelector();
  #previousThumb: Uint8Array | null = null;
  #lastBitmap: { timeMs: number; bitmap: ImageBitmap } | null = null;
  #thumbCanvas = new OffscreenCanvas(THUMB_WIDTH, THUMB_HEIGHT);
  #startedAt = 0;
  #peakRms = 0;
  #size = { width: 0, height: 0 };

  readonly keyframes: Keyframe[] = [];
  /** Keyframes after OCR and redaction; the only frames that may leave this window. */
  readonly redacted: RedactedFrame[] = [];
  #privacyQueue: Promise<void> = Promise.resolve();
  #segmenter: UtteranceSegmenter | null = null;
  #micStartedAt = 0;
  /** Secret kinds already announced, so a token on screen for 20 frames is reported once. */
  #announced = new Set<string>();
  #ocrMs = 0;
  stats = { sampled: 0, changed: 0, motion: 0, appSwitches: 0 };
  privacy = {
    ocrEngine: "",
    framesScanned: 0,
    lines: 0,
    redactions: {} as Record<string, number>,
    blackouts: 0,
    ocrMsAverage: 0,
  };
  wav: Uint8Array | null = null;

  constructor(options: StartOptions) {
    this.#options = options;
  }

  async start(): Promise<void> {
    this.#stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: this.#options.fps * 2, max: 15 } },
      audio: false,
    });
    const track = this.#stream.getVideoTracks()[0];
    if (!track) throw new Error("The screen stream has no video track.");
    const settings = track.getSettings();
    this.#size = { width: settings.width ?? 0, height: settings.height ?? 0 };

    this.#mic = new MicRecorder();
    try {
      await this.#mic.start();
      this.#micStartedAt = performance.now();
      this.#listen(this.#mic);
    } catch (error) {
      // Recording without narration still works; the agent is told there's no audio.
      console.warn("Microphone unavailable:", error);
      this.#mic = null;
    }

    this.#sampler = new FrameSampler(track, {
      intervalMs: 1000 / this.#options.fps,
      onSample: ({ timeMs, frame }) => this.#onSample(timeMs, frame),
    });
    this.#startedAt = performance.now();
    this.#sampler.start();
    this.#levelTimer = setInterval(() => {
      const level = this.#mic?.level ?? 0;
      this.#peakRms = Math.max(this.#peakRms, level);
      bridge.emit({ type: "level", rms: level });
    }, 100);
  }

  /** Cuts narration into sentences and sends each for live captions (audio only). */
  #listen(mic: MicRecorder): void {
    const rate = mic.sampleRate;
    this.#segmenter = new UtteranceSegmenter({
      sampleRate: rate,
      onUtterance: ({ startMs, endMs, samples }) => {
        // The mic starts a moment before the screen; report times on the recording's clock.
        const offset = this.#startedAt ? this.#startedAt - this.#micStartedAt : 0;
        bridge.emit({
          type: "utterance",
          startMs: Math.max(0, Math.round(startMs - offset)),
          endMs: Math.max(0, Math.round(endMs - offset)),
          wav: encodeWav(resample(samples, rate)),
        });
      },
    });
    const segmenter = this.#segmenter;
    mic.onChunk = (samples, level) => segmenter.push(samples, level);
  }

  async #onSample(timeMs: number, frame: VideoFrame | null): Promise<void> {
    this.stats.sampled++;
    if (this.stats.sampled % 2 === 0) this.stats.motion = Math.min(this.stats.motion + 1, 120);
    if (!frame) return; // The screen didn't change since the last sample.

    const width = Math.min(this.#options.maxWidth, frame.displayWidth);
    const bitmap = await createImageBitmap(frame, { resizeWidth: width, resizeQuality: "medium" });

    const context = this.#thumbCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D canvas unavailable");
    context.drawImage(bitmap, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    const thumb = toGrayscale(context.getImageData(0, 0, THUMB_WIDTH, THUMB_HEIGHT).data);

    const change = this.#previousThumb ? compareThumbnails(this.#previousThumb, thumb) : null;
    this.#previousThumb = thumb;
    if (change && change.changeClass === "identical") {
      bitmap.close();
      return;
    }
    this.stats.changed++;
    if (change?.probableAppSwitch) this.stats.appSwitches++;

    const keep = this.#selector.consider(timeMs, change ? change.changeClass : "first");
    if (keep) this.#keep({ timeMs, bitmap });

    // Always remember the newest frame so it can become the final keyframe.
    if (this.#lastBitmap && !this.keyframes.some((k) => k.bitmap === this.#lastBitmap!.bitmap)) {
      this.#lastBitmap.bitmap.close();
    }
    this.#lastBitmap = { timeMs, bitmap };
  }

  /** Queues a keyframe for OCR and redaction, one at a time so capture never waits on it. */
  #keep(keyframe: Keyframe): void {
    this.keyframes.push(keyframe);
    const index = this.keyframes.length - 1;
    this.#privacyQueue = this.#privacyQueue.then(() => this.#scan(index, keyframe));
  }

  async #scan(index: number, keyframe: Keyframe): Promise<void> {
    const ocr = await ocrReady;
    const id = frameId(index);
    const started = performance.now();
    const lines = await ocr.recognize(keyframe.bitmap, { frame: id });
    this.#ocrMs += performance.now() - started;

    const report = scanFrame(lines, {
      width: keyframe.bitmap.width,
      height: keyframe.bitmap.height,
    });
    const frame = redact({ id, tMs: keyframe.timeMs, image: keyframe.bitmap }, report);
    this.redacted.push(frame);
    // The raw pixels are no longer needed once a painted copy exists.
    if (frame.image !== keyframe.bitmap) keyframe.bitmap.close();

    const privacy = this.privacy;
    privacy.ocrEngine = ocr.name;
    privacy.framesScanned++;
    privacy.lines += lines.length;
    if (report.blackout) privacy.blackouts++;
    this.#announce(
      report.blackout,
      report.boxes.map((box) => box.rule),
    );
    for (const box of report.boxes) {
      privacy.redactions[box.rule] = (privacy.redactions[box.rule] ?? 0) + 1;
    }
    privacy.ocrMsAverage = Math.round(this.#ocrMs / privacy.framesScanned);
  }

  #announce(blackout: boolean, rules: string[]): void {
    if (blackout && !this.#announced.has("blackout")) {
      this.#announced.add("blackout");
      bridge.emit({ type: "feedback", feedback: { type: "blackout" } });
    }
    for (const rule of rules) {
      if (this.#announced.has(rule)) continue;
      this.#announced.add(rule);
      bridge.emit({
        type: "feedback",
        feedback: { type: "secret", label: SECRET_LABELS[rule] ?? "a secret" },
      });
    }
  }

  async stop(): Promise<void> {
    if (this.#levelTimer) clearInterval(this.#levelTimer);
    await this.#sampler?.stop();
    this.#stream?.getTracks().forEach((track) => track.stop());

    const last = this.#lastBitmap;
    if (last && !this.keyframes.some((k) => k.bitmap === last.bitmap)) {
      this.#selector.keepFinal();
      this.#keep(last);
    }
    this.#lastBitmap = null;

    const durationMs = performance.now() - this.#startedAt;
    let audioSeconds = 0;
    if (this.#mic) {
      this.#segmenter?.flush();
      this.#mic.onChunk = null;
      const raw = await this.#mic.stop();
      const samples = resample(raw, this.#mic.sampleRate || NARRATION_SAMPLE_RATE);
      this.wav = encodeWav(samples);
      audioSeconds = samples.length / NARRATION_SAMPLE_RATE;
      this.#peakRms = Math.max(this.#peakRms, rms(samples));
    }

    await this.#privacyQueue;

    bridge.emit({
      type: "finished",
      summary: {
        durationMs,
        display: { ...this.#size, scaleFactor: this.#options.scaleFactor },
        frames: { ...this.stats, keyframes: this.keyframes.length },
        audio: {
          seconds: audioSeconds,
          bytes: this.wav?.byteLength ?? 0,
          peakRms: this.#peakRms,
          silent: toDbfs(this.#peakRms) < SILENCE_DBFS,
        },
        privacy: this.privacy,
      },
    });
  }

  async cancel(): Promise<void> {
    if (this.#levelTimer) clearInterval(this.#levelTimer);
    await this.#sampler?.stop();
    this.#stream?.getTracks().forEach((track) => track.stop());
    await this.#mic?.cancel();
    this.dispose();
  }

  /** Drops every frame and the audio from memory. */
  dispose(): void {
    for (const keyframe of this.keyframes) keyframe.bitmap.close();
    for (const frame of this.redacted) frame.image.close();
    this.keyframes.length = 0;
    this.redacted.length = 0;
    this.#lastBitmap?.bitmap.close();
    this.#lastBitmap = null;
    this.wav = null;
  }
}

let current: Session | null = null;

window.ivibeRecorder = {
  async start(options) {
    current?.dispose();
    current = new Session(options);
    try {
      await current.start();
      bridge.emit({ type: "started", width: 0, height: 0 });
    } catch (error) {
      current.dispose();
      current = null;
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Screen recording permission was denied."
          : error instanceof Error
            ? error.message
            : String(error);
      bridge.emit({ type: "error", message });
    }
  },
};

bridge.onCommand((command) => {
  const session = current;
  if (!session) return;
  if (command.type === "stop") {
    session.stop().catch((error: unknown) =>
      bridge.emit({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  } else {
    void session.cancel().then(() => bridge.emit({ type: "cancelled" }));
    current = null;
  }
});
