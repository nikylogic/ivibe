// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The hero's voice: the rotating headline "says" each new line, and the pill's waveform swells
 * with it while the words type in. It also carries the mode being shown, which tints the light
 * inside the pill. A tiny shared signal, read every frame by the pill without React.
 */

export type Tone = "Fix" | "Prompt" | "Dictate";

/** The light inside the pill for each mode: coral for bugs, amber for prompts, violet for words. */
export const TONES: Record<Tone, string> = {
  Fix: "255, 128, 96",
  Prompt: "255, 186, 104",
  Dictate: "178, 142, 255",
};

/** How long each word takes to say and type in, in ms. */
export const WORD_MS = 110;

let spokeAt = Number.NEGATIVE_INFINITY;
let speakMs = 0;
/** The mode the headline last said, and the one the playing demo holds, if any. */
let heard: Tone = "Fix";
let held: Tone | null = null;
const listeners = new Set<(tone: Tone) => void>();

function tell(): void {
  for (const listener of listeners) listener(currentTone());
}

/** Says a line: the waveform speaks for as long as its words take, in the line's mode. */
export function say(text: string, next: Tone): void {
  spokeAt = performance.now();
  // A little longer than the typing, so the voice is heard as the line settles.
  speakMs = Math.max(900, text.split(/\s+/).length * WORD_MS * 1.6);
  heard = next;
  tell();
}

const smooth = (from: number, to: number, value: number) => {
  const x = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return x * x * (3 - 2 * x);
};

/** How loud the line being said is at `time` (performance.now()), 0 when quiet, up to 1. */
export function speech(time: number): number {
  const s = time - spokeAt;
  if (s < 0 || s > speakMs + 320) return 0;
  const envelope = smooth(0, 140, s) * (1 - smooth(speakMs - 60, speakMs + 320, s));
  // A syllable-like rise and fall for each word.
  const word = (s % WORD_MS) / WORD_MS;
  const syllable = 0.55 + 0.45 * Math.sin(Math.PI * word) ** 1.5;
  return envelope * syllable;
}

export function currentTone(): Tone {
  return held ?? heard;
}

/** While the demo plays, its mode sets the colour instead of the headline. Null lets go. */
export function holdTone(next: Tone | null): void {
  held = next;
  tell();
}

/** Calls `listener` whenever the mode changes; returns the unsubscribe. */
export function onTone(listener: (tone: Tone) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
