// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { BAR, BARS, envelope, talking, TALLEST } from "./hud.tsx";
import { MONO } from "./kit.tsx";
import { currentTone, speech, TONES } from "./voice.ts";
import type { Tone } from "./voice.ts";

/**
 * The hero's waveform, made of what you say. Each of the pill's 13 bars is drawn as columns of
 * characters, in the pill's own units, so the camera that pulls back to the small pill shrinks
 * them too: the letters become a texture and then the real bars, which fade in underneath. At the
 * tips of a bar the words break down into dots, the way noise turns into words.
 *
 * Right inside the pill those 13 bars are far too wide to read as a voice, so there they split into
 * many fine bars under one lens-shaped outline, a whole waveform that fits on the screen. Pulling
 * back, the fine bars merge into the 13.
 *
 * Under the cursor the noise tidies up: the drifting letters settle into straight lines of plain
 * words, which is what iVibe does to a voice. They never light up behind the hero's own text.
 *
 * On an upright phone the same idea has far less width, so the letters are finer, the wave stays
 * inside the screen, and it parts around the text: a wave above and below, a clean band between.
 */

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
const smooth = (value: number, from: number, to: number) => {
  const amount = clamp01((value - from) / (to - from));
  return amount * amount * (3 - 2 * amount);
};

export type Camera = { x: number; y: number; k: number; p: number };

const SPOKEN = "show the bug say it out loud get the prompt fix prompt dictate just talk ";
const TIDY = "show the bug say what's wrong paste the prompt tidies up everything you say ";
const DOTS = ".:";
const GLYPHS = [...new Set(SPOKEN + TIDY + DOTS)].filter((glyph) => glyph !== " ");
/** How far from the cursor the letters tidy up, in screen pixels. */
const TIDY_RADIUS = 150;
const GLYPH_PX = 28;
const COLUMNS = 10;
const CELL_W = BAR / COLUMNS;
const CELL_H = CELL_W * 1.72;
/** A true bar and the gap after it, in columns of characters. */
const BAR_PERIOD = COLUMNS * 2;
const ALL_COLUMNS = BARS * BAR_PERIOD - COLUMNS;
/** A fine bar and its gap, in columns. */
const FINE_PERIOD = 4;
const FRAME_MS = 33;
const CREAM = "#f4f1ea";
/** An upright phone's letters, as a share of their size elsewhere, and how often they're drawn. */
const PHONE_LETTERS = 0.72;
const PHONE_FRAME_MS = 50;
/**
 * The clean band has no edge to see. Past a margin around the text the letters fade in slowly, over
 * this share of the room the wave has, and the fade arches away from the text at the middle.
 */
const CLEAR_MARGIN = 10;
const CLEAR_FADE = 0.45;
const CLEAR_ARCH = 0.18;
/** What the wave leaves free above it (the frame) and below it (the frame and the scroll hint). */
const ROOM_ABOVE = 40;
const ROOM_BELOW = 76;
/** How often the text is measured, in ms. */
const MEASURE_MS = 400;

export const uprightPhone = (width: number, height: number) => width < 700 && height > width;

/** Gone by the time the camera has pulled far back enough for the real bars to read. */
export const asciiFade = (p: number) => {
  const amount = clamp01((p - 0.16) / 0.18);
  return 1 - amount * amount * (3 - 2 * amount);
};

/** Every character once, on a strip, so a frame only copies small images. */
function glyphStrip(colour: string) {
  const strip = document.createElement("canvas");
  strip.width = GLYPHS.length * GLYPH_PX;
  strip.height = GLYPH_PX * 1.5;
  const context = strip.getContext("2d");
  if (context) {
    context.font = `500 ${GLYPH_PX}px ${MONO}`;
    context.fillStyle = colour;
    context.textAlign = "center";
    context.textBaseline = "middle";
    GLYPHS.forEach((glyph, index) => {
      context.fillText(glyph, (index + 0.5) * GLYPH_PX, strip.height / 2);
    });
  }
  return strip;
}

export function AsciiWave({
  camera,
  width,
  height,
  clipPath,
  quiet,
}: {
  camera: RefObject<Camera>;
  width: number;
  height: number;
  /** The shape the characters stay inside. */
  clipPath?: string;
  /** On an upright phone: where the text is on screen, which the letters stay clear of. */
  quiet?: () => { top: number; bottom: number } | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = uprightPhone(width, height);
    // Finer letters need the sharper canvas to stay letters.
    const scale = Math.min(phone ? 2 : 1.5, window.devicePixelRatio || 1);
    const frameMs = phone ? PHONE_FRAME_MS : FRAME_MS;
    let clear: { top: number; bottom: number } | null = null;
    let measured = Number.NEGATIVE_INFINITY;
    element.width = Math.round(width * scale);
    element.height = Math.round(height * scale);
    // The characters in cream, and in each mode's colour for the light that passes through them.
    const drawStrips = () => ({
      cream: glyphStrip(CREAM),
      Fix: glyphStrip(`rgb(${TONES.Fix})`),
      Prompt: glyphStrip(`rgb(${TONES.Prompt})`),
      Dictate: glyphStrip(`rgb(${TONES.Dictate})`),
    });
    let strips: Record<"cream" | Tone, HTMLCanvasElement> = drawStrips();
    void document.fonts.ready.then(() => {
      strips = drawStrips();
      // The text may have moved as the fonts arrived; a still frame has to be drawn again.
      measured = Number.NEGATIVE_INFINITY;
      if (still) raf = requestAnimationFrame(paint);
    });

    const levels = Array.from({ length: BARS }, () => 0.3);
    let raf = 0;
    let last = 0;
    let wiped = false;
    // Off screen, nothing is drawn.
    let onScreen = true;
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
    });
    visibility.observe(element);
    // The cursor, on this canvas; `soft` trails it a little so the words settle rather than snap.
    const cursor = { x: 0, y: 0, on: false };
    const soft = { x: 0, y: 0, amount: 0 };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = element.getBoundingClientRect();
      cursor.x = event.clientX - box.left;
      cursor.y = event.clientY - box.top;
      if (soft.amount < 0.01) {
        soft.x = cursor.x;
        soft.y = cursor.y;
      }
      cursor.on = true;
    };
    const onLeave = () => {
      cursor.on = false;
    };

    const paint = (time: number) => {
      if (!still) raf = requestAnimationFrame(paint);
      if (!still && (!onScreen || time - last < frameMs)) return;
      const dt = Math.min(100, time - last) / 1000;
      last = time;

      const { x, y, k: cameraK, p } = camera.current;
      // 1 right inside the pill, where the fine waveform shows; 0 once they're the 13 true bars.
      const inside = 1 - smooth(p, 0, 0.16);
      const k = phone ? cameraK * mix(1, PHONE_LETTERS, inside) : cameraK;
      if (phone && quiet && p < 0.02 && time - measured > MEASURE_MS) {
        measured = time;
        const text = quiet();
        const box = element.getBoundingClientRect();
        clear = text && {
          top: text.top - box.top - CLEAR_MARGIN,
          bottom: text.bottom - box.top + CLEAR_MARGIN,
        };
      }
      const fade = asciiFade(p);
      if (fade <= 0) {
        if (!wiped) context.clearRect(0, 0, element.width, element.height);
        wiped = true;
        element.style.visibility = "hidden";
        return;
      }
      wiped = false;
      element.style.visibility = "visible";
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);

      // The same voice as the real bars, so the two line up as one fades into the other.
      const spoken = still ? 0 : speech(time);
      const trueLevel = still
        ? 0.6
        : Math.min(1, Math.max(0.5, talking(time) * 0.85) + spoken * 0.5);
      const seconds = time / 1000;
      // Letters change slowly, so the field breathes instead of flickering.
      const scroll = Math.floor(time / 620);
      const cellW = CELL_W * k;
      const cellH = CELL_H * k;
      const size = cellW * 1.25;
      const firstBar = -((BARS - 1) * BAR);
      // The words of the hero need a calm middle, until they've gone.
      const words = 1 - smooth(p, 0.12, 0.26);
      const brightest = mix(0.62, phone ? 0.62 : 0.27, inside);
      const tone = currentTone();
      const follow = 1 - Math.exp(-dt * 9);
      soft.x += (cursor.x - soft.x) * follow;
      soft.y += (cursor.y - soft.y) * follow;
      soft.amount += ((cursor.on ? 1 : 0) - soft.amount) * (1 - Math.exp(-dt * 4));
      const tidying = soft.amount * inside;

      // A faint field of dots between the bars, so the dark reads as made of the same stuff.
      if (inside > 0.01) {
        context.fillStyle = CREAM;
        const stepX = cellW * 3;
        const stepY = cellH * 3;
        const dot = Math.max(1, cellW * 0.12);
        const startX = ((x % stepX) + stepX) % stepX;
        const startY = ((y % stepY) + stepY) % stepY;
        context.globalAlpha = 0.07 * inside * fade;
        for (let sx = startX; sx < width; sx += stepX) {
          for (let sy = startY; sy < height; sy += stepY) {
            if (clear && sy > clear.top && sy < clear.bottom) continue;
            context.fillRect(sx, sy, dot, dot);
          }
        }
      }

      for (let bar = 0; bar < BARS; bar++) {
        const sway = still
          ? 1
          : 0.8 +
            0.16 * Math.sin(seconds * 1.9 - bar * 0.55) +
            0.06 * Math.sin(seconds * 3.1 + bar * 1.7);
        const want = trueLevel * envelope(bar, BARS) * sway;
        levels[bar]! += (want - levels[bar]!) * (1 - Math.exp(-dt * (7 + 10 * spoken)));
      }

      // How far a bar could reach out from the clean band, above it and below it.
      const roomAbove = clear ? Math.max(0, clear.top - ROOM_ABOVE) : 0;
      const roomBelow = clear ? Math.max(0, height - clear.bottom - ROOM_BELOW) : 0;
      const leftEdge = firstBar - BAR / 2;
      for (let column = 0; column < ALL_COLUMNS; column++) {
        const onBar = column % BAR_PERIOD < COLUMNS;
        const onFine = column % FINE_PERIOD !== FINE_PERIOD - 1;
        const lit = mix(onBar ? 1 : 0, onFine ? 1 : 0, inside);
        const sx = x + (leftEdge + (column + 0.5) * CELL_W) * k;
        if (sx < -cellW || sx > width + cellW) continue;

        // The outline: tallest mid-screen, tapering to almost nothing, so the corners stay empty.
        const fine = Math.floor(column / FINE_PERIOD);
        const across = Math.min(1, Math.abs((sx - width / 2) / (width * 0.48)));
        const lens = (1 - across * across) ** (phone ? 0.5 : 0.8);
        const rough = 0.5 + 0.5 * Math.sin(fine * 12.9898);
        const voiced =
          0.56 +
          0.2 * Math.sin(seconds * 0.8 - fine * 0.3) +
          0.08 * Math.sin(seconds * 1.5 + fine * 1.1) +
          0.2 * rough;
        const fineReach = clear
          ? Math.max(y - clear.top + roomAbove, clear.bottom - y + roomBelow) / k
          : (height * (0.012 + 0.62 * lens * voiced)) / k;
        // On a phone the bars start at the clean band, so the whole wave shows around the text.
        const share = 0.08 + 0.92 * Math.min(1, lens * voiced);

        const bar = Math.min(BARS - 1, Math.floor(column / BAR_PERIOD));
        const barReach = Math.max(BAR / 2, (levels[bar]! * TALLEST) / 2);
        const reach = mix(barReach, fineReach, inside);
        // Beside the cursor the words can reach past the wave's outline.
        const nearby = tidying > 0.01 && Math.abs(sx - soft.x) < TIDY_RADIUS;
        if (lit <= 0.01 && !nearby) continue;
        const rows = Math.max(
          Math.ceil(reach / CELL_H),
          nearby ? Math.ceil((Math.abs(soft.y - y) + TIDY_RADIUS) / cellH) : 0,
        );

        // The sides of a true bar are softer than its middle, so it reads as a round shape.
        const inBar = ((column % BAR_PERIOD) + 0.5) / COLUMNS - 0.5;
        const side = mix(1 - Math.min(1, (Math.abs(inBar) * 2) ** 3) * 0.55, 1, inside);
        // Each column drifts at its own place in the text.
        const offset = column * 29 + (column % 2 ? scroll : -scroll);
        for (let row = -rows; row <= rows; row++) {
          let along = Math.abs(row * CELL_H) / reach;
          const sy = y + row * cellH;
          if (sy < -cellH || sy > height + cellH) continue;
          let calm: number;
          if (clear) {
            const beyond = Math.max(clear.top - sy, sy - clear.bottom);
            const fullRoom = sy < clear.top ? roomAbove : roomBelow;
            const arch = fullRoom * CLEAR_ARCH * (1 - across * across);
            calm = 1 - words * (1 - smooth(beyond - arch, 0, fullRoom * CLEAR_FADE));
            const room = fullRoom * share;
            along = mix(along, beyond > 0 ? beyond / Math.max(1, room) : 0, inside);
          } else {
            const fromMiddle =
              ((sx - width / 2) / (width * 0.22)) ** 2 + ((sy - height / 2) / (height * 0.26)) ** 2;
            calm = 1 - words * (1 - clamp01((fromMiddle - 0.65) / 0.55));
          }
          if (calm <= 0.01) continue;
          // Nearest the cursor every letter has tidied; further out only some have, in no order.
          const fromCursor = nearby ? Math.hypot(sx - soft.x, sy - soft.y) : TIDY_RADIUS;
          const tidy = tidying * (1 - smooth(fromCursor, TIDY_RADIUS * 0.3, TIDY_RADIUS));
          const luck = Math.sin(column * 12.9898 + row * 78.233) * 43758.5453;
          const tidied = tidy > 0.12 + 0.68 * (luck - Math.floor(luck));
          if (!tidied && (along > 1 || lit <= 0.01)) continue;
          let glyph: string;
          if (tidied) {
            const at = (column + row * 23) % TIDY.length;
            glyph = TIDY[at < 0 ? at + TIDY.length : at]!;
          } else if (along > 0.9) glyph = ".";
          else if (along > 0.76) glyph = ":";
          else {
            const at = (row + offset) % SPOKEN.length;
            glyph = SPOKEN[at < 0 ? at + SPOKEN.length : at]!;
          }
          const index = GLYPHS.indexOf(glyph);
          if (index < 0) continue;
          const place = column / BAR_PERIOD;
          // A slow swell of light rising through the bar.
          const swell = 0.8 + 0.2 * Math.sin(seconds * 0.7 - row * 0.12 + place * 0.8);
          const alpha = tidied
            ? mix(0.34, 0.72, tidy)
            : (1 - along * along * 0.65) * side * swell * brightest * lit;
          // The mode's colour moves through the letters as a slow, thin band of light.
          // On a phone it keeps to the tall bars, or it shows as specks at the wave's thin ends.
          const band =
            smooth(Math.sin(seconds * 0.42 - place * 0.33 - row * 0.03), 0.86, 0.995) *
            (phone ? smooth(lens, 0.5, 0.85) : 1);
          const coloured = band > 0.04 && !tidied;
          context.globalAlpha =
            (coloured ? mix(alpha, Math.max(alpha, 0.58 * side * lit), band) : alpha) * fade * calm;
          context.drawImage(
            strips[coloured ? tone : "cream"],
            index * GLYPH_PX,
            0,
            GLYPH_PX,
            GLYPH_PX * 1.5,
            sx - size / 2,
            sy - (size * 1.5) / 2,
            size,
            size * 1.5,
          );
        }
      }
      context.globalAlpha = 1;
    };
    raf = requestAnimationFrame(paint);
    if (still) {
      // Reduced motion: one frame, and again whenever the page scrolls. A frame later, because the
      // camera moves on the same scroll, and this would otherwise paint where it was.
      const again = () => requestAnimationFrame(() => requestAnimationFrame(paint));
      window.addEventListener("scroll", again, { passive: true });
      return () => {
        window.removeEventListener("scroll", again);
        visibility.disconnect();
        cancelAnimationFrame(raf);
      };
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      visibility.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [camera, width, height, quiet]);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        pointerEvents: "none",
        clipPath,
      }}
    />
  );
}
