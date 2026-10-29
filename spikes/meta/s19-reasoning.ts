// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S19: what one more step of reasoning costs in latency and tokens for Prompt (minimal vs
 * low) and Fix (medium vs high), through the engine's own writers. Fix uses the synthetic "Save
 * does nothing" screenshot from spikes/fixtures, so no real recording is sent.
 *
 * Run: pnpm spike spikes/meta/s19-reasoning.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_PERSONAL,
  REASONING,
  classifyTarget,
  writeFixPrompt,
  writePrompt,
} from "../../packages/engine/src/index.ts";

const RUNS = 2;
const usage = { input: 0, output: 0 };
const client = {
  apiKey: process.env.META_API_KEY ?? "",
  fetch: (async (input: string | URL | Request, init?: RequestInit) => {
    const response = await fetch(input, init);
    const body = (await response
      .clone()
      .json()
      .catch(() => ({}))) as {
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    usage.input = body.usage?.input_tokens ?? 0;
    usage.output = body.usage?.output_tokens ?? 0;
    return response;
  }) as typeof fetch,
};
const context = {
  target: classifyTarget("WindowsTerminal", "✳ Claude Code"),
  personal: { ...EMPTY_PERSONAL, name: "Nikhil" },
};
const transcript = [
  { startMs: 0, text: "Okay so I'm on the edit profile page" },
  { startMs: 2989, text: "I change my bio and click save" },
  { startMs: 5725, text: "nothing happens, I click save again, still nothing" },
  { startMs: 9576, text: "the console has some error about map" },
];
const png = readFileSync(join(import.meta.dirname, "../fixtures/save-bug.png"));
const frames = [
  {
    id: "f1",
    tMs: 6000,
    imageUrl: `data:image/png;base64,${png.toString("base64")}`,
    width: 1280,
    height: 720,
    lines: [],
  },
];

// Spike only: switch the engine's reasoning per run (the object is constant to TypeScript only).
const reasoning = REASONING as unknown as Record<string, string>;

async function time(label: string, run: () => Promise<string>) {
  const times: number[] = [];
  let sample = "";
  for (let i = 0; i < RUNS; i++) {
    const started = performance.now();
    sample = await run();
    times.push(Math.round(performance.now() - started));
  }
  console.log(
    `${label.padEnd(22)} ${times.join(" / ")} ms · out ${usage.output} tok · ${sample.length} chars`,
  );
  console.log(`  → ${sample.slice(0, 260).replace(/\n/g, " ⏎ ")}…`);
}

for (const effort of ["minimal", "low"]) {
  reasoning.prompt = effort;
  await time(`Prompt (${effort})`, () => writePrompt(transcript, context, client));
}
for (const effort of ["medium", "high"]) {
  reasoning.fix = effort;
  await time(`Fix (${effort})`, async () => {
    const fix = await writeFixPrompt({ transcript, context, frames, proof: true }, client);
    return `${fix.prompt} [${fix.shots.length} proof shots]`;
  });
}
