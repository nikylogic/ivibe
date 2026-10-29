// SPDX-License-Identifier: AGPL-3.0-only

import {
  DEFAULT_OUTPUT_LANGUAGE,
  MAX_SELECTION_CHARS,
  isOutputLanguage,
  normalizeSpokenLanguages,
} from "@ivibe/engine";
import type {
  FixFrame,
  OutputMode,
  Personal,
  TargetApp,
  TranscriptLine,
  WriterContext,
} from "@ivibe/engine";

/**
 * Checks a compose request's shape and size. The API is iVibe-shaped on purpose (§2.4): it takes
 * a recording's transcript and redacted keyframes, never a prompt or a model name.
 */

export class BadRequest extends Error {}

export interface ComposeBody {
  mode: OutputMode;
  transcript: TranscriptLine[];
  context: WriterContext;
  frames: FixFrame[];
  proof: boolean;
  /** Dictate only: text selected in the app in front (secrets masked), to edit or replace. */
  selection?: string;
}

const LIMITS = {
  transcriptLines: 300,
  lineChars: 2000,
  frames: 8,
  imageChars: 1_500_000,
  frameLines: 400,
  ocrChars: 500,
} as const;

function fail(message: string): never {
  throw new BadRequest(message);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function str(value: unknown, max: number, field: string): string {
  if (typeof value !== "string" || value.length > max) {
    fail(`${field} must be a string of at most ${max} characters`);
  }
  return value;
}

function num(value: unknown, field: string, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
    fail(`${field} must be a number from 0 to ${max}`);
  }
  return value;
}

const TARGET_KINDS = new Set(["terminal-agent", "terminal", "editor", "chat", "browser", "other"]);

function target(value: unknown): TargetApp {
  if (!isObject(value)) fail("context.target is required");
  if (typeof value.kind !== "string" || !TARGET_KINDS.has(value.kind)) {
    fail("context.target.kind is invalid");
  }
  return {
    kind: value.kind as TargetApp["kind"],
    name: str(value.name, 200, "context.target.name"),
    process: str(value.process ?? "", 200, "context.target.process"),
    title: str(value.title ?? "", 500, "context.target.title"),
  };
}

function personal(value: unknown): Personal | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value)) fail("context.personal is invalid");
  const dictionary = value.dictionary ?? [];
  if (!Array.isArray(dictionary) || dictionary.length > 200) {
    fail("context.personal.dictionary is invalid");
  }
  return {
    name: str(value.name ?? "", 100, "personal.name"),
    about: str(value.about ?? "", 1000, "personal.about"),
    spokenLanguages: normalizeSpokenLanguages(value.spokenLanguages),
    outputLanguage: isOutputLanguage(value.outputLanguage)
      ? value.outputLanguage
      : DEFAULT_OUTPUT_LANGUAGE,
    dictionary: dictionary.map((word) => str(word, 60, "personal.dictionary[]")),
    instructions: str(value.instructions ?? "", 2000, "personal.instructions"),
  };
}

function box(value: unknown, field: string) {
  if (!isObject(value)) fail(`${field} is invalid`);
  return {
    x: num(value.x, `${field}.x`, 20_000),
    y: num(value.y, `${field}.y`, 20_000),
    width: num(value.width, `${field}.width`, 20_000),
    height: num(value.height, `${field}.height`, 20_000),
  };
}

function frame(value: unknown, index: number): FixFrame {
  const field = `frames[${index}]`;
  if (!isObject(value)) fail(`${field} is invalid`);
  const imageUrl = str(value.imageUrl, LIMITS.imageChars, `${field}.imageUrl`);
  if (!imageUrl.startsWith("data:image/jpeg;base64,")) {
    fail(`${field}.imageUrl must be a JPEG data URL`);
  }
  const lines = value.lines ?? [];
  if (!Array.isArray(lines) || lines.length > LIMITS.frameLines) fail(`${field}.lines is invalid`);
  return {
    id: str(value.id, 40, `${field}.id`),
    tMs: num(value.tMs, `${field}.tMs`, 600_000),
    imageUrl,
    width: num(value.width, `${field}.width`, 10_000),
    height: num(value.height, `${field}.height`, 10_000),
    lines: lines.map((line: unknown, n) => {
      if (!isObject(line)) fail(`${field}.lines[${n}] is invalid`);
      return {
        id: str(line.id, 20, "line.id"),
        text: str(line.text, LIMITS.ocrChars, "line.text"),
        box: box(line.box, "line.box"),
      };
    }),
  };
}

export function parseCompose(value: unknown): ComposeBody {
  if (!isObject(value)) fail("Expected a JSON object");
  const mode = value.mode;
  if (mode !== "fix" && mode !== "prompt" && mode !== "dictate") {
    fail("mode must be fix, prompt or dictate");
  }
  const transcript = value.transcript;
  if (!Array.isArray(transcript) || transcript.length > LIMITS.transcriptLines) {
    fail("transcript is invalid");
  }
  const frames = value.frames ?? [];
  if (!Array.isArray(frames) || frames.length > LIMITS.frames) {
    fail(`At most ${LIMITS.frames} frames`);
  }
  if (mode !== "fix" && frames.length > 0) fail("Only Fix takes frames");
  if (value.selection !== undefined && mode !== "dictate") fail("Only Dictate takes a selection");
  if (!isObject(value.context)) fail("context is required");
  return {
    mode,
    transcript: transcript.map((line: unknown) => {
      if (!isObject(line)) fail("transcript line is invalid");
      return {
        startMs: num(line.startMs, "startMs", 600_000),
        text: str(line.text, LIMITS.lineChars, "text"),
      };
    }),
    context: { target: target(value.context.target), personal: personal(value.context.personal) },
    frames: frames.map(frame),
    proof: value.proof === true,
    ...(value.selection
      ? { selection: str(value.selection, MAX_SELECTION_CHARS, "selection") }
      : {}),
  };
}
