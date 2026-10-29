// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef } from "react";
import * as stylex from "@stylexjs/stylex";

/**
 * The compact pill's waveform: a few bars mirrored around the centre, tallest in the middle, that
 * follow the voice level smoothly at the display's frame rate. Levels arrive only every ~100 ms,
 * so each bar eases towards its target instead of jumping. In silence it breathes faintly rather
 * than lying flat; with reduced motion it just shows the level.
 */

const styles = stylex.create({
  row: { display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  bar: { borderRadius: 999, flexShrink: 0 },
});

interface VoiceWaveProps {
  /** Calls back with each new level (RMS, 0–1); returns an unsubscribe. */
  subscribe?: (listener: (rms: number) => void) => () => void;
  /** A fixed level instead of a live one (the Settings preview). */
  level?: number;
  color: string;
  bars?: number;
  height?: number;
  barWidth?: number;
  gap?: number;
}

/** Bars near the edge move less, so the shape reads as one voice rather than a meter. */
const envelope = (index: number, count: number) => {
  const x = (index - (count - 1) / 2) / ((count - 1) / 2);
  return 0.32 + 0.68 * Math.cos((x * Math.PI) / 2) ** 1.4;
};

export function VoiceWave({
  subscribe,
  level = 0,
  color,
  bars = 13,
  height = 18,
  barWidth = 2.5,
  gap = 2.5,
}: VoiceWaveProps) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const target = useRef(level);
  target.current = subscribe ? target.current : level;

  useEffect(() => {
    if (!subscribe) return;
    return subscribe((rms) => {
      // Speech sits around RMS 0.05–0.2, so a square root spreads it over the height.
      target.current = Math.min(1, Math.sqrt(rms) * 3);
    });
  }, [subscribe]);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shape = Array.from({ length: bars }, (_, index) => envelope(index, bars));
    // Each bar sways at its own speed, so a steady voice still looks alive.
    const speed = shape.map((_, index) => 2.1 + ((index * 7) % 5) * 0.37);
    const shown = shape.map(() => 0);
    let smoothed = 0;
    let frame = 0;
    let last = performance.now();

    const paint = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const t = now / 1000;
      // Rises fast and falls slowly, like a VU needle.
      const goal = target.current;
      smoothed += (goal - smoothed) * (1 - Math.exp(-dt * (goal > smoothed ? 18 : 7)));
      for (let index = 0; index < bars; index++) {
        const sway = still ? 1 : 0.72 + 0.28 * Math.sin(t * speed[index]! + index * 1.3);
        const breath = still ? 0 : 0.07 * (0.5 + 0.5 * Math.sin(t * 1.6)) * shape[index]!;
        const want = Math.max(breath, smoothed * shape[index]! * sway);
        shown[index]! += (want - shown[index]!) * (1 - Math.exp(-dt * 22));
        const bar = refs.current[index];
        if (bar) bar.style.height = `${Math.max(barWidth, shown[index]! * height).toFixed(2)}px`;
      }
      if (!still) frame = requestAnimationFrame(paint);
    };
    if (still) {
      // No animation: repaint only when a new level arrives.
      const timer = setInterval(() => paint(performance.now()), 100);
      return () => clearInterval(timer);
    }
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [bars, height, barWidth]);

  return (
    <div {...stylex.props(styles.row)} style={{ height, gap }} aria-hidden>
      {Array.from({ length: bars }, (_, index) => (
        <span
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          {...stylex.props(styles.bar)}
          style={{ width: barWidth, height: barWidth, backgroundColor: color }}
        />
      ))}
    </div>
  );
}
