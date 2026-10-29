// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { desktopCapturer, screen, session } from "electron";
import type { BrowserWindow, Display } from "electron";
import { Channels } from "../shared/ipc.ts";
import type {
  EvidenceFrame,
  HistoryEntry,
  OutputMode,
  RecorderCommand,
  RecorderEvent,
  RecordingFeedback,
  RecordingResult,
  RecordingStatus,
  Settings,
  TranscriptSegment,
} from "../shared/ipc.ts";
import { classifyTarget } from "@ivibe/engine";
import { compose, deliverPayload, detectDestination } from "./compose.ts";
import { selectedText } from "./os-bridge.ts";
import type { Destination, Payload } from "./compose.ts";
import type { FocusedWindow } from "./os-bridge.ts";
import type { MetaAccess } from "./cloud.ts";
import { shouldFallBack } from "./access.ts";
import { transcribe } from "./transcribe.ts";

/**
 * The recording state machine (docs/architecture.md §4.4). Main owns the state; the hidden
 * recorder window does the capture and reports back.
 */

export const MAX_RECORDING_MS = 60_000;
/** Nothing to run a recording on: no iVibe Cloud session and no Meta key. */
const NO_ACCESS = "Sign in to iVibe Cloud or add your Meta API key in Settings first.";

/** Dictation runs longer than a bug report; captions go out a sentence at a time either way. */
export const MAX_DICTATE_MS = 5 * 60_000;
export const MIN_RECORDING_MS = 2_000;
const CURSOR_SAMPLE_MS = 100;

interface CursorSample {
  t: number;
  x: number;
  y: number;
}

export interface RecordingControllerOptions {
  recorder: () => BrowserWindow;
  /**
   * The user's Meta key and/or Cloud session, in the order to try (main/access.ts), for live
   * captions and writing; empty turns both off.
   */
  access: () => MetaAccess[];
  settings: () => Settings;
}

export class RecordingController extends EventEmitter<{
  status: [RecordingStatus];
  feedback: [RecordingFeedback];
  /** A finished result, for History. */
  result: [HistoryEntry];
}> {
  readonly #recorder: () => BrowserWindow;
  readonly #access: () => MetaAccess[];
  /** This recording's ways to reach Meta; a refused first one is dropped for the rest of it. */
  #route: MetaAccess[] = [];
  readonly #settings: () => Settings;
  #mode: OutputMode = "fix";
  #destination: Destination | null = null;
  /** Captions still in flight; writing waits for them. */
  #captions = new Set<Promise<void>>();
  #transcript: TranscriptSegment[] = [];
  #transcriptions = new AbortController();
  #status: RecordingStatus = { phase: "idle", elapsedMs: 0, maxMs: MAX_RECORDING_MS };
  #display: Display | null = null;
  #sourceId: string | null = null;
  #startedAt = 0;
  #id = "";
  #ticker: ReturnType<typeof setInterval> | null = null;
  #cursor: CursorSample[] = [];
  #stopRequested = false;
  /** This recording's time limit. */
  #maxMs = MAX_RECORDING_MS;
  /** Kept after a failure so Retry can write again without recording again. */
  #frames: EvidenceFrame[] | null = null;
  /** Each sentence's audio, so one whose caption failed can be sent again. */
  #wavs = new Map<number, Uint8Array>();
  /** Dictate: the text selected when recording started, read while the mic opens. */
  #selection: Promise<string | null> = Promise.resolve(null);
  /** When start() and stop() were called, for the timing log. */
  #calledAt = 0;
  /** The latest result, kept so it can be pasted again (click-to-paste, the paste shortcut). */
  #payload: Payload | null = null;

  constructor({ recorder, access, settings }: RecordingControllerOptions) {
    super();
    this.#recorder = recorder;
    this.#access = access;
    this.#settings = settings;
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
    const busy: RecordingStatus["phase"][] = ["starting", "recording", "finalizing", "writing"];
    if (busy.includes(this.#status.phase)) return;
    this.#calledAt = Date.now();
    this.#display = display;
    this.#sourceId = null;
    this.#stopRequested = false;
    this.#cursor = [];
    this.#id = randomUUID();
    this.#resetTranscript();
    this.#mode = this.#settings().mode;
    this.#maxMs = this.#mode === "dictate" ? MAX_DICTATE_MS : MAX_RECORDING_MS;
    this.#frames = null;
    this.#route = this.#access();
    this.#destination = null;
    this.#set({
      phase: "starting",
      elapsedMs: 0,
      error: undefined,
      summary: undefined,
      result: undefined,
      pill: this.#settings().pill,
      sounds: this.#settings().sounds,
      maxMs: this.#maxMs,
      editing: false,
      canRetry: false,
      microphone: undefined,
      transcript: [],
      mode: this.#mode,
      targetName: undefined,
    });
    // Recording without a way to run it would only fail at the end, so it doesn't start.
    if (this.#route.length === 0) return this.#fail(NO_ACCESS);
    // Before any iVibe window shows: the app in front now is where the result goes.
    this.#destination = await detectDestination();
    console.log(`[iVibe timing] start: destination ${Date.now() - this.#calledAt} ms`);
    this.#set({ targetName: this.#destination.target.name });
    this.#selection = this.#readSelection();

    const options = {
      fps: 4,
      maxWidth: 1920,
      scaleFactor: display.scaleFactor,
      screen: this.#mode === "fix",
      microphone: this.#settings().microphone,
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

  /**
   * Dictate edits selected text when there is some. Not in terminals, where a paste adds to the
   * prompt instead of replacing anything.
   */
  #readSelection(): Promise<string | null> {
    const settings = this.#settings();
    const kind = this.#destination?.target.kind ?? "";
    if (
      this.#mode !== "dictate" ||
      !settings.dictateCleanup ||
      !settings.editSelection ||
      this.#route.length === 0 ||
      !this.#destination?.window ||
      kind.startsWith("terminal")
    ) {
      return Promise.resolve(null);
    }
    const id = this.#id;
    return selectedText().then((text) => {
      if (text && this.#id === id) this.#set({ editing: true });
      return text;
    });
  }

  async stop(): Promise<void> {
    if (this.#status.phase !== "recording") {
      if (this.#status.phase === "starting") this.#stopRequested = true;
      return;
    }
    const remaining = MIN_RECORDING_MS - (Date.now() - this.#startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    this.#clearTicker();
    this.#calledAt = Date.now();
    this.#set({ phase: "finalizing", elapsedMs: Date.now() - this.#startedAt });
    this.#send({ type: "stop" });
  }

  cancel(): void {
    if (this.#status.phase !== "recording" && this.#status.phase !== "starting") return;
    this.#clearTicker();
    this.#send({ type: "cancel" });
    this.#cursor = [];
    this.#resetTranscript();
    this.#set({ phase: "idle", elapsedMs: 0, transcript: [] });
  }

  /** Whether there is a result that can be pasted again. */
  get hasResult(): boolean {
    return this.#payload !== null && this.#status.result !== undefined;
  }

  /**
   * Pastes the latest result into a window the user chose by clicking into it or pressing the
   * paste shortcut, laid out for that app (images where they are accepted, file paths elsewhere).
   */
  async pasteResult(window: FocusedWindow): Promise<boolean> {
    const result = this.#status.result;
    if (!this.#payload || !result) return false;
    const target = classifyTarget(window.process, window.title);
    const outcome = await deliverPayload(this.#payload, window, target, true);
    if (this.#status.result !== result) return outcome.delivery === "pasted";
    this.#set({ result: { ...result, ...outcome, waiting: false } });
    return outcome.delivery === "pasted";
  }

  /**
   * Makes an earlier result (from History) the latest one, so clicking a text field or the paste
   * shortcut pastes it. Refused while a recording is in progress.
   */
  reuse(payload: Payload, result: RecordingResult): boolean {
    const { phase } = this.#status;
    if (phase !== "idle" && phase !== "review" && phase !== "error") return false;
    this.#payload = payload;
    this.#set({
      phase: "review",
      mode: result.mode,
      elapsedMs: 0,
      error: undefined,
      summary: undefined,
      transcript: [],
      targetName: undefined,
      result,
    });
    return true;
  }

  /** Stops waiting for a text field click; the result stays on the clipboard. */
  stopWaiting(): void {
    const result = this.#status.result;
    if (result?.waiting) this.#set({ result: { ...result, waiting: false } });
  }

  /** Back to idle after the user has seen or discarded the result. */
  reset(): void {
    if (this.#status.phase === "review" || this.#status.phase === "error") {
      this.#set({
        phase: "idle",
        elapsedMs: 0,
        error: undefined,
        summary: undefined,
        result: undefined,
      });
    }
  }

  handleRecorderEvent(event: RecorderEvent): void {
    switch (event.type) {
      case "started":
        this.#startedAt = Date.now();
        console.log(`[iVibe timing] start: capturing after ${this.#startedAt - this.#calledAt} ms`);
        this.#set({ phase: "recording", elapsedMs: 0, microphone: event.microphone });
        this.#startTicker();
        if (this.#stopRequested) void this.stop();
        break;
      case "level":
        // Forwarded to the UI and HUD by the caller.
        break;
      case "finished":
        console.log(
          `[iVibe timing] stop: capture finished after ${Date.now() - this.#calledAt} ms`,
        );
        this.#set({
          elapsedMs: event.summary.durationMs,
          summary: {
            ...event.summary,
            id: this.#id,
            startedAt: this.#startedAt,
            cursorSamples: this.#cursor.length,
          },
        });
        this.#frames = event.frames;
        void this.#write(event.frames);
        break;
      case "utterance": {
        this.#track(this.#caption(event.startMs, event.endMs, event.wav));
        break;
      }
      case "feedback":
        this.emit("feedback", event.feedback);
        break;
      case "cancelled":
        break;
      case "error":
        this.#fail(event.message);
        break;
    }
  }

  /** Writes the result for the recording's mode and pastes it where the user was (D20). */
  async #write(frames: EvidenceFrame[]): Promise<void> {
    // A retry after signing out and removing the key.
    if (this.#route.length === 0) return this.#fail(NO_ACCESS);
    const { signal } = this.#transcriptions;
    this.#set({ phase: "writing" });
    const waitStarted = Date.now();
    await Promise.all(this.#captions);
    if (signal.aborted) return;
    console.log(`[iVibe timing] ${this.#mode}: last captions ${Date.now() - waitStarted} ms`);

    const transcript = this.#transcript
      .filter((segment) => segment.state === "final")
      .map(({ startMs, text }) => ({ startMs, text }));
    if (transcript.length === 0 && (this.#mode !== "fix" || frames.length === 0)) {
      // Speech that couldn't be transcribed (network) can be tried again; silence can't.
      const failed = this.#transcript.some((segment) => segment.state === "failed");
      this.#fail(
        failed
          ? "Couldn't transcribe. Check your connection or key."
          : "No speech was heard, so there was nothing to paste.",
        failed,
      );
      return;
    }
    const settings = this.#settings();
    try {
      const destination = this.#destination ?? (await detectDestination());
      const selection = await this.#selection;
      const composed = await this.#withAccess((access) =>
        compose({
          id: this.#id,
          mode: this.#mode,
          destination,
          transcript,
          frames,
          access,
          autoPaste: settings.autoPaste,
          proofImages: settings.proofImages,
          personal: settings.personal,
          cleanup: settings.dictateCleanup,
          selection,
          draw: (drawing) =>
            this.#recorder().webContents.executeJavaScript(
              `window.ivibeRecorder.annotate(${JSON.stringify(drawing)})`,
            ) as Promise<string>,
        }),
      );
      if (signal.aborted) return;
      this.#payload = composed.payload;
      const waiting =
        composed.result.delivery === "copied" && settings.autoPaste && settings.clickToPaste;
      this.#set({ phase: "review", result: { ...composed.result, waiting } });
      this.emit("result", {
        id: this.#id,
        mode: this.#mode,
        createdAt: Date.now(),
        targetName: composed.result.targetName,
        delivery: composed.result.delivery,
        text: composed.payload.text,
        proof: composed.payload.proof.map((shot, index) => ({
          title: composed.result.proof[index]?.title ?? "",
          file: shot.file,
          line: shot.line,
        })),
      });
    } catch (error) {
      if (signal.aborted) return;
      this.#fail(error instanceof Error ? error.message : String(error), true);
    }
  }

  /**
   * After a failed write: sends any sentence whose caption failed again, then writes the result
   * from what was recorded, on the user's current key or account. Nothing is recorded again.
   */
  async retry(): Promise<void> {
    if (this.#status.phase !== "error" || !this.#status.canRetry || !this.#frames) return;
    this.#route = this.#access();
    // The pill goes straight back to working.
    this.#set({ phase: "writing", error: undefined, canRetry: false });
    for (const segment of this.#transcript) {
      const wav = this.#wavs.get(segment.id);
      if (segment.state !== "failed" || !wav) continue;
      this.#updateSegment(segment.id, { state: "pending" });
      this.#track(this.#transcribeSegment(segment.id, wav));
    }
    await this.#write(this.#frames);
  }

  #resetTranscript(): void {
    this.#transcriptions.abort();
    this.#transcriptions = new AbortController();
    this.#captions.clear();
    this.#wavs.clear();
    this.#transcript = [];
  }

  /** Writing waits for every caption still in flight. */
  #track(caption: Promise<void>): void {
    this.#captions.add(caption);
    void caption.finally(() => this.#captions.delete(caption));
  }

  #updateSegment(id: number, change: Partial<TranscriptSegment> | null): void {
    this.#transcript = change
      ? this.#transcript.map((segment) => (segment.id === id ? { ...segment, ...change } : segment))
      : this.#transcript.filter((segment) => segment.id !== id);
    this.#set({ transcript: this.#transcript });
  }

  /** Transcribes one sentence while recording continues; captions appear as each one returns. */
  async #caption(startMs: number, endMs: number, wav: Uint8Array): Promise<void> {
    if (this.#route.length === 0) return;
    const id = (this.#transcript.at(-1)?.id ?? -1) + 1;
    this.#transcript = [...this.#transcript, { id, startMs, endMs, state: "pending", text: "" }];
    this.#set({ transcript: this.#transcript });
    this.#wavs.set(id, wav);
    await this.#transcribeSegment(id, wav);
  }

  /** Sends one sentence to Voice Transcribe (again, on Retry) and updates its caption. */
  async #transcribeSegment(id: number, wav: Uint8Array): Promise<void> {
    const { signal } = this.#transcriptions;
    try {
      const languages = this.#settings().personal.spokenLanguages;
      const text = await this.#withAccess((access) => transcribe(wav, access, languages, signal));
      if (signal.aborted) return;
      // Coughs and clicks come back empty; drop them rather than show a blank caption.
      this.#updateSegment(id, text ? { state: "final", text } : null);
    } catch (error) {
      if (signal.aborted) return;
      console.warn("Live caption failed:", error instanceof Error ? error.message : error);
      this.#updateSegment(id, { state: "failed" });
    }
  }

  /**
   * Runs one Meta call on the first way in this recording's route. If that way is refused (no
   * Cloud credits left, the key rejected), it is dropped and the call runs on the next one.
   */
  async #withAccess<T>(work: (access: MetaAccess) => Promise<T>): Promise<T> {
    for (;;) {
      const access = this.#route[0];
      if (!access) throw new Error(NO_ACCESS);
      try {
        return await work(access);
      } catch (error) {
        const next = this.#route[1];
        if (!next || !shouldFallBack(access, error)) throw error;
        // Captions run in parallel: only the first to fail switches, and says so once.
        if (this.#route[0] === access) {
          this.#route = this.#route.slice(1);
          console.warn(`[iVibe] ${access.kind} refused, using ${next.kind}:`, String(error));
          this.emit("feedback", { type: "fallback", to: next.kind === "cloud" ? "cloud" : "key" });
        }
      }
    }
  }

  #fail(message: string, canRetry = false): void {
    this.#clearTicker();
    this.#set({ phase: "error", error: message, canRetry });
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
      if (elapsedMs >= this.#maxMs) void this.stop();
    }, CURSOR_SAMPLE_MS);
  }

  #clearTicker(): void {
    if (this.#ticker) clearInterval(this.#ticker);
    this.#ticker = null;
  }
}
