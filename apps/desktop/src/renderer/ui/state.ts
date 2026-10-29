// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useState } from "react";
import type { IvibeApi } from "../../preload/ui.ts";
import type {
  AppInfo,
  BackupStatus,
  ByokStatus,
  CloudStatus,
  RecordingStatus,
  Settings,
  ShortcutStatus,
  UpdateStatus,
} from "../../shared/ipc.ts";

declare global {
  interface Window {
    ivibe: IvibeApi;
  }
}

export type Page = "record" | "history";

export function useRecordingStatus(): RecordingStatus {
  const [status, setStatus] = useState<RecordingStatus>({
    phase: "idle",
    elapsedMs: 0,
    maxMs: 60_000,
  });
  useEffect(() => {
    void window.ivibe.recording.get().then(setStatus);
    return window.ivibe.recording.onState(setStatus);
  }, []);
  return status;
}

export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void window.ivibe.app.info().then(setInfo);
  }, []);
  return info;
}

export function useUpdate(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    void window.ivibe.app.update.status().then(setStatus);
    return window.ivibe.app.update.onChange(setStatus);
  }, []);
  return status;
}

export function useShortcutStatus(): ShortcutStatus | null {
  const [status, setStatus] = useState<ShortcutStatus | null>(null);
  useEffect(() => {
    void window.ivibe.shortcuts.status().then(setStatus);
    return window.ivibe.shortcuts.onChange(setStatus);
  }, []);
  return status;
}

export interface SettingsState {
  settings: Settings | null;
  change: (change: Partial<Settings>) => void;
}

/** Settings shared with main; the tray menu can change them too. */
export function useSettings(): SettingsState {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    void window.ivibe.settings.get().then(setSettings);
    return window.ivibe.settings.onChange(setSettings);
  }, []);
  const change = useCallback((next: Partial<Settings>) => {
    setSettings((current) => (current ? { ...current, ...next } : current));
    void window.ivibe.settings.set(next).then(setSettings);
  }, []);
  return { settings, change };
}

/** IPC errors arrive as "Error invoking remote method 'x': Error: message". */
export function ipcMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export interface ByokState {
  status: ByokStatus | null;
  save: (key: string) => Promise<void>;
  clear: () => Promise<void>;
}

export function useByok(): ByokState {
  const [status, setStatus] = useState<ByokStatus | null>(null);
  useEffect(() => {
    void window.ivibe.byok.status().then(setStatus);
  }, []);
  const save = useCallback(async (key: string) => setStatus(await window.ivibe.byok.set(key)), []);
  const clear = useCallback(async () => setStatus(await window.ivibe.byok.clear()), []);
  return { status, save, clear };
}

/** Settings → iVibe Cloud → Backup and the Record page's deletion notice. */
export function useBackup(): BackupStatus | null {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  useEffect(() => {
    void window.ivibe.backup.status().then(setStatus);
    return window.ivibe.backup.onChange(setStatus);
  }, []);
  return status;
}

/** Whole days until a date (epoch ms), rounded up: "deleted in 3 days". */
export function daysUntil(at: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((at - now) / 86_400_000));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export interface CloudState {
  status: CloudStatus | null;
  signIn: () => void;
  signOut: () => void;
  /** Opens Pro checkout or the subscription portal in the browser. */
  billing: (page: "checkout" | "portal") => void;
}

export function useCloud(): CloudState {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  useEffect(() => {
    void window.ivibe.cloud.status().then(setStatus);
    return window.ivibe.cloud.onChange(setStatus);
  }, []);
  const signIn = useCallback(() => void window.ivibe.cloud.signIn(), []);
  const signOut = useCallback(() => void window.ivibe.cloud.signOut().then(setStatus), []);
  const billing = useCallback(
    (page: "checkout" | "portal") => void window.ivibe.cloud.billing(page),
    [],
  );
  return { status, signIn, signOut, billing };
}

/** On iVibe Pro right now (on_hold and past_due: Dodo is still retrying the card). */
export function isPro(status: CloudStatus): boolean {
  return ["active", "on_hold", "past_due"].includes(status.plan?.status ?? "");
}

/** A checkout that never went through (declined card, abandoned): not a plan that ended. */
export function neverStarted(status: CloudStatus): boolean {
  return ["failed", "pending"].includes(status.plan?.status ?? "");
}

/** One line about the Pro plan for Settings, or null without one. */
export function planNote(status: CloudStatus): string | null {
  const plan = status.plan;
  if (!plan) return null;
  const date = plan.renewsAt
    ? new Date(plan.renewsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  if (plan.status === "active") {
    if (plan.cancelAtPeriodEnd) {
      return date
        ? `Pro ends on ${date}, and unused credits go with it.`
        : "Pro ends this month, and unused credits go with it.";
    }
    return date ? `Renews on ${date}.` : "Renews monthly.";
  }
  if (neverStarted(status)) return "Your last checkout didn't go through. Nothing was charged.";
  if (plan.status === "on_hold" || plan.status === "past_due") {
    return "Your last payment didn't go through. Update your card in Manage subscription.";
  }
  return "Your Pro plan has ended.";
}

/** One line about the free trial, or null when there's nothing to say. */
export function trialNote(status: CloudStatus): string | null {
  switch (status.trial) {
    case "available":
      return "Your free credits start with your first recording.";
    case "device_limit":
      return "This computer has already used its free trials.";
    case "network_limit":
      return "Free trials from this network are used up today.";
    case "account_too_new":
      return "Free credits need a GitHub account at least two weeks old.";
    default:
      return null;
  }
}
