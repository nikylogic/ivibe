// SPDX-License-Identifier: AGPL-3.0-only

import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc.ts";
import type { RecorderCommand, RecorderEvent } from "../shared/ipc.ts";

// The recorder reports progress and results; raw frames never cross this bridge.
const api = {
  emit: (event: RecorderEvent): void => ipcRenderer.send(Channels.recorderEvent, event),
  onCommand: (listener: (command: RecorderCommand) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, command: RecorderCommand) =>
      listener(command);
    ipcRenderer.on(Channels.recorderCommand, handler);
    return () => ipcRenderer.removeListener(Channels.recorderCommand, handler);
  },
};

export type RecorderBridge = typeof api;

contextBridge.exposeInMainWorld("ivibeRecorderBridge", api);
