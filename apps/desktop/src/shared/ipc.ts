// SPDX-License-Identifier: AGPL-3.0-only

import type { Personal } from "@ivibe/engine";
import type { ShortcutMap } from "./shortcuts.ts";

/**
 * The IPC contract between the main process and the app's windows (docs/architecture.md §4.12).
 * Each window's preload exposes only its own subset.
 */

/** finalizing: capture stopped, redaction finishing; writing: Muse Spark is writing the result. */
export type RecordingPhase =
  "idle" | "starting" | "recording" | "finalizing" | "writing" | "review" | "error";

/**
 * What a recording turns into (docs/architecture.md D20): a fix prompt from screen and voice,
 * a prompt from voice only, or cleaned-up dictation.
 */
export type OutputMode = "fix" | "prompt" | "dictate";

export interface Settings {
  mode: OutputMode;
  /** Paste into the app that had focus; when off, results are only copied. */
  autoPaste: boolean;
  /** Fix mode: attach redacted screenshots as proof. */
  proofImages: boolean;
  /** Microphone label to record from; empty for the system default. */
  microphone: string;
  /** When a result could only be copied, paste it into the next text field the user clicks. */
  clickToPaste: boolean;
  /** What the user told iVibe about themselves (prompt stack layer 4). */
  personal: Personal;
  /** The global shortcut that records in each mode. */
  shortcuts: ShortcutMap;
  /** Keep finished results on this device, in History. */
  keepHistory: boolean;
}

/** A finished result kept in History (main/history.ts). Stored on this device only. */
export interface HistoryEntry {
  id: string;
  mode: OutputMode;
  /** Epoch milliseconds. */
  createdAt: number;
  /** The app it went to, or "the clipboard". */
  targetName: string;
  delivery: "pasted" | "copied";
  /** The prompt or text, without the proof section. */
  text: string;
  /** Annotated screenshots; `line` is the proof line pasted before each one. */
  proof: { title: string; file: string; line: string }[];
}

/** One entry with its screenshots' previews, for the open item in History. */
export interface HistoryDetail extends HistoryEntry {
  /** Data URLs in proof order; empty when a file has since been deleted. */
  previews: string[];
}

export interface RecordingResult {
  mode: OutputMode;
  text: string;
  /** Friendly name of the app it went to ("Claude Code"). */
  targetName: string;
  delivery: "pasted" | "copied";
  /** Screenshots that went with it: pasted images or files referenced by path. */
  proofImages: number;
  /** The annotated screenshots, oldest first. */
  proof: ProofImage[];
  /** Copied, and waiting for the user to click a text field to paste it there. */
  waiting?: boolean;
}

export interface ProofImage {
  /** What the screenshot proves. */
  title: string;
  /** The annotated PNG in the app's data folder. */
  file: string;
  /** A small JPEG data URL for the app and the pill. */
  preview: string;
}

export interface RecordingSummary {
  id: string;
  startedAt: number;
  durationMs: number;
  display: { width: number; height: number; scaleFactor: number };
  frames: {
    sampled: number;
    changed: number;
    keyframes: number;
    motion: number;
    appSwitches: number;
  };
  audio: { seconds: number; bytes: number; peakRms: number; silent: boolean };
  /** On-device OCR and redaction (docs/architecture.md §4.8–4.9). */
  privacy: {
    ocrEngine: string;
    framesScanned: number;
    lines: number;
    /** Redaction boxes per rule. */
    redactions: Record<string, number>;
    blackouts: number;
    ocrMsAverage: number;
  };
  cursorSamples: number;
}

/** One spoken sentence, transcribed while the user keeps recording (§4.6). */
export interface TranscriptSegment {
  id: number;
  /** Milliseconds from the start of the recording. */
  startMs: number;
  endMs: number;
  state: "pending" | "final" | "failed";
  text: string;
}

/** Whether live captions run: they need the user's Meta key, since audio goes to Meta. */
export type CaptionsMode = "on" | "no-key";

export interface RecordingStatus {
  phase: RecordingPhase;
  /** Milliseconds recorded so far (while recording) or in total (after). */
  elapsedMs: number;
  maxMs: number;
  error?: string;
  summary?: RecordingSummary;
  captions?: CaptionsMode;
  transcript?: TranscriptSegment[];
  /** The mode this recording runs in, fixed when it starts. */
  mode?: OutputMode;
  /** The app the result will go to, detected when recording starts. */
  targetName?: string;
  result?: RecordingResult;
}

/** A redacted keyframe sent to main for Fix mode. Only RedactedFrame pixels reach this type. */
export interface EvidenceFrame {
  id: string;
  tMs: number;
  jpeg: Uint8Array;
  width: number;
  height: number;
  /** OCR lines with secrets masked, boxes in this frame's pixels. */
  lines: EvidenceLine[];
}

/** A proof screenshot to draw in the recorder window (docs/architecture.md §5.7). */
export interface ProofDrawing {
  /** The redacted frame, as a JPEG data URL. */
  imageUrl: string;
  /** "0:04 · Save does nothing" */
  header: string;
  marks: {
    n: number;
    caption: string;
    box: { x: number; y: number; width: number; height: number };
  }[];
}

export interface EvidenceLine {
  /** "l3": the line's index in its frame. */
  id: string;
  text: string;
  box: { x: number; y: number; width: number; height: number };
}

/** Short-lived notes for the recording pill. */
export type RecordingFeedback = { type: "secret"; label: string } | { type: "blackout" };

export interface ByokStatus {
  hasKey: boolean;
  /** Last 4 characters, to show which key is stored. */
  hint?: string;
  /** False on Linux without a keyring: the key would be stored in plain text. */
  encryptionAvailable: boolean;
}

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  arch: string;
}

/** Which mode shortcuts are registered; false means another app holds the keys. */
export type ShortcutStatus = Record<OutputMode, boolean>;

/** A key press forwarded from main while the user records a new shortcut. */
export interface ShortcutKey {
  type: "down" | "up";
  /** KeyboardEvent.code, e.g. "CapsLock", "KeyD", "ControlLeft". */
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** Commands from the recorder window to main. */
export type RecorderEvent =
  | { type: "started"; width: number; height: number }
  | { type: "level"; rms: number }
  /** A finished sentence of narration as 16 kHz WAV, for live captions. Audio only, never frames. */
  | { type: "utterance"; startMs: number; endMs: number; wav: Uint8Array }
  | { type: "feedback"; feedback: RecordingFeedback }
  | {
      type: "finished";
      summary: Omit<RecordingSummary, "id" | "startedAt" | "cursorSamples">;
      /** Fix mode only: redacted keyframes picked for the model. */
      frames: EvidenceFrame[];
    }
  | { type: "cancelled" }
  | { type: "error"; message: string };

/** Commands from main to the recorder window (start goes through executeJavaScript). */
export type RecorderCommand = { type: "stop" } | { type: "cancel" };

export const Channels = {
  // UI → main (invoke)
  recordingStart: "recording.start",
  recordingStop: "recording.stop",
  recordingCancel: "recording.cancel",
  recordingGet: "recording.get",
  byokSet: "byok.set",
  byokClear: "byok.clear",
  byokStatus: "byok.status",
  appInfo: "app.info",
  settingsGet: "settings.get",
  settingsSet: "settings.set",
  resultCopy: "result.copy",
  proofOpen: "result.proof-open",
  shortcutsStatus: "shortcuts.status",
  historyList: "history.list",
  historyGet: "history.get",
  historyCopy: "history.copy",
  /** Makes an entry the latest result, so a click or the paste shortcut pastes it. */
  historyReuse: "history.reuse",
  historyOpenProof: "history.open-proof",
  historyDelete: "history.delete",
  historyClear: "history.clear",
  /** Lets the UI hear the current shortcuts while the user records a new one. */
  shortcutsPause: "shortcuts.pause",
  // HUD → main
  hudInteractive: "hud.interactive",
  hudOpenApp: "hud.open-app",
  hudExpand: "hud.expand",
  hudDismiss: "hud.dismiss",
  // main → UI / HUD (send)
  recordingState: "recording.state",
  recordingLevel: "recording.level",
  recordingFeedback: "recording.feedback",
  settingsChanged: "settings.changed",
  shortcutsChanged: "shortcuts.changed",
  shortcutsKey: "shortcuts.key",
  historyChanged: "history.changed",
  // recorder ↔ main
  recorderCommand: "recorder.command",
  recorderEvent: "recorder.event",
} as const;
