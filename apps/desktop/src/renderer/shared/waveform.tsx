// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  row: { display: "flex", alignItems: "center", flexShrink: 0 },
  bar: {
    borderRadius: 999,
    transition: "height 110ms ease-out",
  },
});

/**
 * Keeps the last `count` microphone levels (RMS, 0–1) for a scrolling waveform.
 * Levels arrive about every 100 ms from the recorder.
 */
export function useLevelHistory(
  subscribe: (listener: (rms: number) => void) => () => void,
  count: number,
  isActive = true,
): number[] {
  const [levels, setLevels] = useState<number[]>(() => Array<number>(count).fill(0));
  useEffect(() => {
    if (!isActive) {
      setLevels(Array<number>(count).fill(0));
      return;
    }
    return subscribe((rms) => setLevels((previous) => [...previous.slice(1 - count), rms]));
  }, [subscribe, count, isActive]);
  return levels;
}

interface WaveformProps {
  levels: readonly number[];
  color: string;
  height: number;
  barWidth?: number;
  gap?: number;
}

/** Vertical bars centred on a line; speech peaks around RMS 0.05–0.2, so the scale is a sqrt. */
export function Waveform({ levels, color, height, barWidth = 3, gap = 2 }: WaveformProps) {
  return (
    <div {...stylex.props(styles.row)} style={{ height, gap }} aria-hidden>
      {levels.map((level, index) => {
        const size = Math.max(barWidth, Math.min(height, Math.sqrt(level) * height * 2.6));
        return (
          <span
            key={index}
            {...stylex.props(styles.bar)}
            style={{ width: barWidth, height: size, backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}
