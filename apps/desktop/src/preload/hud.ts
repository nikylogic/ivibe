// SPDX-License-Identifier: AGPL-3.0-only

import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc.ts";
import type { RecordingFeedback, RecordingStatus } from "../shared/ipc.ts";

// The HUD can stop or cancel the current recording and open the app; nothing else.
const api = {
  stop: (): Promise<void> => ipcRenderer.invoke(Channels.recordingStop),
  cancel: (): Promise<void> => ipcRenderer.invoke(Channels.recordingCancel),
  openApp: (): Promise<void> => ipcRenderer.invoke(Channels.hudOpenApp),
  setInteractive: (interactive: boolean): void =>
    ipcRenderer.send(Channels.hudInteractive, interactive),
  onFeedback: (listener: (feedback: RecordingFeedback) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, feedback: RecordingFeedback) =>
      listener(feedback);
    ipcRenderer.on(Channels.recordingFeedback, handler);
    return () => void ipcRenderer.removeListener(Channels.recordingFeedback, handler);
  },
  onState: (listener: (status: RecordingStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: RecordingStatus) =>
      listener(status);
    ipcRenderer.on(Channels.recordingState, handler);
    return () => void ipcRenderer.removeListener(Channels.recordingState, handler);
  },
  onLevel: (listener: (rms: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, rms: number) => listener(rms);
    ipcRenderer.on(Channels.recordingLevel, handler);
    return () => void ipcRenderer.removeListener(Channels.recordingLevel, handler);
  },
};

export type HudApi = typeof api;

contextBridge.exposeInMainWorld("ivibeHud", api);
