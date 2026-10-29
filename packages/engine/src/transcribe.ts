// SPDX-License-Identifier: AGPL-3.0-only

import { META_API_BASE, MetaApiError } from "./responses.ts";
import type { ClientOptions } from "./responses.ts";
import { isLanguage } from "./languages.ts";
import type { Language } from "./languages.ts";
import { fetchWithRetry } from "./retry.ts";

/**
 * Muse Voice Transcribe (docs/architecture.md §4.6, Spike S5): one WAV utterance to text. Used by
 * the desktop for BYOK captions and by iVibe Cloud, so both send the same request.
 */

interface TranscribeResponse {
  transcript?: string;
  turns?: { transcript?: string }[];
}

/** Length of a PCM WAV in seconds, from its header's byte rate; null if it isn't one. */
export function wavSeconds(wav: Uint8Array): number | null {
  if (wav.length < 44) return null;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (offset: number) => String.fromCharCode(...wav.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  // Walk the chunks: "fmt " holds the byte rate, "data" the samples.
  let byteRate = 0;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = view.getUint32(offset + 4, true);
    if (tag(offset) === "fmt " && offset + 16 <= wav.length) {
      byteRate = view.getUint32(offset + 16, true);
    } else if (tag(offset) === "data") {
      const bytes = Math.min(size, wav.length - offset - 8);
      return byteRate > 0 ? bytes / byteRate : null;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** The transcription request; `languageBias` only when the user named languages (Spike S21). */
export function transcribeRequest(languages: readonly Language[]): string {
  const known = languages.filter(isLanguage);
  return JSON.stringify({
    model: "muse-voice-transcribe-1.0",
    mode: "ENDPOINTING",
    audioEncoding: "WAV",
    ...(known.length > 0 ? { languageBias: known } : {}),
  });
}

/** `languages` biases recognition toward what the user speaks; empty detects it. */
export async function transcribeWav(
  wav: Uint8Array,
  languages: readonly Language[],
  { apiKey, baseUrl = META_API_BASE, fetch: fetchImpl = fetch, signal }: ClientOptions,
): Promise<string> {
  const form = new FormData();
  form.set("request", transcribeRequest(languages));
  form.set("audio", new Blob([wav.slice()], { type: "audio/wav" }), "utterance.wav");

  const response = await fetchWithRetry(fetchImpl, `${baseUrl}/asr/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  });
  if (!response.ok) {
    // The body can echo request details; keep only the status for logs and the UI.
    throw new MetaApiError(response.status, `Transcription failed (HTTP ${response.status})`);
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
