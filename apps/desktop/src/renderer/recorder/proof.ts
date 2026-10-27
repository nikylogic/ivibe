// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Draws a proof screenshot (docs/architecture.md §5.7): everything outside the highlights is
 * dimmed, each highlight gets an outline and a numbered caption, and a header says what the
 * screenshot proves. Sizes are tuned for a 1280-px frame and scale with the image.
 */

import type { ProofDrawing } from "../../shared/ipc.ts";

const ACCENT = "#ff4f2e";
const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

function roundedRect(
  context: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
}

/** Shortens text with an ellipsis until it fits. */
function fit(context: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && context.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--;
  return `${text.slice(0, end)}…`;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

interface Chip {
  label: string;
  width: number;
  height: number;
  size: number;
  fill: string;
}

/** A pill with one line of text, measured so it can be placed before it is drawn. */
function measureChip(
  context: OffscreenCanvasRenderingContext2D,
  text: string,
  options: { size: number; fill: string; maxWidth: number },
): Chip {
  const { size, fill, maxWidth } = options;
  context.font = `600 ${size}px ${FONT}`;
  const label = fit(context, text, maxWidth - size * 1.4);
  return {
    label,
    width: context.measureText(label).width + size * 1.4,
    height: size * 1.9,
    size,
    fill,
  };
}

function drawChip(context: OffscreenCanvasRenderingContext2D, chip: Chip, x: number, y: number) {
  context.font = `600 ${chip.size}px ${FONT}`;
  context.fillStyle = chip.fill;
  context.beginPath();
  roundedRect(context, x, y, chip.width, chip.height, chip.height / 2);
  context.fill();
  context.fillStyle = "#ffffff";
  context.textBaseline = "middle";
  context.fillText(chip.label, x + chip.size * 0.7, y + chip.height / 2 + chip.size * 0.04);
}

/**
 * Puts a chip at the first candidate spot that covers no highlight and no other chip, kept inside
 * the image. If every spot collides, the first one is used.
 */
function place(
  chip: Chip,
  candidates: { x: number; y: number }[],
  obstacles: Rect[],
  bounds: { width: number; height: number; margin: number },
): Rect {
  const { width, height, margin } = bounds;
  const clamped = candidates.map(({ x, y }) => ({
    x: Math.max(margin, Math.min(x, width - chip.width - margin)),
    y: Math.max(margin, Math.min(y, height - chip.height - margin)),
    width: chip.width,
    height: chip.height,
  }));
  return clamped.find((rect) => !obstacles.some((other) => overlaps(rect, other))) ?? clamped[0]!;
}

export async function drawProof(drawing: ProofDrawing): Promise<string> {
  // Decoded by hand: the page's CSP (connect-src 'self') blocks fetch() of data: URLs.
  const [meta = "", base64 = ""] = drawing.imageUrl.split(",", 2);
  const type = /^data:([^;]+)/.exec(meta)?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const image = await createImageBitmap(new Blob([bytes], { type }));
  const { width, height } = image;
  const k = width / 1280;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  context.drawImage(image, 0, 0);
  image.close();

  const pad = 4 * k;
  const radius = 8 * k;
  const holes = drawing.marks.map(({ box }) => ({
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  }));

  if (holes.length > 0) {
    // Dim everything but the highlights (even-odd leaves the holes untouched).
    context.beginPath();
    context.rect(0, 0, width, height);
    for (const hole of holes) roundedRect(context, hole.x, hole.y, hole.width, hole.height, radius);
    context.fillStyle = "rgba(8, 8, 12, 0.5)";
    context.fill("evenodd");
  }

  for (const hole of holes) {
    context.beginPath();
    roundedRect(context, hole.x, hole.y, hole.width, hole.height, radius);
    // A white halo keeps the outline visible on dark and light UIs.
    context.lineWidth = 7 * k;
    context.strokeStyle = "rgba(255, 255, 255, 0.85)";
    context.stroke();
    context.lineWidth = 3.5 * k;
    context.strokeStyle = ACCENT;
    context.stroke();
  }

  const margin = 12 * k;
  const gap = 8 * k;
  const bounds = { width, height, margin };
  const obstacles: Rect[] = [...holes];

  // The header goes in whichever corner is clear, top-left first.
  const header = measureChip(context, drawing.header, {
    size: Math.max(12, 15 * k),
    fill: "rgba(17, 17, 22, 0.88)",
    maxWidth: Math.min(width - margin * 2, 760 * k),
  });
  const headerAt = place(
    header,
    [
      { x: margin, y: margin },
      { x: margin, y: height },
      { x: width, y: margin },
      { x: width, y: height },
    ],
    obstacles,
    bounds,
  );
  drawChip(context, header, headerAt.x, headerAt.y);
  obstacles.push(headerAt);

  // Each caption sits beside its highlight: above, below, right or left, whichever is free.
  const size = Math.max(12, 16 * k);
  drawing.marks.forEach((mark, index) => {
    const hole = holes[index]!;
    const chip = measureChip(context, `${mark.n}  ${mark.caption}`, {
      size,
      fill: ACCENT,
      maxWidth: Math.min(width - margin * 2, 520 * k),
    });
    const above = hole.y - gap - chip.height;
    const below = hole.y + hole.height + gap;
    const middle = hole.y + (hole.height - chip.height) / 2;
    const at = place(
      chip,
      [
        { x: hole.x, y: above },
        { x: hole.x, y: below },
        { x: hole.x + hole.width + gap, y: middle },
        { x: hole.x - gap - chip.width, y: middle },
        { x: hole.x + hole.width - chip.width, y: above },
        { x: hole.x + hole.width - chip.width, y: below },
      ],
      obstacles,
      bounds,
    );
    drawChip(context, chip, at.x, at.y);
    obstacles.push(at);
  });

  const png = await canvas.convertToBlob({ type: "image/png" });
  const output = new Uint8Array(await png.arrayBuffer());
  let binary = "";
  for (let i = 0; i < output.length; i += 0x8000) {
    binary += String.fromCharCode(...output.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
