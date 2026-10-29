// SPDX-License-Identifier: AGPL-3.0-only

import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc.ts";
import type {
  AppInfo,
  BackupStatus,
  ByokStatus,
  CloudStatus,
  CloudUsage,
  HistoryDetail,
  HistoryEntry,
  RecordingStatus,
  Settings,
  ShortcutKey,
  ShortcutStatus,
} from "../shared/ipc.ts";

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  recording: {
    start: (): Promise<void> => ipcRenderer.invoke(Channels.recordingStart),
    stop: (): Promise<void> => ipcRenderer.invoke(Channels.recordingStop),
    cancel: (): Promise<void> => ipcRenderer.invoke(Channels.recordingCancel),
    retry: (): Promise<void> => ipcRenderer.invoke(Channels.recordingRetry),
    get: (): Promise<RecordingStatus> => ipcRenderer.invoke(Channels.recordingGet),
    onState: (listener: (status: RecordingStatus) => void) =>
      subscribe(Channels.recordingState, listener),
    onLevel: (listener: (rms: number) => void) => subscribe(Channels.recordingLevel, listener),
    /** Copies the last result again, e.g. when it couldn't be pasted. */
    copyResult: (): Promise<void> => ipcRenderer.invoke(Channels.resultCopy),
    /** Opens an annotated screenshot of the latest result in the system viewer. */
    openProof: (index: number): Promise<void> => ipcRenderer.invoke(Channels.proofOpen, index),
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(Channels.settingsGet),
    set: (change: Partial<Settings>): Promise<Settings> =>
      ipcRenderer.invoke(Channels.settingsSet, change),
    onChange: (listener: (settings: Settings) => void) =>
      subscribe(Channels.settingsChanged, listener),
  },
  byok: {
    set: (key: string): Promise<ByokStatus> => ipcRenderer.invoke(Channels.byokSet, key),
    clear: (): Promise<ByokStatus> => ipcRenderer.invoke(Channels.byokClear),
    status: (): Promise<ByokStatus> => ipcRenderer.invoke(Channels.byokStatus),
  },
  cloud: {
    status: (): Promise<CloudStatus> => ipcRenderer.invoke(Channels.cloudStatus),
    /** Opens GitHub sign-in in the browser; the result arrives through onChange. */
    signIn: (): Promise<void> => ipcRenderer.invoke(Channels.cloudSignIn),
    signOut: (): Promise<CloudStatus> => ipcRenderer.invoke(Channels.cloudSignOut),
    /** Opens Pro checkout, or the subscription portal, in the browser. */
    billing: (page: "checkout" | "portal"): Promise<void> =>
      ipcRenderer.invoke(Channels.cloudBilling, page),
    /** Billing → Usage; null when signed out or offline. */
    usage: (): Promise<CloudUsage | null> => ipcRenderer.invoke(Channels.cloudUsage),
    onChange: (listener: (status: CloudStatus) => void) =>
      subscribe(Channels.cloudChanged, listener),
  },
  /** Settings → iVibe Cloud → Backup: end-to-end encrypted backups (main/backup.ts). */
  backup: {
    status: (): Promise<BackupStatus> => ipcRenderer.invoke(Channels.backupStatus),
    /** A new recovery key to show; nothing is uploaded until confirm. */
    begin: (): Promise<string> => ipcRenderer.invoke(Channels.backupBegin),
    confirm: (lastGroup: string): Promise<BackupStatus> =>
      ipcRenderer.invoke(Channels.backupConfirm, lastGroup),
    now: (replace = false): Promise<void> => ipcRenderer.invoke(Channels.backupNow, replace),
    connect: (recoveryKey: string): Promise<BackupStatus> =>
      ipcRenderer.invoke(Channels.backupConnect, recoveryKey),
    /** Returns how many results were restored. */
    restore: (recoveryKey?: string): Promise<number> =>
      ipcRenderer.invoke(Channels.backupRestore, recoveryKey),
    /** Returns the folder it was saved to, or null if the user cancelled. */
    exportTo: (recoveryKey?: string): Promise<string | null> =>
      ipcRenderer.invoke(Channels.backupExport, recoveryKey),
    reveal: (): Promise<string> => ipcRenderer.invoke(Channels.backupReveal),
    saveKey: (): Promise<boolean> => ipcRenderer.invoke(Channels.backupSaveKey),
    remove: (): Promise<BackupStatus> => ipcRenderer.invoke(Channels.backupDelete),
    onChange: (listener: (status: BackupStatus) => void) =>
      subscribe(Channels.backupChanged, listener),
  },
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke(Channels.appInfo),
  },
  history: {
    list: (): Promise<HistoryEntry[]> => ipcRenderer.invoke(Channels.historyList),
    get: (id: string): Promise<HistoryDetail | null> => ipcRenderer.invoke(Channels.historyGet, id),
    copy: (id: string): Promise<void> => ipcRenderer.invoke(Channels.historyCopy, id),
    /** Copies the entry and makes it the result a click or the paste shortcut pastes. */
    reuse: (id: string): Promise<boolean> => ipcRenderer.invoke(Channels.historyReuse, id),
    openProof: (id: string, index: number): Promise<void> =>
      ipcRenderer.invoke(Channels.historyOpenProof, id, index),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(Channels.historyDelete, id),
    clear: (): Promise<void> => ipcRenderer.invoke(Channels.historyClear),
    onChange: (listener: (entries: HistoryEntry[]) => void) =>
      subscribe(Channels.historyChanged, listener),
  },
  shortcuts: {
    status: (): Promise<ShortcutStatus> => ipcRenderer.invoke(Channels.shortcutsStatus),
    /** Unregisters the mode shortcuts while a new one is being recorded. */
    pause: (paused: boolean): Promise<void> => ipcRenderer.invoke(Channels.shortcutsPause, paused),
    onChange: (listener: (status: ShortcutStatus) => void) =>
      subscribe(Channels.shortcutsChanged, listener),
    /** Keys pressed while paused; the page itself doesn't receive them. */
    onKey: (listener: (key: ShortcutKey) => void) => subscribe(Channels.shortcutsKey, listener),
  },
};

export type IvibeApi = typeof api;

contextBridge.exposeInMainWorld("ivibe", api);
