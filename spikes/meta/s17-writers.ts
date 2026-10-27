// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S17: quality and latency of the Dictate and Prompt writers (docs/architecture.md D20),
 * now with the prompt stack (D21). The second transcript is the one that came out as
 * "- Place me on the edit profile page" before the stack.
 *
 * Run: pnpm spike spikes/meta/s17-writers.ts
 */

import {
  EMPTY_PERSONAL,
  classifyTarget,
  cleanUpDictation,
  writePrompt,
} from "../../packages/engine/src/index.ts";

const client = { apiKey: process.env.META_API_KEY ?? "" };
const personal = { ...EMPTY_PERSONAL, name: "Nikhil", dictionary: ["iVibe"] };

const feature = [
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
const bug = [
  { startMs: 0, text: "Okay so I'm on the edit profile page" },
  { startMs: 2989, text: "I change my bio and bio and click save" },
  { startMs: 5725, text: "nothing happens." },
  { startMs: 7651, text: "I click save again" },
  { startMs: 9576, text: "still nothing" },
];
const slackRant = [
  {
    startMs: 0,
    text: "hey so uh the deploy is blocked again because the staging DB is like full, can someone from infra look, I vibe deploys are all stuck",
  },
];

const claudeCode = classifyTarget("WindowsTerminal", "✳ Claude Code");
const slack = classifyTarget("slack", "#eng");

for (const [label, run] of [
  ["Dictate → Slack", () => cleanUpDictation(slackRant, { target: slack, personal }, client)],
  [
    "Prompt (feature) → Claude Code",
    () => writePrompt(feature, { target: claudeCode, personal }, client),
  ],
  ["Prompt (bug) → Claude Code", () => writePrompt(bug, { target: claudeCode, personal }, client)],
] as const) {
  const started = Date.now();
  const text = await run();
  console.log(`\n=== ${label} (${Date.now() - started} ms)\n${text}`);
}
