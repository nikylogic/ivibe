// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S6: SAM 3.1 on a screenshot. Does a rough box prompt snap to the UI element, and does a
 * concept prompt find it? Decides how proof highlights are refined (docs/architecture.md §5.7).
 *
 * Run: pnpm spike spikes/meta/s6-sam-proof.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { metaFetch, saveResult } from "./_client.ts";

const png = readFileSync(join(import.meta.dirname, "../fixtures/save-bug.png"));
const image = `data:image/png;base64,${png.toString("base64")}`;
const [w, h] = [1280, 720];

const prompts = {
  // Deliberately loose box around the Save button (true box ≈ 48,420 → 188,468).
  box: `<0f>1<|box;x1=30;y1=400;x2=230;y2=490;w=${w};h=${h}|>`,
  concept: "save button",
};

const results: Record<string, unknown> = {};
for (const [name, text] of Object.entries(prompts)) {
  const started = performance.now();
  const response = await metaFetch("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sam-3.1",
      store: false,
      metadata: { include_confidence: "true" },
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text },
            { type: "input_image", image_url: image },
          ],
        },
      ],
    }),
  });
  const body = await response.text();
  const ms = Math.round(performance.now() - started);
  let output = body;
  try {
    const json = JSON.parse(body) as { output?: { content?: { text?: string }[] }[] };
    output =
      json.output
        ?.flatMap((item) => item.content ?? [])
        .map((c) => c.text ?? "")
        .join("") ?? body;
  } catch {
    // Not JSON: keep the raw body.
  }
  // Masks are long; show only the box records.
  console.log(`${name}: HTTP ${response.status} in ${ms} ms`);
  console.log("  ", output.replace(/<\|mask;[^|]*\|>/g, "<|mask…|>").slice(0, 600));
  results[name] = { status: response.status, ms, output };
}
console.log(`\nSaved: ${saveResult("s6-sam-proof", results)}`);
