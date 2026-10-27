// SPDX-License-Identifier: AGPL-3.0-only

import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc.ts";
import type { RecordingStatus } from "../shared/ipc.ts";

// The HUD can only stop or cancel the current recording.
const api = {
  stop: (): Promise<void> => ipcRenderer.invoke(Channels.recordingStop),
  cancel: (): Promise<void> => ipcRenderer.invoke(Channels.recordingCancel),
  onState: (listener: (status: RecordingStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: RecordingStatus) =>
      listener(status);
    ipcRenderer.on(Channels.recordingState, handler);
    return () => ipcRenderer.removeListener(Channels.recordingState, handler);
  },
  onLevel: (listener: (rms: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, rms: number) => listener(rms);
    ipcRenderer.on(Channels.recordingLevel, handler);
    return () => ipcRenderer.removeListener(Channels.recordingLevel, handler);
  },
};

export type HudApi = typeof api;

contextBridge.exposeInMainWorld("ivibeHud", api);
