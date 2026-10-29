// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S21: which `languageBias` values does Muse Voice Transcribe accept? The docs list 25
 * languages by name and give no enum (Voice schemas: "each as a language name"). Sends the same
 * short English WAV with each documented name, plus codes, lower case and near-miss spellings,
 * and records the HTTP status and transcript for each.
 *
 * Run: pnpm spike spikes/meta/s21-language-bias.ts path/to/english.wav
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { metaFetch, requireArg, saveResult } from "./_client.ts";

const wav = readFileSync(
  requireArg(0, "pnpm spike spikes/meta/s21-language-bias.ts <english.wav>"),
);

const DOCUMENTED = [
  "Arabic",
  "Bengali",
  "Dutch",
  "English",
  "French",
  "German",
  "Hebrew",
  "Hindi",
  "Indonesian",
  "Italian",
  "Japanese",
  "Kannada",
  "Korean",
  "Malay",
  "Mandarin Chinese",
  "Marathi",
  "Polish",
  "Portuguese",
  "Spanish",
  "Tagalog",
  "Tamil",
  "Telugu",
  "Thai",
  "Turkish",
  "Vietnamese",
];
const VARIANTS = [
  "Chinese",
  "Mandarin",
  "Filipino",
  "hindi",
  "en",
  "hi",
  "en-US",
  "Klingon",
  "Gujarati",
];

const results: { bias: string; status: number; transcript: string }[] = [];
for (const bias of [...DOCUMENTED, ...VARIANTS]) {
  const form = new FormData();
  form.set(
    "request",
    JSON.stringify({
      model: "muse-voice-transcribe-1.0",
      mode: "ENDPOINTING",
      audioEncoding: "WAV",
      languageBias: [bias],
    }),
  );
  form.set("audio", new Blob([wav], { type: "audio/wav" }), basename("english.wav"));
  const response = await metaFetch("/asr/transcribe", { method: "POST", body: form }).catch(
    (error: { status?: number }) => ({ status: error.status ?? 0, ok: false }) as Response,
  );
  const body = response.ok
    ? ((await response.json()) as { transcript?: string })
    : { transcript: `(error) ${(await response.text().catch(() => "")).slice(0, 160)}` };
  const row = { bias, status: response.status, transcript: (body.transcript ?? "").trim() };
  results.push(row);
  console.log(`${String(row.status).padEnd(4)} ${bias.padEnd(18)} ${row.transcript}`);
}
console.log(`\nSaved: ${saveResult("s21-language-bias", results)}`);
