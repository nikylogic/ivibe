// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S10: which model IDs does the API actually expose?
 * Confirms the allowlist in packages/engine (for example `sam-3.1` vs `sam-3-1`).
 *
 * Run: pnpm spike spikes/meta/s10-models.ts
 */

import { ALLOWED_MODELS } from "../../packages/engine/src/models.ts";
import { metaJson, saveResult } from "./_client.ts";

const models = await metaJson<{ data: { id: string }[] }>("/models");
const ids = models.data.map((model) => model.id).sort();

console.log(`The API lists ${ids.length} models:`);
for (const id of ids) console.log(`  ${id}`);

console.log("\nAllowlist check:");
for (const id of ALLOWED_MODELS) {
  const similar = ids.filter((listed) => listed.replace(/[.-]/g, "") === id.replace(/[.-]/g, ""));
  const status = ids.includes(id)
    ? "listed"
    : similar.length > 0
      ? `NOT listed, but similar: ${similar.join(", ")}`
      : "NOT listed";
  console.log(`  ${id.padEnd(28)} ${status}`);
}

console.log(`\nSaved: ${saveResult("s10-models", models)}`);
