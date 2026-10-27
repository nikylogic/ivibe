// SPDX-License-Identifier: AGPL-3.0-only

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, nativeImage, net } from "electron";
import {
  classifyTarget,
  cleanUpDictation,
  imageDelivery,
  refineMark,
  writeFixPrompt,
  writePrompt,
} from "@ivibe/engine";
import type { ClientOptions, ProofShot, TargetApp, TranscriptLine } from "@ivibe/engine";
import type {
  EvidenceFrame,
  OutputMode,
  ProofDrawing,
  ProofImage,
  RecordingResult,
} from "../shared/ipc.ts";
import { deliver } from "./deliver.ts";
import type { Part } from "./deliver.ts";
import { focusedWindow, isOwnWindow } from "./os-bridge.ts";
import type { FocusedWindow } from "./os-bridge.ts";

/**
 * Recording → pasted text (docs/architecture.md D20): remembers which app had focus when the
 * recording started, has Muse Spark write the result for the chosen mode, and delivers it there.
 * In Fix mode the proof screenshots are annotated (§5.7) and pasted next to the lines about them.
 */

/** SAM gets this long per highlight; a slow answer keeps the model's own box. */
const SAM_TIMEOUT_MS = 6000;
const PREVIEW_WIDTH = 480;

export interface Destination {
  window: FocusedWindow | null;
  target: TargetApp;
}

/** Started from iVibe itself or with no detectable window: the result is copied. */
const CLIPBOARD: TargetApp = { kind: "other", name: "the clipboard", process: "", title: "" };

/** The app the user is in right now; called when recording starts. */
export async function detectDestination(): Promise<Destination> {
  const window = await focusedWindow();
  if (!window || isOwnWindow(window)) return { window: null, target: CLIPBOARD };
  return { window, target: classifyTarget(window.process, window.title) };
}

export interface ComposeRequest {
  id: string;
  mode: OutputMode;
  destination: Destination;
  transcript: TranscriptLine[];
  frames: EvidenceFrame[];
  apiKey: string;
  autoPaste: boolean;
  proofImages: boolean;
  /** Renders a proof screenshot in the recorder window; returns the PNG as base64. */
  draw: (drawing: ProofDrawing) => Promise<string>;
}

const dataUrl = (jpeg: Uint8Array) =>
  `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`;

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);

/** Fits highlights to UI elements with SAM 3.1, all in parallel. */
async function refineShots(
  shots: ProofShot[],
  frames: EvidenceFrame[],
  client: ClientOptions,
): Promise<ProofShot[]> {
  return Promise.all(
    shots.map(async (shot) => {
      const frame = frames.find((candidate) => candidate.id === shot.frameId)!;
      const marks = await Promise.all(
        shot.marks.map(async (mark) => {
          const refined = await withTimeout(
            refineMark(dataUrl(frame.jpeg), mark, frame, client),
            SAM_TIMEOUT_MS,
          );
          return refined ? { ...mark, box: refined } : mark;
        }),
      );
      return { ...shot, marks };
    }),
  );
}

interface RenderedProof extends ProofImage {
  png: Uint8Array;
  /** The line of text that introduces the screenshot. */
  line: string;
}

/** Draws each shot, saves it as a PNG in the app's data folder and makes a small preview. */
async function renderProof(
  id: string,
  shots: ProofShot[],
  frames: EvidenceFrame[],
  draw: ComposeRequest["draw"],
): Promise<RenderedProof[]> {
  const folder = join(app.getPath("userData"), "proof", id);
  mkdirSync(folder, { recursive: true });
  let n = 0;
  return Promise.all(
    shots.map(async (shot, index) => {
      const frame = frames.find((candidate) => candidate.id === shot.frameId)!;
      const marks = shot.marks.map((mark) => ({ n: ++n, caption: mark.caption, box: mark.box }));
      const base64 = await draw({
        imageUrl: dataUrl(frame.jpeg),
        header: `${clock(shot.tMs)} · ${shot.title}`,
        marks,
      });
      const png = new Uint8Array(Buffer.from(base64, "base64"));
      const file = join(folder, `proof-${index + 1}.png`);
      writeFileSync(file, png);
      const preview = nativeImage
        .createFromBuffer(Buffer.from(png))
        .resize({ width: PREVIEW_WIDTH, quality: "good" })
        .toDataURL();
      const captions = marks.map((mark) => `(${mark.n}) ${mark.caption}`).join(", ");
      const line = `${index + 1}. ${clock(shot.tMs)} ${shot.title}${captions ? `: ${captions}` : ""}`;
      return { title: shot.title, file, preview, png, line };
    }),
  );
}
/** A finished result in a form that can be pasted again, into whichever app the user picks. */
export interface Payload {
  /** The prompt or text, without the proof section. */
  text: string;
  proof: { png: Uint8Array; line: string; file: string }[];
}

/** What goes on the clipboard when images can't be pasted: screenshots become file paths. */
export function fallbackText({ text, proof }: Payload): string {
  if (proof.length === 0) return text;
  const files = proof.map((shot) => `${shot.line}\n   ${shot.file}`).join("\n");
  return `${text}\n\nProof (annotated screenshots, open the files):\n${files}`;
}

/** The pieces to paste into a target, in order: each screenshot after the line about it. */
export function partsFor(target: TargetApp, payload: Payload): Part[] {
  if (payload.proof.length === 0 || imageDelivery(target) !== "paste") {
    return [fallbackText(payload)];
  }
  const parts: Part[] = [`${payload.text}\n\nProof (annotated screenshots):`];
  for (const shot of payload.proof) parts.push(`\n${shot.line} `, shot.png);
  return parts;
}

/** Pastes a payload into a window and describes the outcome for the result panel. */
export async function deliverPayload(
  payload: Payload,
  window: FocusedWindow | null,
  target: TargetApp,
  autoPaste: boolean,
): Promise<Pick<RecordingResult, "text" | "targetName" | "delivery">> {
  const parts = partsFor(target, payload);
  const fallback = fallbackText(payload);
  const delivery = await deliver({ window, target, parts, fallbackText: fallback, autoPaste });
  const pasted = parts.filter((part) => typeof part === "string").join("");
  return {
    text: delivery === "pasted" ? pasted : fallback,
    targetName: target.name,
    delivery,
  };
}

export async function compose(
  request: ComposeRequest,
): Promise<{ result: RecordingResult; payload: Payload }> {
  const { mode, destination, transcript, apiKey, frames } = request;
  const { target } = destination;
  const client: ClientOptions = { apiKey, fetch: net.fetch as typeof fetch };

  let payload: Payload;
  let proof: RenderedProof[] = [];
  if (mode !== "fix") {
    const text =
      mode === "dictate"
        ? await cleanUpDictation(transcript, client)
        : await writePrompt(transcript, target, client);
    if (!text) throw new Error("Muse Spark returned an empty result. Try again.");
    payload = { text, proof: [] };
  } else {
    const wantsProof = request.proofImages && frames.length > 0;
    const fix = await writeFixPrompt(
      {
        transcript,
        target,
        proof: wantsProof,
        frames: frames.map((frame) => ({
          id: frame.id,
          tMs: frame.tMs,
          imageUrl: dataUrl(frame.jpeg),
          width: frame.width,
          height: frame.height,
          lines: frame.lines,
        })),
      },
      client,
    );
    if (!fix.prompt) throw new Error("Muse Spark returned an empty result. Try again.");
    const shots = wantsProof ? await refineShots(fix.shots, frames, client) : [];
    proof = await renderProof(request.id, shots, frames, request.draw);
    payload = { text: fix.prompt, proof };
  }

  const outcome = await deliverPayload(payload, destination.window, target, request.autoPaste);
  return {
    result: {
      mode,
      ...outcome,
      proofImages: proof.length,
      proof: proof.map(({ title, file, preview }) => ({ title, file, preview })),
    },
    payload,
  };
}
