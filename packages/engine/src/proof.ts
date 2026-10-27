// SPDX-License-Identifier: AGPL-3.0-only

import { createResponse, outputText } from "./responses.ts";
import type { ClientOptions } from "./responses.ts";

/**
 * Proof highlights (docs/architecture.md §5.7). Muse Spark says which frames prove the bug and
 * what to mark in each: OCR lines are drawn exactly from their boxes, and UI elements start as
 * the model's rough box, which SAM 3.1 snaps to the element (Spike S6: a box prompt refined a
 * loose box to the button in ~2 s; a concept prompt such as "save button" found nothing).
 */

/** A rectangle in frame pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ProofMark {
  /** Short label drawn next to the highlight ("Clicked Save, nothing happened"). */
  caption: string;
  box: Box;
  /**
   * "text": OCR lines, drawn exactly. "label": one short OCR line, likely on a button or tab, that
   * SAM grows to the element around it. "element": the model's rough box, which SAM snaps.
   */
  source: "text" | "label" | "element";
}

export interface ProofShot {
  frameId: string;
  tMs: number;
  /** One line saying what this screenshot proves. */
  title: string;
  marks: ProofMark[];
}

/** Highlights smaller than this are not worth drawing (§5.6, rule V6). */
export const MIN_SIDE = 12;
/** Room left around OCR text so the outline doesn't touch the letters. */
export const TEXT_PADDING = 6;

export function unionBoxes(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x1 = Math.min(...boxes.map((box) => box.x));
  const y1 = Math.min(...boxes.map((box) => box.y));
  const x2 = Math.max(...boxes.map((box) => box.x + box.width));
  const y2 = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function padBox(box: Box, padding: number): Box {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}

/** Keeps a box inside the frame; null if what is left is too small to see. */
export function clampBox(box: Box, size: Size): Box | null {
  const x1 = Math.max(0, Math.round(box.x));
  const y1 = Math.max(0, Math.round(box.y));
  const x2 = Math.min(size.width, Math.round(box.x + box.width));
  const y2 = Math.min(size.height, Math.round(box.y + box.height));
  if (x2 - x1 < MIN_SIDE || y2 - y1 < MIN_SIDE) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

const area = (box: Box) => box.width * box.height;

function intersection(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * SAM answers with the object it found inside the prompt box. If that drifts far from what the
 * model asked for (a different element, or the whole panel), the model's box is kept.
 */
export function acceptRefinement(proposed: Box, refined: Box): boolean {
  const overlap = intersection(proposed, refined);
  return overlap >= area(refined) * 0.6 && area(refined) >= area(proposed) * 0.08;
}

/**
 * A label grows to its element (Spike S6: the word "Save" padded by 24 px came back as the whole
 * button). The answer must still contain the text and stay element-sized, not a whole panel.
 */
export function acceptGrowth(text: Box, refined: Box, size: Size): boolean {
  return (
    intersection(text, refined) >= area(text) * 0.9 &&
    area(refined) <= area(text) * 20 &&
    refined.width <= size.width * 0.5
  );
}

/** Room given around a label so SAM sees the element it sits on, at 1280 px wide. */
const LABEL_REACH = 24;

/** First box record of a SAM response: `<0f>1<|box;x1=46;y1=418;x2=220;y2=469;w=…;h=…|>`. */
export function parseSamBox(output: string): Box | null {
  const record = /<\|box;([^|]*)\|>/.exec(output);
  if (!record) return null;
  const fields = Object.fromEntries(
    record[1]!.split(";").map((pair) => {
      const [key, value] = pair.split("=");
      return [key, Number(value)];
    }),
  );
  const { x1, y1, x2, y2 } = fields;
  if (![x1, y1, x2, y2].every((value) => Number.isFinite(value))) return null;
  // x2 and y2 are inclusive.
  return { x: x1!, y: y1!, width: x2! - x1! + 1, height: y2! - y1! + 1 };
}

/** Asks SAM 3.1 for the object inside a box prompt. */
async function segmentBox(
  imageUrl: string,
  box: Box,
  size: Size,
  client: ClientOptions,
): Promise<Box | null> {
  const x2 = Math.min(size.width - 1, box.x + box.width - 1);
  const y2 = Math.min(size.height - 1, box.y + box.height - 1);
  const prompt = `<0f>1<|box;x1=${box.x};y1=${box.y};x2=${x2};y2=${y2};w=${size.width};h=${size.height}|>`;
  const result = await createResponse(
    {
      model: "sam-3.1",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageUrl },
          ],
        },
      ],
    },
    client,
  );
  return parseSamBox(outputText(result));
}

/**
 * Fits a highlight to what it points at with SAM 3.1: element boxes snap to the element, labels
 * grow to their button. Returns null to keep the original box; exact text is never sent.
 */
export async function refineMark(
  imageUrl: string,
  mark: ProofMark,
  size: Size,
  client: ClientOptions,
): Promise<Box | null> {
  if (mark.source === "text") return null;
  if (mark.source === "element") {
    const refined = await segmentBox(imageUrl, mark.box, size, client);
    return refined && acceptRefinement(mark.box, refined) ? clampBox(refined, size) : null;
  }
  const reach = Math.round((LABEL_REACH * size.width) / 1280);
  const prompt = clampBox(padBox(mark.box, reach), size);
  if (!prompt) return null;
  const refined = await segmentBox(imageUrl, prompt, size, client);
  return refined && acceptGrowth(mark.box, refined, size) ? clampBox(refined, size) : null;
}
