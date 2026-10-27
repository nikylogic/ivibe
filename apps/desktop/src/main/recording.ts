// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { desktopCapturer, screen, session } from "electron";
import type { BrowserWindow, Display } from "electron";
import { Channels } from "../shared/ipc.ts";
import type { RecorderCommand, RecorderEvent, RecordingStatus } from "../shared/ipc.ts";

/**
 * The recording state machine (docs/architecture.md §4.4). Main owns the state; the hidden
 * recorder window does the capture and reports back.
 */

export const MAX_RECORDING_MS = 60_000;
export const MIN_RECORDING_MS = 2_000;
const CURSOR_SAMPLE_MS = 100;

interface CursorSample {
  t: number;
  x: number;
  y: number;
}

export class RecordingController extends EventEmitter<{ status: [RecordingStatus] }> {
  readonly #recorder: () => BrowserWindow;
  #status: RecordingStatus = { phase: "idle", elapsedMs: 0, maxMs: MAX_RECORDING_MS };
  #display: Display | null = null;
  #sourceId: string | null = null;
  #startedAt = 0;
  #id = "";
  #ticker: ReturnType<typeof setInterval> | null = null;
  #cursor: CursorSample[] = [];
  #stopRequested = false;

  constructor(recorder: () => BrowserWindow) {
    super();
    this.#recorder = recorder;
    this.#installDisplayHandler();
  }

  get status(): RecordingStatus {
    return this.#status;
  }

  get display(): Display | null {
    return this.#display;
  }

  /** Cursor positions at 10 Hz, relative to the recorded display (for likely_click, §5.2). */
  get cursorTrail(): readonly CursorSample[] {
    return this.#cursor;
  }

  #set(status: Partial<RecordingStatus>): void {
    this.#status = { ...this.#status, ...status };
    this.emit("status", this.#status);
  }

  /** Grants the chosen screen to the recorder's getDisplayMedia call, so no picker appears. */
  #installDisplayHandler(): void {
    session.defaultSession.setDisplayMediaRequestHandler(
      (request, callback) => {
        void (async () => {
          const recorder = this.#recorder();
          if (request.frame?.processId !== recorder.webContents.getProcessId()) {
            callback({});
            return;
          }
          const sources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 0, height: 0 },
          });
          const source =
            sources.find((candidate) => candidate.id === this.#sourceId) ??
            sources.find((candidate) => candidate.display_id === String(this.#display?.id)) ??
            sources[0];
          callback(source ? { video: source } : {});
        })();
      },
      { useSystemPicker: false },
    );
  }

  async start(display: Display): Promise<void> {
    if (this.#status.phase === "starting" || this.#status.phase === "recording") return;
    this.#display = display;
    this.#sourceId = null;
    this.#stopRequested = false;
    this.#cursor = [];
    this.#id = randomUUID();
    this.#set({ phase: "starting", elapsedMs: 0, error: undefined, summary: undefined });

    const options = {
      fps: 4,
      maxWidth: 1920,
      scaleFactor: display.scaleFactor,
    };
    try {
      // executeJavaScript with userGesture=true satisfies getDisplayMedia's activation
      // requirement in the hidden window (Spike S11).
      await this.#recorder().webContents.executeJavaScript(
        `window.ivibeRecorder.start(${JSON.stringify(options)})`,
        true,
      );
    } catch (error) {
      this.#fail(error instanceof Error ? error.message : String(error));
    }
  }

  async stop(): Promise<void> {
    if (this.#status.phase !== "recording") {
      if (this.#status.phase === "starting") this.#stopRequested = true;
      return;
    }
    const remaining = MIN_RECORDING_MS - (Date.now() - this.#startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    this.#clearTicker();
    this.#set({ phase: "finalizing", elapsedMs: Date.now() - this.#startedAt });
    this.#send({ type: "stop" });
  }

  cancel(): void {
    if (this.#status.phase !== "recording" && this.#status.phase !== "starting") return;
    this.#clearTicker();
    this.#send({ type: "cancel" });
    this.#cursor = [];
    this.#set({ phase: "idle", elapsedMs: 0 });
  }

  /** Back to idle after the user has seen or discarded the result. */
  reset(): void {
    if (this.#status.phase === "review" || this.#status.phase === "error") {
      this.#set({ phase: "idle", elapsedMs: 0, error: undefined, summary: undefined });
    }
  }

  handleRecorderEvent(event: RecorderEvent): void {
    switch (event.type) {
      case "started":
        this.#startedAt = Date.now();
        this.#set({ phase: "recording", elapsedMs: 0 });
        this.#startTicker();
        if (this.#stopRequested) void this.stop();
        break;
      case "level":
        // Forwarded to the UI and HUD by the caller.
        break;
      case "finished":
        this.#set({
          phase: "review",
          elapsedMs: event.summary.durationMs,
          summary: {
            ...event.summary,
            id: this.#id,
            startedAt: this.#startedAt,
            cursorSamples: this.#cursor.length,
          },
        });
        break;
      case "cancelled":
        break;
      case "error":
        this.#fail(event.message);
        break;
    }
  }

  #fail(message: string): void {
    this.#clearTicker();
    this.#set({ phase: "error", error: message });
  }

  #send(command: RecorderCommand): void {
    this.#recorder().webContents.send(Channels.recorderCommand, command);
  }

  #startTicker(): void {
    const display = this.#display;
    let lastStatus = 0;
    this.#ticker = setInterval(() => {
      const elapsedMs = Date.now() - this.#startedAt;
      if (display) {
        const point = screen.getCursorScreenPoint();
        const { x, y } = display.bounds;
        this.#cursor.push({ t: elapsedMs, x: point.x - x, y: point.y - y });
      }
      if (elapsedMs - lastStatus >= 250) {
        lastStatus = elapsedMs;
        this.#set({ elapsedMs });
      }
      if (elapsedMs >= MAX_RECORDING_MS) void this.stop();
    }, CURSOR_SAMPLE_MS);
  }

  #clearTicker(): void {
    if (this.#ticker) clearInterval(this.#ticker);
    this.#ticker = null;
  }
}
