// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useState } from "react";
import type { IvibeApi } from "../../preload/ui.ts";
import type { AppInfo, ByokStatus, RecordingStatus } from "../../shared/ipc.ts";

declare global {
  interface Window {
    ivibe: IvibeApi;
  }
}

export type Page = "record" | "reports" | "settings";

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
