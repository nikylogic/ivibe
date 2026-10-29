// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S20: can the free trial run on muse-spark-1.3-contributor (D25)? Runs all three writers
 * with the standard and the contributor model at the efforts iVibe ships (S18/S19), on synthetic
 * input only (the "Save does nothing" fixture), and reports latency, tokens and output.
 *
 * Run: pnpm spike spikes/meta/s20-trial-model.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_PERSONAL,
  classifyTarget,
  cleanUpDictation,
  writeFixPrompt,
  writePrompt,
} from "../../packages/engine/src/index.ts";

const RUNS = 2;
const usage = { input: 0, output: 0 };
const fetchWithUsage = (async (input: string | URL | Request, init?: RequestInit) => {
  const response = await fetch(input, init);
  const body = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { usage?: { input_tokens?: number; output_tokens?: number } };
  usage.input = body.usage?.input_tokens ?? 0;
  usage.output = body.usage?.output_tokens ?? 0;
  return response;
}) as typeof fetch;
const apiKey = process.env.META_API_KEY ?? "";

const agent = {
  target: classifyTarget("WindowsTerminal", "✳ Claude Code"),
  personal: { ...EMPTY_PERSONAL, name: "Nikhil" },
};
const chat = {
  target: classifyTarget("slack", "#eng"),
  personal: { ...EMPTY_PERSONAL, dictionary: ["iVibe", "Priya"] },
};
const spoken = [
  { startMs: 0, text: "hey so uh the deploy is blocked again because the staging DB is like full" },
  {
    startMs: 4200,
    text: "can someone from infra look at it, no wait, I mean can Priya look at it",
  },
  { startMs: 8800, text: "matlab I vibe deploys are all stuck since morning" },
];
const bug = [
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

for (const trial of [false, true]) {
  const client = { apiKey, fetch: fetchWithUsage, trial };
  const tasks: [string, () => Promise<string>][] = [
    ["Dictate", () => cleanUpDictation(spoken, chat, client)],
    ["Prompt", () => writePrompt(bug, agent, client)],
    [
      "Fix",
      async () => {
        const fix = await writeFixPrompt(
          { transcript: bug, context: agent, frames, proof: true },
          client,
        );
        return `${fix.prompt} [${fix.shots.length} proof shots, ${fix.shots.flatMap((s) => s.marks).length} marks]`;
      },
    ],
  ];
  for (const [label, run] of tasks) {
    const times: number[] = [];
    let sample = "";
    try {
      for (let i = 0; i < RUNS; i++) {
        const started = performance.now();
        sample = await run();
        times.push(Math.round(performance.now() - started));
      }
      console.log(
        `${(trial ? "contributor" : "standard").padEnd(12)} ${label.padEnd(8)} ${times.join(" / ")} ms · in ${usage.input} · out ${usage.output} tok`,
      );
      console.log(`  → ${sample.slice(0, 400).replace(/\n/g, " ⏎ ")}`);
    } catch (error) {
      console.log(`${trial ? "contributor" : "standard"} ${label} failed: ${String(error)}`);
    }
  }
}
