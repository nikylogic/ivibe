// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Stands in for the Electron main process, so the app's real screens run in a browser tab. The types
 * come from the real preloads: if the app's bridge changes, this stops compiling.
 *
 * Nothing here reaches a real account, key or server. Buttons do what they would do, with made-up
 * results, and every call shows in the Lab's log.
 */

import type { HudApi } from "../src/preload/hud.ts";
import type { IvibeApi } from "../src/preload/ui.ts";
import type {
  OutputMode,
  RecordingFeedback,
  RecordingStatus,
  HistoryEntry,
} from "../src/shared/ipc.ts";
import { scenarioById } from "./scenarios.ts";
import type { LabState } from "./scenarios.ts";

const params = new URLSearchParams(location.search);

// A frame can't be told the system's theme, so it is told what the Lab's switch says.
const forced = params.get("theme");
if (forced === "light" || forced === "dark") {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => {
    if (!query.includes("prefers-color-scheme")) return real(query);
    const media = real("(min-width: 0px)");
    const matches = query.includes("dark") ? forced === "dark" : forced === "light";
    return new Proxy(media, {
      get: (target, key) => {
        if (key === "matches") return matches;
        if (key === "media") return query;
        const value = Reflect.get(target, key) as unknown;
        return typeof value === "function" ? (value.bind(target) as unknown) : value;
      },
    });
  };
  document.documentElement.style.colorScheme = forced;
}

const scenario = scenarioById(params.get("scenario") ?? "");
const state: LabState = structuredClone(scenario.state);

/** Tells the Lab's page, so what the app asks for can be read beside it. */
const tell = (message: Record<string, unknown>) => window.parent.postMessage(message, "*");

function channel<T>() {
  const listeners = new Set<(value: T) => void>();
  return {
    on: (listener: (value: T) => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    emit: (value: T) => listeners.forEach((listener) => listener(value)),
    size: () => listeners.size,
  };
}

const recordingChannel = channel<RecordingStatus>();
const levelChannel = channel<number>();
const settingsChannel = channel<LabState["settings"]>();
const cloudChannel = channel<LabState["cloud"]>();
const backupChannel = channel<LabState["backup"]>();
const updateChannel = channel<LabState["update"]>();
const historyChannel = channel<HistoryEntry[]>();
const shortcutChannel = channel<LabState["shortcuts"]>();
const hoverChannel = channel<boolean>();
const feedbackChannel = channel<RecordingFeedback>();

const setRecording = (change: Partial<RecordingStatus>) => {
  state.recording = { ...state.recording, ...change };
  recordingChannel.emit(state.recording);
};

const later = (ms: number, then: () => void) => void setTimeout(then, ms);

/** A narrated voice for the waveform, while recording. */
setInterval(() => {
  if (state.recording.phase !== "recording") return;
  const s = performance.now() / 1000;
  levelChannel.emit(0.012 + 0.05 * (0.5 + 0.5 * Math.sin(s * 1.7)) * Math.abs(Math.sin(s * 7.3)));
}, 50);

const FINISHED_TEXT: Record<OutputMode, string> = {
  fix: "The Save button on the settings form does nothing. Find its click handler and make it submit.",
  prompt: "Add a dark mode switch to the settings page that remembers the choice.",
  dictate: "Let's move the launch to Tuesday, and I'll send everyone the new plan today.",
};

/** The steps of a real recording, quicker. */
function finish(): void {
  const mode = state.recording.mode ?? state.settings.mode;
  setRecording({ phase: "finalizing" });
  later(700, () => setRecording({ phase: "writing" }));
  later(2400, () =>
    setRecording({
      phase: "review",
      result: {
        mode,
        text: FINISHED_TEXT[mode],
        targetName: "Claude Code",
        delivery: "pasted",
        proofImages: 0,
        proof: [],
      },
    }),
  );
}

let clock = 0;
function start(): void {
  setRecording({
    phase: "starting",
    elapsedMs: 0,
    error: undefined,
    canRetry: undefined,
    result: undefined,
    mode: state.settings.mode,
    pill: state.settings.pill,
    microphone: "Studio Microphone",
    targetName: "Claude Code",
  });
  later(500, () => {
    setRecording({ phase: "recording" });
    window.clearInterval(clock);
    clock = window.setInterval(() => {
      if (state.recording.phase !== "recording") return window.clearInterval(clock);
      setRecording({ elapsedMs: state.recording.elapsedMs + 1000 });
    }, 1000);
  });
}

const stopped = () => {
  window.clearInterval(clock);
  finish();
};

const copied = () => tell({ type: "note", text: "Copied (not really)" });

const rawUi: IvibeApi = {
  recording: {
    start: async () => start(),
    stop: async () => stopped(),
    cancel: async () => {
      window.clearInterval(clock);
      setRecording({ phase: "idle", elapsedMs: 0 });
    },
    retry: async () => finish(),
    get: async () => state.recording,
    onState: recordingChannel.on,
    onLevel: levelChannel.on,
    copyResult: async () => copied(),
    openProof: async () => undefined,
  },
  settings: {
    get: async () => state.settings,
    set: async (change) => {
      state.settings = { ...state.settings, ...change };
      settingsChannel.emit(state.settings);
      return state.settings;
    },
    onChange: settingsChannel.on,
  },
  byok: {
    set: async (key) => {
      state.byok = { ...state.byok, hasKey: true, hint: key.slice(-4) };
      return state.byok;
    },
    clear: async () => {
      state.byok = { ...state.byok, hasKey: false, hint: undefined };
      return state.byok;
    },
    status: async () => state.byok,
  },
  cloud: {
    status: async () => state.cloud,
    signIn: async (provider) => {
      state.cloud = { ...state.cloud, pending: true };
      cloudChannel.emit(state.cloud);
      later(1800, () => {
        state.cloud = {
          ...state.cloud,
          signedIn: true,
          pending: false,
          tier: "trial",
          credits: 50,
          trial: "available",
          login: provider === "google" ? "you@example.com" : "octocat",
        };
        cloudChannel.emit(state.cloud);
      });
    },
    signOut: async () => {
      state.cloud = { signedIn: false, planOffer: state.cloud.planOffer };
      cloudChannel.emit(state.cloud);
      return state.cloud;
    },
    billing: async () => undefined,
    usage: async () => state.usage,
    onChange: cloudChannel.on,
  },
  backup: {
    status: async () => state.backup,
    begin: async () => "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ",
    confirm: async () => {
      state.backup = { ...state.backup, setUp: true, keyOnDevice: true, lastBackupAt: Date.now() };
      backupChannel.emit(state.backup);
      return state.backup;
    },
    now: async () => {
      state.backup = { ...state.backup, busy: "backup" };
      backupChannel.emit(state.backup);
      later(1500, () => {
        state.backup = { ...state.backup, busy: null, lastBackupAt: Date.now() };
        backupChannel.emit(state.backup);
      });
    },
    connect: async () => {
      state.backup = { ...state.backup, keyOnDevice: true };
      backupChannel.emit(state.backup);
      return state.backup;
    },
    restore: async () => state.history.length,
    exportTo: async () => "C:\\Users\\you\\Documents\\iVibe backup",
    reveal: async () => "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ",
    saveKey: async () => true,
    remove: async () => {
      state.backup = { ...state.backup, setUp: false, keyOnDevice: false, lastBackupAt: null };
      backupChannel.emit(state.backup);
      return state.backup;
    },
    onChange: backupChannel.on,
  },
  app: {
    info: async () => state.info,
    update: {
      status: async () => state.update,
      check: async () => {
        state.update = { phase: "checking", canInstall: state.update.canInstall };
        updateChannel.emit(state.update);
        later(1200, () => {
          state.update = { phase: "latest", canInstall: state.update.canInstall };
          updateChannel.emit(state.update);
        });
        return state.update;
      },
      install: async () => undefined,
      onChange: updateChannel.on,
    },
  },
  history: {
    list: async () => state.history,
    get: async (id) => {
      const entry = state.history.find((item) => item.id === id);
      return entry ? { ...entry, previews: entry.proof.map(() => state.proofPreview) } : null;
    },
    copy: async () => copied(),
    reuse: async () => true,
    openProof: async () => undefined,
    remove: async (id) => {
      state.history = state.history.filter((item) => item.id !== id);
      historyChannel.emit(state.history);
    },
    clear: async () => {
      state.history = [];
      historyChannel.emit(state.history);
    },
    onChange: historyChannel.on,
  },
  shortcuts: {
    status: async () => state.shortcuts,
    pause: async () => undefined,
    onChange: shortcutChannel.on,
    onKey: () => () => undefined,
  },
};

const rawHud: HudApi = {
  stop: async () => stopped(),
  cancel: async () => setRecording({ phase: "idle", elapsedMs: 0 }),
  retry: async () => finish(),
  openApp: async () => undefined,
  // The real pill's window grows to fit its panel; here the Lab's frame does.
  expand: async (expanded) => tell({ type: "hud-expand", expanded }),
  dismiss: async () => setRecording({ phase: "idle", elapsedMs: 0 }),
  copyResult: async () => copied(),
  openProof: async () => undefined,
  setPillRect: () => undefined,
  onHover: hoverChannel.on,
  onFeedback: feedbackChannel.on,
  onState: (listener) => {
    const off = recordingChannel.on(listener);
    // The pill has no way to ask; main tells it as a recording starts.
    later(0, () => listener(state.recording));
    return off;
  },
  onLevel: levelChannel.on,
};

/** Reports every call the app makes, other than the many that only ask or listen. */
function logged<T extends object>(target: T, path: string): T {
  // Each stays the same object from read to read, as the real bridge does: the app's effects
  // depend on it, and a new function every time would restart them forever.
  const made = new Map<string | symbol, unknown>();
  return new Proxy(target, {
    get(object, key) {
      if (made.has(key)) return made.get(key);
      const value = Reflect.get(object, key) as unknown;
      const name = path ? `${path}.${String(key)}` : String(key);
      let wrapped = value;
      if (typeof value === "function") {
        wrapped = (...args: unknown[]) => {
          const quiet = /\.?(on[A-Z]\w*|get|status|list|usage|info|setPillRect)$/.test(name);
          if (!quiet) tell({ type: "call", name, args: name === "byok.set" ? ["(a key)"] : args });
          return (value as (...inner: unknown[]) => unknown)(...args);
        };
      } else if (value && typeof value === "object") {
        wrapped = logged(value, name);
      }
      made.set(key, wrapped);
      return wrapped;
    },
  });
}

window.ivibe = logged(rawUi, "");
window.ivibeHud = logged(rawHud, "hud");

/** Plays a note on the pill once the pill is listening. */
if (scenario.feedback) {
  const note = scenario.feedback;
  later(900, () => feedbackChannel.emit(note));
}
if (scenario.hover) later(600, () => hoverChannel.emit(true));

/** Clicks through the app as a person would, to reach a screen that has no address of its own. */
function press(step: string): boolean {
  const controls = [
    ...document.querySelectorAll<HTMLElement>('button, a, [role="menuitem"], [role="tab"]'),
  ];
  const target = step.startsWith("@")
    ? document.querySelector<HTMLElement>(step.slice(1))
    : controls.find(
        (control) =>
          control.textContent?.trim() === step || control.getAttribute("aria-label") === step,
      );
  target?.click();
  return !!target;
}

async function walk(steps: string[]): Promise<void> {
  for (const step of steps) {
    const started = performance.now();
    while (!press(step)) {
      if (performance.now() - started > 8000) {
        console.error(`Lab: couldn't find "${step}" in ${scenario.id}`);
        tell({ type: "stuck", step });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    await new Promise((resolve) => setTimeout(resolve, 280));
  }
}

void walk(scenario.steps ?? []).then(() => {
  document.documentElement.dataset.labReady = "1";
  tell({ type: "ready" });
});
