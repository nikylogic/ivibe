// SPDX-License-Identifier: AGPL-3.0-only

import { net } from "electron";

/**
 * Muse Voice Transcribe for live captions (docs/architecture.md §4.6, Spike S5). Runs in main,
 * where the BYOK key lives; the renderer never sees the key.
 */

const API_BASE = "https://api.meta.ai/v1";

interface TranscribeResponse {
  transcript?: string;
  turns?: { transcript?: string }[];
}

export class TranscribeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function transcribe(
  wav: Uint8Array,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  form.set(
    "request",
    JSON.stringify({
      model: "muse-voice-transcribe-1.0",
      mode: "ENDPOINTING",
      audioEncoding: "WAV",
      languageBias: ["English", "Hindi"],
    }),
  );
  form.set("audio", new Blob([wav.slice()], { type: "audio/wav" }), "utterance.wav");

  const response = await net.fetch(`${API_BASE}/asr/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  });
  if (!response.ok) {
    // The body can echo request details; keep only the status for logs and the UI.
    throw new TranscribeError(response.status, `Transcription failed (HTTP ${response.status})`);
  }
  const result = (await response.json()) as TranscribeResponse;
  const text =
    result.transcript ??
    (result.turns ?? [])
      .map((turn) => turn.transcript ?? "")
      .join(" ")
      .trim();
  return text.trim();
}
