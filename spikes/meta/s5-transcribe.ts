// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S5: Muse Voice Transcribe on mixed Hindi and English narration, in ENDPOINTING mode
 * (the only mode with turn timestamps).
 *
 * Record ~45 s of narration as WAV (mono, 16-bit PCM, 16 kHz), mixing Hindi and English and
 * naming code identifiers ("handleSave", "useEffect").
 *
 * Run: pnpm spike spikes/meta/s5-transcribe.ts path/to/narration.wav [keyword,keyword,...]
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { metaJson, requireArg, saveResult } from "./_client.ts";

const wav = requireArg(0, "pnpm spike spikes/meta/s5-transcribe.ts <narration.wav> [keywords]");
const keywords = (process.argv[3] ?? "useEffect,fetch,handleSave,VITE_API_URL").split(",");

const form = new FormData();
form.set(
  "request",
  JSON.stringify({
    model: "muse-voice-transcribe-1.0",
    mode: "ENDPOINTING",
    audioEncoding: "WAV",
    languageBias: ["English", "Hindi"],
    keywords,
  }),
);
form.set("audio", new Blob([readFileSync(wav)], { type: "audio/wav" }), basename(wav));

const t0 = Date.now();
const result = await metaJson("/asr/transcribe", { method: "POST", body: form });
console.log(`Transcribed in ${Date.now() - t0} ms:\n`);
console.log(JSON.stringify(result, null, 2));
console.log(`\nSaved: ${saveResult("s5-transcribe", result)}`);
