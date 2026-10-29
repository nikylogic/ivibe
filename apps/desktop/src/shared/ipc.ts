// SPDX-License-Identifier: AGPL-3.0-only

import type { AppLanguage } from "./languages.ts";
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

export type Appearance = "system" | "light" | "dark";

export type BackupFrequency = "off" | "daily" | "weekly" | "monthly";

/** The recording pill: a small waveform-only capsule, or the card with live captions. */
export type PillStyle = "compact" | "full";

/**
 * For someone with both an iVibe Cloud account and their own Meta key: which runs a recording.
 * "auto" is Cloud first on Pro (it is paid for) and the key first otherwise (it saves credits).
 */
export type RunOn = "auto" | "cloud" | "key";

export interface Settings {
  mode: OutputMode;
  /** Light or dark, or follow the system. */
  appearance: Appearance;
  /** The interface language (shared/languages.ts). */
  language: AppLanguage;
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
  /** How often History and settings are backed up to iVibe Cloud, end-to-end encrypted (Pro). */
  backupFrequency: BackupFrequency;
  /** The welcome screen was finished or skipped; it shows once. */
  welcomed: boolean;
  /** Dictate: Muse Spark tidies the words (fillers, self-corrections); off pastes them as heard. */
  dictateCleanup: boolean;
  /** Dictate with text selected: what you say edits it ("make this formal") or replaces it. */
  editSelection: boolean;
  /** How the recording pill looks. */
  pill: PillStyle;
  /** A soft sound when recording starts and stops. */
  sounds: boolean;
  /** Where the pill was dragged to, per display: an offset from its usual spot. */
  pillOffsets: Record<string, { dx: number; dy: number }>;
  /** With both a Cloud account and a key: which one a recording runs on first. */
  runOn: RunOn;
  /** When the first one can't run (no credits left, key refused), use the other. */
  runFallback: boolean;
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

/** Whether live captions run: they need a Cloud account or the user's Meta key. */
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
  /** How the pill looks for this recording, fixed when it starts. */
  pill?: PillStyle;
  /** Dictate found selected text: the result will replace it. */
  editing?: boolean;
  /** The microphone being recorded, as the system names it. */
  microphone?: string;
  /** The error came after recording; Retry writes the result again from what was recorded. */
  canRetry?: boolean;
  /** Start and stop sounds, from Settings. */
  sounds?: boolean;
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
export type RecordingFeedback =
  | { type: "secret"; label: string }
  | { type: "blackout" }
  /** The first way to reach Meta was refused, so this recording carries on with the other. */
  | { type: "fallback"; to: "cloud" | "key" };

export interface ByokStatus {
  hasKey: boolean;
  /** Last 4 characters, to show which key is stored. */
  hint?: string;
  /** False on Linux without a keyring: the key would be stored in plain text. */
  encryptionAvailable: boolean;
}

/** iVibe Cloud account, as the UI sees it (never the token). */
export interface CloudStatus {
  signedIn: boolean;
  /** GitHub login. */
  login?: string;
  /** GitHub display name, when the profile has one. */
  name?: string;
  /** The sidebar badge, decided by the server: pro | trial | free. */
  tier?: "pro" | "trial" | "free";
  /** 1 credit = 1 cent of Meta usage. */
  credits?: number;
  /**
   * The free trial: "available" (starts with the first Cloud recording), "granted", or why it
   * was refused ("device_limit", "network_limit", "account_too_new").
   */
  trial?: string;
  /** Credits the free trial gives. */
  trialCredits?: number;
  /** Waiting for the browser to come back from GitHub. */
  pending?: boolean;
  /** About the last sign-in: the free trial, or why it failed. */
  message?: string;
  /** iVibe Pro: the latest subscription, or null if there never was one. */
  plan?: CloudPlan | null;
  /** What Pro costs and gives; `available` is false until checkout is switched on. */
  planOffer?: { available: boolean; price: string; credits: number };
}

/** Settings → iVibe Cloud → Backup (main/backup.ts): end-to-end encrypted backups for iVibe Pro. */
export interface BackupStatus {
  signedIn: boolean;
  pro: boolean;
  /** A backup exists in iVibe Cloud. */
  setUp: boolean;
  /** This computer holds the key for it (in the OS keychain). */
  keyOnDevice: boolean;
  /** Epoch ms of the latest backup, or null. */
  lastBackupAt: number | null;
  /** Size of the backup in iVibe Cloud. */
  bytes: number;
  /** Set once Pro has ended: when the backup will be deleted (epoch ms). */
  deleteAfter: number | null;
  /** A backup, restore or download is running. */
  busy: "backup" | "restore" | "export" | null;
  /** The last thing that went wrong, in words for the user. */
  error: string | null;
  /** Couldn't reach iVibe Cloud for the status. */
  offline: boolean;
}

/** Billing → Usage: credits left and where the current period's credits went. */
export interface CloudUsage {
  available: number;
  /** Reserved by a run in progress. */
  held: number;
  /** Since the last Pro renewal ("billing") or the last 30 days ("30d"). */
  period: { from: string; kind: "billing" | "30d" };
  spent: number;
  added: number;
  byKind: { kind: string; runs: number; credits: number }[];
  recent: { kind: string; credits: number; at: string }[];
}

export interface CloudPlan {
  /** Dodo's state: active | on_hold | past_due | cancelled | expired | failed | … */
  status: string;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  arch: string;
}

/**
 * The app's own updates (main/updater.ts). On macOS (`canInstall` false) an update is downloaded
 * from the release page rather than installed by the app.
 */
export type UpdateStatus = UpdatePhase & { canInstall: boolean };

export type UpdatePhase =
  | { phase: "idle" | "checking" | "latest" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; version: string; percent: number }
  | { phase: "ready"; version: string }
  | { phase: "error"; message: string };

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
  | { type: "started"; width: number; height: number; microphone?: string }
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
  recordingRetry: "recording.retry",
  recordingGet: "recording.get",
  byokSet: "byok.set",
  byokClear: "byok.clear",
  byokStatus: "byok.status",
  cloudStatus: "cloud.status",
  cloudSignIn: "cloud.sign-in",
  cloudSignOut: "cloud.sign-out",
  cloudBilling: "cloud.billing",
  cloudUsage: "cloud.usage",
  appInfo: "app.info",
  updateStatus: "update.status",
  updateCheck: "update.check",
  /** Restarts into a downloaded update, or opens the download page on macOS. */
  updateInstall: "update.install",
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
  backupStatus: "backup.status",
  /** Makes a new key and returns the recovery key to show; nothing is uploaded yet. */
  backupBegin: "backup.begin",
  /** The user retyped part of the recovery key: turns backup on and runs the first one. */
  backupConfirm: "backup.confirm",
  backupNow: "backup.now",
  /** Connects this computer to an existing backup with its recovery key. */
  backupConnect: "backup.connect",
  backupRestore: "backup.restore",
  /** Saves the backup, decrypted, to a folder the user picks. */
  backupExport: "backup.export",
  backupReveal: "backup.reveal",
  /** Saves the recovery key to a text file the user picks. */
  backupSaveKey: "backup.save-key",
  backupDelete: "backup.delete",
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
  cloudChanged: "cloud.changed",
  backupChanged: "backup.changed",
  updateChanged: "update.changed",
  // recorder ↔ main
  recorderCommand: "recorder.command",
  recorderEvent: "recorder.event",
} as const;
