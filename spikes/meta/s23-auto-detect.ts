// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S23: does Muse Voice Transcribe detect the language when `languageBias` is omitted?
 * Meta's Voice schemas say so ("Omit it to let the model detect the language"); S21 only used
 * English audio. Transcribes real non-English speech (16 kHz mono WAV, e.g. public-domain
 * Wikimedia Commons recordings) with no bias, the right language, English only, and iVibe's
 * default, and prints each transcript.
 *
 * Run: pnpm spike spikes/meta/s23-auto-detect.ts <clip.wav>=<Language> [...]
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { transcribeRequest } from "../../packages/engine/src/index.ts";
import type { Language } from "../../packages/engine/src/index.ts";
import { metaFetch, saveResult } from "./_client.ts";

const clips = process.argv.slice(2).map((arg) => {
  const [path, language] = arg.split("=") as [string, Language];
  return { path, language };
});
if (clips.length === 0) throw new Error("Usage: s23-auto-detect.ts <clip.wav>=<Language> ...");

const rows: { clip: string; bias: string; ms: number; transcript: string }[] = [];
for (const { path, language } of clips) {
  const wav = readFileSync(path);
  const biases: [string, Language[]][] = [
    ["auto (no languageBias)", []],
    [language, [language]],
    ["English only", ["English"]],
    ["English + Hindi (default)", ["English", "Hindi"]],
  ];
  for (const [label, languages] of biases) {
    const form = new FormData();
    form.set("request", transcribeRequest(languages));
    form.set("audio", new Blob([wav], { type: "audio/wav" }), basename(path));
    const t0 = Date.now();
    const response = await metaFetch("/asr/transcribe", { method: "POST", body: form });
    const body = (await response.json().catch(() => ({}))) as { transcript?: string };
    const row = {
      clip: basename(path),
      bias: label,
      ms: Date.now() - t0,
      transcript: response.ok ? (body.transcript ?? "").trim() : `(HTTP ${response.status})`,
    };
    rows.push(row);
    console.log(`\n[${row.clip} · ${label}] ${row.ms} ms\n${row.transcript.slice(0, 300)}`);
  }
}
console.log(`\nSaved: ${saveResult("s23-auto-detect", rows)}`);
