// SPDX-License-Identifier: AGPL-3.0-only

import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc.ts";
import type {
  AppInfo,
  ByokStatus,
  HistoryDetail,
  HistoryEntry,
  RecordingStatus,
  Settings,
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
  },
};

export type IvibeApi = typeof api;

contextBridge.exposeInMainWorld("ivibe", api);
