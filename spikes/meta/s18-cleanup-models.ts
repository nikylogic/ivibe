// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S18: which Meta text model cleans up dictation fastest without losing quality? Sends the
 * exact Dictate prompt (prompt stack D21) to every text model the key lists, 3 times each, and
 * reports latency and tokens. Calls Meta directly, past the engine's allowlist, so `-contributor`
 * models can be timed too; the transcripts are synthetic, so no user data reaches them.
 *
 * Run: pnpm spike spikes/meta/s18-cleanup-models.ts
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { EMPTY_PERSONAL, classifyTarget } from "../../packages/engine/src/index.ts";
import { systemPrompt, transcriptBlock } from "../../packages/engine/src/prompts/stack.ts";
import { dictateTask } from "../../packages/engine/src/prompts/tasks.ts";

const API = "https://api.meta.ai/v1";
const key = process.env.META_API_KEY ?? "";
const RUNS = 3;

const transcript = [
  { startMs: 0, text: "hey so uh the deploy is blocked again because the staging DB is like full" },
  {
    startMs: 4200,
    text: "can someone from infra look at it, no wait, I mean can Priya look at it",
  },
  { startMs: 8800, text: "matlab I vibe deploys are all stuck since morning" },
];
const context = {
  target: classifyTarget("slack", "#eng"),
  personal: { ...EMPTY_PERSONAL, dictionary: ["iVibe", "Priya"] },
};
const system = systemPrompt(dictateTask("auto"), context, "dictation");
const user = transcriptBlock(transcript, false);

const VARIANTS: { model: string; effort?: "minimal" | "low" }[] = [
  { model: "muse-spark-1.3", effort: "minimal" },
  { model: "muse-spark-1.3" },
  { model: "muse-spark-1.2", effort: "minimal" },
  { model: "muse-spark-1.1", effort: "minimal" },
  { model: "muse-spark-1.1" },
  { model: "muse-spark-1.3-contributor", effort: "minimal" },
  { model: "muse-spark-1.2-contributor", effort: "minimal" },
  { model: "muse-wonder-1.0", effort: "minimal" },
];

interface Run {
  ms: number;
  status: number;
  input?: number;
  output?: number;
  text?: string;
  error?: string;
}

async function once(model: string, effort?: string): Promise<Run> {
  const started = performance.now();
  const response = await fetch(`${API}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 2000,
      ...(effort ? { reasoning: { effort } } : {}),
      input: [
        { role: "system", content: system },
        { role: "user", content: [{ type: "input_text", text: user }] },
      ],
    }),
  });
  const ms = Math.round(performance.now() - started);
  const body = (await response.json().catch(() => ({}))) as {
    usage?: { input_tokens?: number; output_tokens?: number };
    output?: { type: string; content?: { type: string; text?: string }[] }[];
    error?: { message?: string };
  };
  if (!response.ok)
    return { ms, status: response.status, error: body.error?.message?.slice(0, 120) };
  const text = (body.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  return {
    ms,
    status: response.status,
    input: body.usage?.input_tokens,
    output: body.usage?.output_tokens,
    text,
  };
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

const results: Record<string, Run[]> = {};
for (const { model, effort } of VARIANTS) {
  const label = `${model}${effort ? ` (${effort})` : " (default effort)"}`;
  results[label] = [];
  for (let i = 0; i < RUNS; i++) results[label].push(await once(model, effort));
  const ok = results[label].filter((run) => run.status === 200);
  const summary = ok.length
    ? `median ${median(ok.map((run) => run.ms))} ms Â· out ${median(ok.map((run) => run.output ?? 0))} tok`
    : `failed: HTTP ${results[label][0]!.status} ${results[label][0]!.error ?? ""}`;
  console.log(`${label.padEnd(44)} ${ok.length}/${RUNS} ok Â· ${summary}`);
  if (ok[0]?.text) console.log(`  â†’ ${ok[0].text.replace(/\n/g, " âŽ ")}`);
}

const out = join(
  import.meta.dirname,
  `../results/s18-cleanup-models-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`\nSaved ${out}`);
