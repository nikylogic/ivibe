// SPDX-License-Identifier: AGPL-3.0-only

import type { TargetApp } from "../targets.ts";
import { CORE_RULES } from "./core.ts";
import { destinationGuide } from "./destinations.ts";
import { personalLayer } from "./personal.ts";
import type { Personal } from "./personal.ts";

/**
 * Builds the system prompt from the layers of docs/vibes-and-prompts.md §4.2: core rules, the
 * task, the destination's style and what the user said about themselves. The inputs (layer 5)
 * go in the user message, marked up by {@link transcriptBlock}.
 */

export interface WriterContext {
  /** Where the result will be pasted. */
  target: TargetApp;
  personal?: Personal;
}

export function systemPrompt(
  task: string,
  context: WriterContext,
  purpose: "agent" | "dictation",
): string {
  return [
    CORE_RULES,
    task,
    destinationGuide(context.target, purpose),
    personalLayer(context.personal),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface TranscriptLine {
  startMs: number;
  text: string;
}

export const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The narration as data, one timestamped sentence per line. */
export function transcriptBlock(lines: readonly TranscriptLine[], timestamps = true): string {
  const body = timestamps
    ? lines.map((line) => `[${clock(line.startMs)}] ${line.text}`).join("\n")
    : lines.map((line) => line.text).join(" ");
  return `<transcript>\n${body || "(nothing was said)"}\n</transcript>`;
}
