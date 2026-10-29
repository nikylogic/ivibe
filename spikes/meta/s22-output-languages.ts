// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S22: can Muse Spark write iVibe's output in each of Voice Transcribe's 25 languages? Meta
 * documents no language list for Spark. Asks muse-spark-1.3 (at dictation's shipped effort and token limit) to
 * write the same short Hinglish dictation in each language and checks the reply's script, while
 * code identifiers must survive untranslated.
 *
 * Run: pnpm spike spikes/meta/s22-output-languages.ts
 */

import {
  MAX_OUTPUT_TOKENS,
  REASONING,
  createResponse,
  outputText,
} from "../../packages/engine/src/index.ts";
import { saveResult } from "./_client.ts";

const apiKey = process.env.META_API_KEY ?? "";
const SPOKEN =
  "profile page pe save button kaam nahi kar raha, handleSave call hi nahi ho raha. please check karo.";

/** Each language and a pattern its script must match (Latin-script ones just need to differ). */
const LANGUAGES: [string, RegExp][] = [
  ["Arabic", /[؀-ۿ]/],
  ["Bengali", /[ঀ-৿]/],
  ["Dutch", /[a-z]/i],
  ["English", /[a-z]/i],
  ["French", /[a-z]/i],
  ["German", /[a-z]/i],
  ["Hebrew", /[֐-׿]/],
  ["Hindi", /[ऀ-ॿ]/],
  ["Indonesian", /[a-z]/i],
  ["Italian", /[a-z]/i],
  ["Japanese", /[぀-ヿ一-鿿]/],
  ["Kannada", /[ಀ-೿]/],
  ["Korean", /[가-힯]/],
  ["Malay", /[a-z]/i],
  ["Mandarin Chinese", /[一-鿿]/],
  ["Marathi", /[ऀ-ॿ]/],
  ["Polish", /[a-z]/i],
  ["Portuguese", /[a-z]/i],
  ["Spanish", /[a-z]/i],
  ["Tagalog", /[a-z]/i],
  ["Tamil", /[஀-௿]/],
  ["Telugu", /[ఀ-౿]/],
  ["Thai", /[฀-๿]/],
  ["Turkish", /[a-z]/i],
  ["Vietnamese", /[a-z]/i],
];

const rows: { language: string; script: boolean; identifier: boolean; ms: number; text: string }[] =
  [];
for (const [language, script] of LANGUAGES) {
  const t0 = Date.now();
  const result = await createResponse(
    {
      model: "muse-spark-1.3",
      reasoning: { effort: REASONING.dictate },
      max_output_tokens: MAX_OUTPUT_TOKENS.dictate,
      input: [
        {
          role: "system",
          content: `Clean up this dictation. Write it in ${language}. Keep code identifiers, file names and error text exactly as said. Return only the text.`,
        },
        { role: "user", content: [{ type: "input_text", text: SPOKEN }] },
      ],
    },
    { apiKey },
  );
  const text = outputText(result).trim();
  const row = {
    language,
    script: script.test(text),
    identifier: text.includes("handleSave"),
    ms: Date.now() - t0,
    text,
  };
  rows.push(row);
  console.log(
    `${row.script ? "ok " : "BAD"} ${row.identifier ? "id" : "--"} ${language.padEnd(17)} ${text.replace(/\s+/g, " ").slice(0, 90)}`,
  );
}
console.log(`\nSaved: ${saveResult("s22-output-languages", rows)}`);
