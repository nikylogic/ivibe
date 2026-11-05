// SPDX-License-Identifier: AGPL-3.0-only

/** Every screen and state the Lab shows. Add one here and it appears in the sidebar. */

import { EMPTY_PERSONAL } from "@ivibe/engine";
import type {
  AppInfo,
  BackupStatus,
  ByokStatus,
  CloudPlan,
  CloudStatus,
  CloudUsage,
  HistoryEntry,
  OutputMode,
  PillStyle,
  RecordingFeedback,
  RecordingResult,
  RecordingStatus,
  Settings,
  ShortcutStatus,
  UpdateStatus,
} from "../src/shared/ipc.ts";
import { defaultShortcuts } from "../src/shared/shortcuts.ts";

export interface LabState {
  settings: Settings;
  byok: ByokStatus;
  cloud: CloudStatus;
  usage: CloudUsage | null;
  backup: BackupStatus;
  update: UpdateStatus;
  history: HistoryEntry[];
  recording: RecordingStatus;
  shortcuts: ShortcutStatus;
  info: AppInfo;
  proofPreview: string;
}

export interface Scenario {
  id: string;
  group: string;
  label: string;
  window: "ui" | "hud";
  state: LabState;
  /** Buttons to press, in order, to reach the screen. */
  steps?: string[];
  feedback?: RecordingFeedback;
  hover?: boolean;
}

/** A made-up screenshot, marked up the way proof images are. */
const PROOF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#e8e4da"/><rect x="24" y="24" width="432" height="252" rx="8" fill="#fdfcf9"/><rect x="48" y="52" width="180" height="14" rx="4" fill="#d9d4c9"/><rect x="48" y="84" width="340" height="10" rx="4" fill="#efebe3"/><rect x="48" y="104" width="300" height="10" rx="4" fill="#efebe3"/><rect x="48" y="196" width="96" height="34" rx="8" fill="#1b1a17"/><rect x="40" y="188" width="112" height="50" rx="10" fill="none" stroke="#e5484d" stroke-width="3"/><circle cx="152" cy="188" r="13" fill="#e5484d"/><text x="152" y="193" font-size="14" font-family="sans-serif" fill="#fff" text-anchor="middle">1</text></svg>`;
const PROOF_PREVIEW = `data:image/svg+xml,${encodeURIComponent(PROOF_SVG)}`;

const OFFER = { available: true, price: "$8", credits: 400 };
const NOW = Date.UTC(2026, 10, 5, 9, 30);
const DAY = 86_400_000;
const IN_A_MONTH = new Date(NOW + 30 * DAY).toISOString();

const SIGNED_OUT: CloudStatus = { signedIn: false, planOffer: OFFER };
const TRIAL: CloudStatus = {
  signedIn: true,
  login: "octocat",
  name: "Mona Lisa",
  tier: "trial",
  credits: 42,
  trial: "granted",
  trialCredits: 50,
  plan: null,
  planOffer: OFFER,
};
const proWith = (plan: Partial<CloudPlan>): CloudStatus => ({
  ...TRIAL,
  login: "you@example.com",
  tier: "pro",
  credits: 318,
  plan: { status: "active", renewsAt: IN_A_MONTH, cancelAtPeriodEnd: false, ...plan },
});
const PRO = proWith({});

const USAGE: CloudUsage = {
  available: 318,
  held: 0,
  period: { from: new Date(NOW - 12 * DAY).toISOString(), kind: "billing" },
  spent: 82,
  added: 400,
  byKind: [
    { kind: "fix", runs: 14, credits: 56 },
    { kind: "prompt", runs: 11, credits: 19 },
    { kind: "dictate", runs: 31, credits: 7 },
  ],
  recent: [
    { kind: "fix", credits: 4, at: new Date(NOW - 3_600_000).toISOString() },
    { kind: "dictate", credits: 1, at: new Date(NOW - 7_200_000).toISOString() },
    { kind: "prompt", credits: 2, at: new Date(NOW - DAY).toISOString() },
  ],
};

const NO_BACKUP: BackupStatus = {
  signedIn: true,
  pro: true,
  setUp: false,
  keyOnDevice: false,
  lastBackupAt: null,
  bytes: 0,
  deleteAfter: null,
  busy: null,
  error: null,
  offline: false,
};
const BACKED_UP: BackupStatus = {
  ...NO_BACKUP,
  setUp: true,
  keyOnDevice: true,
  lastBackupAt: NOW - 2 * DAY,
  bytes: 4_300_000,
};

const proof = [
  {
    title: "Save does nothing",
    file: "proof-1.png",
    line: "Proof 1: Save does nothing",
  },
];
const HISTORY: HistoryEntry[] = [
  {
    id: "h1",
    mode: "fix",
    createdAt: NOW - 3_600_000,
    targetName: "Claude Code",
    delivery: "pasted",
    text: "The Save button on the settings form does nothing when clicked. No request is sent and no error shows. Find its click handler and make it submit the form.",
    proof,
  },
  {
    id: "h2",
    mode: "prompt",
    createdAt: NOW - 2 * DAY,
    targetName: "Cursor",
    delivery: "pasted",
    text: "Add a dark mode switch to the settings page. It should follow the system by default and remember the choice.",
    proof: [],
  },
  {
    id: "h3",
    mode: "dictate",
    createdAt: NOW - 9 * DAY,
    targetName: "the clipboard",
    delivery: "copied",
    text: "Let's move the launch to Tuesday, and I'll send everyone the new plan today.",
    proof: [],
  },
];
const LONG_ENTRY: HistoryEntry = {
  id: "long",
  mode: "fix",
  createdAt: NOW - 600_000,
  targetName: "A very long application name that goes on and on for a while",
  delivery: "pasted",
  text: Array.from(
    { length: 30 },
    (_, index) =>
      `Step ${index + 1}: reproduce the failure on the checkout page and record what the network tab shows at /api/orders/averyveryveryveryveryverylongidentifierwithoutspaces.`,
  ).join("\n"),
  proof: [...proof, { ...proof[0]!, title: "The order never arrives", file: "proof-2.png" }],
};

const IDLE: RecordingStatus = { phase: "idle", elapsedMs: 0, maxMs: 300_000 };

const BASE: LabState = {
  settings: {
    mode: "fix",
    appearance: "system",
    language: "en",
    autoPaste: true,
    proofImages: true,
    microphone: "",
    clickToPaste: true,
    personal: EMPTY_PERSONAL,
    shortcuts: defaultShortcuts("win32"),
    keepHistory: true,
    backupFrequency: "off",
    welcomed: true,
    dictateCleanup: true,
    editSelection: true,
    pill: "compact",
    sounds: false,
    pillVisibleInCaptures: false,
    pillOffsets: {},
    runOn: "auto",
    runFallback: true,
  },
  byok: { hasKey: false, encryptionAvailable: true },
  cloud: TRIAL,
  usage: USAGE,
  backup: { ...NO_BACKUP, pro: false },
  update: { phase: "idle", canInstall: true },
  history: HISTORY,
  recording: IDLE,
  shortcuts: { fix: true, prompt: true, dictate: true },
  info: { version: "0.1.6", platform: "win32", arch: "x64" },
  proofPreview: PROOF_PREVIEW,
};

type Change = Omit<Partial<LabState>, "settings"> & { settings?: Partial<Settings> };
const state = (change: Change = {}): LabState => ({
  ...BASE,
  ...change,
  settings: { ...BASE.settings, ...change.settings },
});

const WELCOME = { welcomed: false };
const OPEN_SETTINGS = ['@button[aria-label$="Account menu"]', "Settings"];

const list: Scenario[] = [];
const add = (
  group: string,
  id: string,
  label: string,
  change: Change = {},
  more: Pick<Scenario, "steps" | "feedback" | "hover"> = {},
  window: Scenario["window"] = "ui",
) => list.push({ id, group, label, window, state: state(change), ...more });

add("Welcome", "welcome", "First run", { cloud: SIGNED_OUT, settings: WELCOME });
add("Welcome", "welcome-pending", "Waiting for the browser", {
  cloud: { ...SIGNED_OUT, pending: true },
  settings: WELCOME,
});
add("Welcome", "welcome-failed", "Sign-in failed", {
  cloud: { ...SIGNED_OUT, message: "Google didn’t confirm your sign-in. Try again." },
  settings: WELCOME,
});

const RESULT: RecordingResult = {
  mode: "fix",
  text: HISTORY[0]!.text,
  targetName: "Claude Code",
  delivery: "pasted",
  proofImages: 1,
  proof: [{ ...proof[0]!, preview: PROOF_PREVIEW }],
};
const SAID = [
  {
    id: 1,
    startMs: 0,
    endMs: 3000,
    state: "final" as const,
    text: "The save button does nothing.",
  },
];
const running = (change: Partial<RecordingStatus>): RecordingStatus => ({
  ...IDLE,
  mode: "fix",
  microphone: "Studio Microphone",
  targetName: "Claude Code",
  elapsedMs: 14_000,
  ...(change.phase === "recording" || change.phase === "starting" ? {} : { transcript: SAID }),
  ...change,
});
const ERROR = running({
  phase: "error",
  error: "Couldn’t reach Muse Spark. Your recording is safe.",
  canRetry: true,
});

add("Record", "record", "Ready, on the trial");
add("Record", "record-empty", "Signed out, no key, skipped welcome", {
  cloud: SIGNED_OUT,
});
add("Record", "record-pro", "On Pro", { cloud: PRO });
add("Record", "record-no-credits", "Out of credits", {
  cloud: { ...TRIAL, credits: 0 },
});
add("Record", "record-key", "Own key only", {
  cloud: SIGNED_OUT,
  byok: { hasKey: true, hint: "x7Qa", encryptionAvailable: true },
});
add("Record", "record-recording", "Recording", {
  recording: running({ phase: "recording" }),
});
add("Record", "record-writing", "Writing", {
  recording: running({ phase: "writing" }),
});
add("Record", "record-result", "Result, pasted with proof", {
  recording: running({ phase: "review", result: RESULT }),
});
add("Record", "record-error", "Failed, can retry", { recording: ERROR });
add("Record", "record-shortcut", "Another app holds a shortcut", {
  shortcuts: { fix: false, prompt: true, dictate: true },
});
add("Record", "record-backup-ending", "Backup about to be deleted", {
  cloud: { ...TRIAL, plan: { status: "expired", renewsAt: null, cancelAtPeriodEnd: false } },
  backup: { ...BACKED_UP, pro: false, deleteAfter: NOW + 3 * DAY },
});

add("History", "history", "Full", {}, { steps: ["History"] });
add("History", "history-empty", "Empty", { history: [] }, { steps: ["History"] });
add(
  "History",
  "history-long",
  "Very long entry, opened",
  { history: [LONG_ENTRY, ...HISTORY] },
  { steps: ["History", "@main button[aria-expanded]"] },
);
add(
  "History",
  "history-off",
  "History turned off",
  { history: [], settings: { keepHistory: false } },
  { steps: ["History"] },
);

for (const [id, label] of [
  ["general", "General"],
  ["system", "System"],
  ["shortcuts", "Shortcuts"],
  ["cloud", "iVibe Cloud"],
  ["billing", "Billing"],
  ["key", "Meta API key"],
  ["personal", "Personal"],
  ["microphone", "Microphone"],
  ["privacy", "Privacy"],
  ["about", "About"],
] as const) {
  add("Settings", `settings-${id}`, label, {}, { steps: [...OPEN_SETTINGS, label] });
}

const cloudPage = { steps: [...OPEN_SETTINGS, "iVibe Cloud"] };
const billingPage = { steps: [...OPEN_SETTINGS, "Billing"] };
const keyPage = { steps: [...OPEN_SETTINGS, "Meta API key"] };
const aboutPage = { steps: [...OPEN_SETTINGS, "About"] };
const shortcutsPage = { steps: [...OPEN_SETTINGS, "Shortcuts"] };

add("Account", "cloud-signed-out", "Cloud, signed out", { cloud: SIGNED_OUT }, cloudPage);
add(
  "Account",
  "cloud-pending",
  "Cloud, waiting for the browser",
  {
    cloud: { ...SIGNED_OUT, pending: true },
  },
  cloudPage,
);
add(
  "Account",
  "cloud-refused",
  "Cloud, trial refused",
  {
    cloud: { ...TRIAL, tier: "free", credits: 0, trial: "device_limit" },
  },
  cloudPage,
);
add(
  "Account",
  "cloud-google",
  "Cloud, long Google address",
  {
    cloud: {
      ...TRIAL,
      login: "a.person.with.a.very.long.address@a-long-company-name.example.com",
      name: undefined,
    },
  },
  cloudPage,
);
add("Account", "billing-pro", "Billing, Pro", { cloud: PRO }, billingPage);
add(
  "Account",
  "billing-cancelling",
  "Billing, cancelling",
  {
    cloud: proWith({ cancelAtPeriodEnd: true }),
  },
  billingPage,
);
add(
  "Account",
  "billing-past-due",
  "Billing, payment failed",
  {
    cloud: proWith({ status: "past_due" }),
  },
  billingPage,
);
add(
  "Account",
  "billing-expired",
  "Billing, Pro ended",
  {
    cloud: {
      ...TRIAL,
      tier: "free",
      credits: 0,
      plan: { status: "expired", renewsAt: null, cancelAtPeriodEnd: false },
    },
  },
  billingPage,
);
add(
  "Account",
  "billing-closed",
  "Billing, Pro not on sale",
  {
    cloud: { ...TRIAL, planOffer: { ...OFFER, available: false } },
  },
  billingPage,
);
add(
  "Account",
  "billing-offline",
  "Billing, no usage (offline)",
  { cloud: PRO, usage: null },
  billingPage,
);
add(
  "Account",
  "key-saved",
  "Key saved",
  {
    byok: { hasKey: true, hint: "x7Qa", encryptionAvailable: true },
  },
  keyPage,
);
add(
  "Account",
  "key-both",
  "Key and Cloud together",
  {
    cloud: PRO,
    byok: { hasKey: true, hint: "x7Qa", encryptionAvailable: true },
  },
  keyPage,
);
add(
  "Account",
  "key-plain",
  "No keyring on Linux",
  {
    byok: { hasKey: false, encryptionAvailable: false },
    info: { version: "0.1.6", platform: "linux", arch: "x64" },
  },
  keyPage,
);
add(
  "Account",
  "shortcuts-taken",
  "Shortcuts, one taken",
  {
    shortcuts: { fix: true, prompt: false, dictate: true },
  },
  shortcutsPage,
);

add("Backup", "backup-new", "Pro, not set up", { cloud: PRO, backup: NO_BACKUP }, cloudPage);
add(
  "Backup",
  "backup-on",
  "Backed up",
  {
    cloud: PRO,
    backup: BACKED_UP,
    settings: { backupFrequency: "weekly" },
  },
  cloudPage,
);
add(
  "Backup",
  "backup-busy",
  "Backing up now",
  {
    cloud: PRO,
    backup: { ...BACKED_UP, busy: "backup" },
  },
  cloudPage,
);
add(
  "Backup",
  "backup-no-key",
  "On a new computer, no key",
  {
    cloud: PRO,
    backup: { ...BACKED_UP, keyOnDevice: false },
  },
  cloudPage,
);
add(
  "Backup",
  "backup-error",
  "Backup failed",
  {
    cloud: PRO,
    backup: { ...BACKED_UP, error: "The backup didn’t finish. iVibe will try again." },
  },
  cloudPage,
);
add(
  "Backup",
  "backup-offline",
  "Offline",
  {
    cloud: PRO,
    backup: { ...BACKED_UP, offline: true },
  },
  cloudPage,
);
add(
  "Backup",
  "backup-ending",
  "Pro ended, deletion coming",
  {
    cloud: { ...TRIAL, plan: { status: "expired", renewsAt: null, cancelAtPeriodEnd: false } },
    backup: { ...BACKED_UP, pro: false, deleteAfter: NOW + 3 * DAY },
  },
  cloudPage,
);

for (const [id, label, update] of [
  ["latest", "Up to date", { phase: "latest", canInstall: true }],
  ["available", "Update found", { phase: "available", version: "0.1.7", canInstall: true }],
  [
    "downloading",
    "Downloading",
    { phase: "downloading", version: "0.1.7", percent: 62, canInstall: true },
  ],
  ["ready", "Ready to install", { phase: "ready", version: "0.1.7", canInstall: true }],
  [
    "mac",
    "Mac, from the release page",
    { phase: "available", version: "0.1.7", canInstall: false },
  ],
  [
    "error",
    "Update failed",
    { phase: "error", message: "Couldn’t reach GitHub.", canInstall: true },
  ],
] as [string, string, UpdateStatus][]) {
  add(
    "Updates",
    `update-${id}`,
    label,
    {
      update,
      ...(id === "mac"
        ? { info: { version: "0.1.6", platform: "darwin", arch: "arm64" } as AppInfo }
        : {}),
    },
    aboutPage,
  );
}

const pill = (
  id: string,
  label: string,
  recording: Partial<RecordingStatus>,
  more: Pick<Scenario, "feedback" | "hover"> = {},
  style: PillStyle = "compact",
  mode: OutputMode = "fix",
) =>
  add(
    style === "compact" ? "Pill, small" : "Pill, card",
    `pill-${style}-${id}`,
    label,
    { recording: running({ mode, pill: style, ...recording }) },
    more,
    "hud",
  );

for (const style of ["compact", "full"] as const) {
  pill("starting", "Starting", { phase: "starting", elapsedMs: 0 }, {}, style);
  pill("fix", "Recording, Fix", { phase: "recording" }, {}, style);
  pill("prompt", "Recording, Prompt", { phase: "recording" }, {}, style, "prompt");
  pill("dictate", "Recording, Dictate", { phase: "recording" }, {}, style, "dictate");
  pill(
    "editing",
    "Dictating over a selection",
    { phase: "recording", editing: true },
    {},
    style,
    "dictate",
  );
  pill(
    "captions",
    "With live captions",
    {
      phase: "recording",
      transcript: [
        { id: 1, startMs: 0, endMs: 3000, state: "final", text: "The save button does nothing." },
        { id: 2, startMs: 3000, endMs: 6000, state: "pending", text: "" },
      ],
    },
    {},
    style,
  );
  pill(
    "secret",
    "Hid a secret",
    { phase: "recording" },
    { feedback: { type: "secret", label: "API key" } },
    style,
  );
  pill(
    "blackout",
    "Hid a window",
    { phase: "recording" },
    { feedback: { type: "blackout" } },
    style,
  );
  pill(
    "fallback",
    "Fell back to Cloud",
    { phase: "recording" },
    { feedback: { type: "fallback", to: "cloud" } },
    style,
  );
  pill("hover", "Hovered", { phase: "recording" }, { hover: true }, style);
  pill("finalizing", "Finishing up", { phase: "finalizing" }, {}, style);
  pill("writing", "Writing", { phase: "writing" }, {}, style);
  // Main closes the small pill as soon as a result is in, so only the card has these.
  if (style === "full") {
    pill("pasted", "Pasted", { phase: "review", result: RESULT }, {}, style);
    pill(
      "copied",
      "Copied, click to paste",
      {
        phase: "review",
        result: { ...RESULT, delivery: "copied", waiting: true, proof: [], proofImages: 0 },
      },
      {},
      style,
    );
  }
  pill(
    "error",
    "Failed, can retry",
    { phase: "error", error: ERROR.error, canRetry: true },
    {},
    style,
  );
  pill(
    "error-final",
    "Failed, no retry",
    {
      phase: "error",
      error: "Your microphone stopped working.",
      canRetry: false,
    },
    {},
    style,
  );
}

export const SCENARIOS = list;

export function scenarioById(id: string): Scenario {
  return list.find((scenario) => scenario.id === id) ?? list[0]!;
}
