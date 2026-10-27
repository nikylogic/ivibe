// SPDX-License-Identifier: AGPL-3.0-only

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, nativeImage, net } from "electron";
import {
  classifyTarget,
  cleanUpDictation,
  imageDelivery,
  writeFixPrompt,
  writePrompt,
} from "@ivibe/engine";
import type { ClientOptions, FixInput, TargetApp, TranscriptLine } from "@ivibe/engine";
import type { EvidenceFrame, OutputMode, RecordingResult } from "../shared/ipc.ts";
import { deliver } from "./deliver.ts";
import { focusedWindow, isOwnWindow } from "./os-bridge.ts";
import type { FocusedWindow } from "./os-bridge.ts";

/**
 * Recording → pasted text (docs/architecture.md D20): remembers which app had focus when the
 * recording started, has Muse Spark write the result for the chosen mode, and delivers it there.
 */

/** Proof screenshots that go with a Fix prompt; the model sees more frames than this. */
const PROOF_IMAGES = 3;

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
}

const pickEvenly = <T>(items: readonly T[], count: number): T[] =>
  items.length <= count
    ? [...items]
    : Array.from(
        { length: count },
        (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))]!,
      );

const dataUrl = (jpeg: Uint8Array) =>
  `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`;

/** Terminal agents read screenshots from disk; they stay in the app's data folder. */
function saveProof(id: string, frames: EvidenceFrame[]): string[] {
  const folder = join(app.getPath("userData"), "proof", id);
  mkdirSync(folder, { recursive: true });
  return frames.map((frame, index) => {
    const file = join(folder, `frame-${index + 1}.jpg`);
    writeFileSync(file, frame.jpeg);
    return file;
  });
}

export async function compose(request: ComposeRequest): Promise<RecordingResult> {
  const { mode, destination, transcript, apiKey } = request;
  const { target } = destination;
  const client: ClientOptions = { apiKey, fetch: net.fetch as typeof fetch };

  let text: string;
  let images: Uint8Array[] = [];
  let proofCount = 0;
  if (mode === "dictate") {
    text = await cleanUpDictation(transcript, client);
  } else if (mode === "prompt") {
    text = await writePrompt(transcript, target, client);
  } else {
    const delivery = request.proofImages ? imageDelivery(target) : "none";
    const proof = delivery === "none" ? [] : pickEvenly(request.frames, PROOF_IMAGES);
    let proofNote: FixInput["proof"] = { kind: "none" };
    if (delivery === "paths" && proof.length > 0) {
      proofNote = { kind: "paths", paths: saveProof(request.id, proof) };
    } else if (delivery === "paste" && proof.length > 0) {
      proofNote = { kind: "attached", count: proof.length };
      images = proof.map((frame) => nativeImage.createFromBuffer(Buffer.from(frame.jpeg)).toPNG());
    }
    proofCount = proof.length;
    text = await writeFixPrompt(
      {
        transcript,
        target,
        proof: proofNote,
        frames: request.frames.map((frame) => ({
          id: frame.id,
          tMs: frame.tMs,
          imageUrl: dataUrl(frame.jpeg),
          ocr: frame.ocr,
        })),
      },
      client,
    );
  }
  if (!text) throw new Error("Muse Spark returned an empty result. Try again.");

  const delivery = await deliver({
    window: destination.window,
    target,
    text,
    images,
    autoPaste: request.autoPaste,
  });
  return { mode, text, targetName: target.name, delivery, proofImages: proofCount };
}
