// SPDX-License-Identifier: AGPL-3.0-only

import { dictateTask, fixTask, promptTask } from "./prompts/tasks.ts";
import { clock, systemPrompt, transcriptBlock } from "./prompts/stack.ts";
import type { TranscriptLine, WriterContext } from "./prompts/stack.ts";
import { createResponse, outputText } from "./responses.ts";
import type { ClientOptions, InputContent } from "./responses.ts";
import { TEXT_PADDING, clampBox, padBox, unionBoxes } from "./proof.ts";
import type { Box, ProofMark, ProofShot } from "./proof.ts";

/**
 * Turns a recording into the text that gets pasted (docs/architecture.md D20). One Muse Spark
 * call per mode, with the system prompt built from the layers in prompts/ (D21). Dictate and
 * Prompt use minimal reasoning, which measured 1.2–2 s against 3–5 s at the default (Spike S17),
 * so the text lands about as fast as the user can switch windows.
 */

export type OutputMode = "fix" | "prompt" | "dictate";
export type { TranscriptLine, WriterContext };

const FIX_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "proof"],
  properties: {
    prompt: { type: "string" },
    proof: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["frame_id", "title", "marks"],
        properties: {
          frame_id: { type: "string" },
          title: { type: "string" },
          marks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["caption", "line_ids", "box"],
              properties: {
                caption: { type: "string" },
                line_ids: { type: "array", items: { type: "string" } },
                box: { type: "array", items: { type: "number" } },
              },
            },
          },
        },
      },
    },
  },
} as const;

interface FixOutput {
  prompt?: string;
  proof?: {
    frame_id?: string;
    title?: string;
    marks?: { caption?: string; line_ids?: string[]; box?: number[] }[];
  }[];
}

export async function cleanUpDictation(
  transcript: readonly TranscriptLine[],
  context: WriterContext,
  client: ClientOptions,
): Promise<string> {
  const language = context.personal?.dictationLanguage ?? "keep";
  const result = await createResponse(
    {
      model: "muse-spark-1.3",
      reasoning: { effort: "minimal" },
      input: [
        { role: "system", content: systemPrompt(dictateTask(language), context, "dictation") },
        {
          role: "user",
          content: [{ type: "input_text", text: transcriptBlock(transcript, false) }],
        },
      ],
    },
    client,
  );
  return outputText(result);
}

export async function writePrompt(
  transcript: readonly TranscriptLine[],
  context: WriterContext,
  client: ClientOptions,
): Promise<string> {
  const result = await createResponse(
    {
      model: "muse-spark-1.3",
      reasoning: { effort: "minimal" },
      input: [
        {
          role: "system",
          content: systemPrompt(promptTask(context.target.name), context, "agent"),
        },
        { role: "user", content: [{ type: "input_text", text: transcriptBlock(transcript) }] },
      ],
    },
    client,
  );
  return outputText(result);
}

export interface FixFrameLine {
  /** "l3": the line's index in its frame. */
  id: string;
  /** Masked OCR text. */
  text: string;
  box: Box;
}

export interface FixFrame {
  id: string;
  tMs: number;
  /** A redacted keyframe as a data URL (JPEG). */
  imageUrl: string;
  width: number;
  height: number;
  lines: FixFrameLine[];
}

export interface FixInput {
  transcript: readonly TranscriptLine[];
  frames: readonly FixFrame[];
  context: WriterContext;
  /** Ask for proof screenshots and what to highlight in them. */
  proof: boolean;
}

export interface FixResult {
  prompt: string;
  /** Frames to annotate, with highlights in frame pixels; SAM refinement is the caller's step. */
  shots: ProofShot[];
}

const MAX_SHOTS = 3;
const MAX_MARKS = 2;

/** Turns the model's picks into checked highlights, dropping any that point nowhere (§5.6). */
export function resolveProof(output: FixOutput["proof"], frames: readonly FixFrame[]): ProofShot[] {
  const shots: ProofShot[] = [];
  const used = new Set<string>();
  for (const pick of output ?? []) {
    const frame = frames.find((candidate) => candidate.id === pick.frame_id);
    if (!frame || used.has(frame.id)) continue;
    used.add(frame.id);
    const size = { width: frame.width, height: frame.height };
    const marks: ProofMark[] = [];
    for (const mark of pick.marks ?? []) {
      const caption = mark.caption?.trim();
      if (!caption) continue;
      const lines = frame.lines.filter((line) => mark.line_ids?.includes(line.id));
      const text = unionBoxes(lines.map((line) => line.box));
      if (text) {
        const box = clampBox(padBox(text, TEXT_PADDING), size);
        // One short line is usually a button or tab label; SAM can grow it to the element.
        const isLabel = lines.length === 1 && lines[0]!.text.trim().length <= 24;
        if (box) marks.push({ caption, box, source: isLabel ? "label" : "text" });
        continue;
      }
      const [x1, y1, x2, y2] = mark.box ?? [];
      if ([x1, y1, x2, y2].every((value) => typeof value === "number") && x2! > x1! && y2! > y1!) {
        const box = clampBox({ x: x1!, y: y1!, width: x2! - x1!, height: y2! - y1! }, size);
        if (box) marks.push({ caption, box, source: "element" });
      }
    }
    shots.push({
      frameId: frame.id,
      tMs: frame.tMs,
      title: pick.title?.trim() ?? "",
      marks: marks.slice(0, MAX_MARKS),
    });
    if (shots.length === MAX_SHOTS) break;
  }
  return shots.sort((a, b) => a.tMs - b.tMs);
}

export async function writeFixPrompt(input: FixInput, client: ClientOptions): Promise<FixResult> {
  const content: InputContent[] = [
    {
      type: "input_text",
      text: `${transcriptBlock(input.transcript)}\n\nKeyframes follow, oldest first.`,
    },
  ];
  for (const frame of input.frames) {
    const lines = frame.lines.map((line) => `${line.id}: ${line.text}`).join("\n");
    content.push({
      type: "input_text",
      text: `<frame id="${frame.id}" t="${clock(frame.tMs)}" size="${frame.width}x${frame.height}">\n<ocr>\n${lines || "(no text)"}\n</ocr>`,
    });
    content.push({ type: "input_image", image_url: frame.imageUrl, detail: "high" });
    content.push({ type: "input_text", text: "</frame>" });
  }

  const result = await createResponse(
    {
      model: "muse-spark-1.3",
      reasoning: { effort: "medium" },
      text: { format: { type: "json_schema", name: "fix", schema: FIX_SCHEMA, strict: true } },
      input: [
        {
          role: "system",
          content: systemPrompt(
            fixTask(input.context.target.name, input.proof),
            input.context,
            "agent",
          ),
        },
        { role: "user", content },
      ],
    },
    client,
  );
  let output: FixOutput;
  try {
    output = JSON.parse(outputText(result)) as FixOutput;
  } catch {
    throw new Error("Muse Spark returned an unreadable result. Try again.");
  }
  return {
    prompt: output.prompt?.trim() ?? "",
    shots: input.proof ? resolveProof(output.proof, input.frames) : [],
  };
}
