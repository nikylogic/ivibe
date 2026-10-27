// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S17: quality and latency of the Dictate and Prompt writers (docs/architecture.md D20).
 *
 * Run: pnpm spike spikes/meta/s17-writers.ts
 */

import { classifyTarget, cleanUpDictation, writePrompt } from "../../packages/engine/src/index.ts";

const apiKey = process.env.META_API_KEY ?? "";
const transcript = [
  {
    startMs: 0,
    text: "um okay so basically I want you to uh add a dark mode toggle to the settings page",
  },
  {
    startMs: 4200,
    text: "it should like remember the choice in local storage no wait use the user preferences API",
  },
  { startMs: 9800, text: "and uh make sure the header also switches you know the nav bar" },
  { startMs: 13100, text: "matlab system theme follow kare by default" },
];
const target = classifyTarget("WindowsTerminal", "✳ Claude Code");

for (const [label, run] of [
  ["Dictate", () => cleanUpDictation(transcript, { apiKey })],
  ["Prompt → Claude Code", () => writePrompt(transcript, target, { apiKey })],
] as const) {
  const started = Date.now();
  const text = await run();
  console.log(`\n=== ${label} (${Date.now() - started} ms)\n${text}`);
}
