// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The IPC contract between the main process and the app's windows (docs/architecture.md §4.12).
 * Each window's preload exposes only its own subset.
 */

export type RecordingPhase = "idle" | "starting" | "recording" | "finalizing" | "review" | "error";

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
  hotkey: string;
  hotkeyRegistered: boolean;
}

/** Commands from the recorder window to main. */
export type RecorderEvent =
  | { type: "started"; width: number; height: number }
  | { type: "level"; rms: number }
  /** A finished sentence of narration as 16 kHz WAV, for live captions. Audio only, never frames. */
  | { type: "utterance"; startMs: number; endMs: number; wav: Uint8Array }
  | { type: "feedback"; feedback: RecordingFeedback }
  | { type: "finished"; summary: Omit<RecordingSummary, "id" | "startedAt" | "cursorSamples"> }
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
  // HUD → main
  hudInteractive: "hud.interactive",
  hudOpenApp: "hud.open-app",
  // main → UI / HUD (send)
  recordingState: "recording.state",
  recordingLevel: "recording.level",
  recordingFeedback: "recording.feedback",
  // recorder ↔ main
  recorderCommand: "recorder.command",
  recorderEvent: "recorder.event",
} as const;
