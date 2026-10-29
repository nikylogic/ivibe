// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import type { PillStyle } from "../../shared/ipc.ts";
import { VoiceWave } from "../shared/voice-wave.tsx";
import { Waveform } from "../shared/waveform.tsx";
import type { SettingsState } from "./state.ts";

/** Settings → General → Recording pill (D29): Compact or Full, with a small live preview. */

const ink = "#f2efe8";

const styles = stylex.create({
  stage: {
    height: 88,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#2a2825",
    backgroundImage: "radial-gradient(circle at 50% 120%, #3a3732 0%, #22201d 70%)",
  },
  shown: {
    animationName: "ivibe-fade",
    animationDuration: "var(--motion-small)",
    animationTimingFunction: "var(--motion-ease)",
  },
  compact: {
    height: 36,
    display: "flex",
    alignItems: "center",
    paddingInline: 14,
    borderRadius: 999,
    backgroundColor: "rgba(15, 14, 13, 0.94)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.08)",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
  },
  full: {
    width: 300,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingBlock: 10,
    paddingInline: 14,
    borderRadius: 18,
    backgroundColor: "rgba(15, 14, 13, 0.94)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.08)",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
    color: ink,
    fontSize: 12,
  },
  caption: { color: "#a39e94" },
  controls: { display: "flex", alignItems: "center", gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: "#e5484d" },
  clock: { fontVariantNumeric: "tabular-nums", marginInlineStart: "auto" },
});

/** A voice-like level that rises and falls, so the preview moves the way the real pill does. */
function useFakeVoice(): number {
  const [level, setLevel] = useState(0.04);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      const t = Date.now() / 1000;
      const words = Math.max(0, Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1));
      setLevel(0.01 + 0.12 * words + 0.03 * Math.random());
    }, 100);
    return () => clearInterval(timer);
  }, []);
  return level;
}

const NOTE: Record<PillStyle, string> = {
  compact: "Just a waveform. Hover it for the time, Cancel and Stop.",
  full: "Live captions as you talk, with the time, Cancel and Stop.",
};

export function PillChoice({ settings }: { settings: SettingsState }) {
  const current = settings.settings;
  const pill = current?.pill ?? "compact";
  const level = useFakeVoice();
  const bars = Array.from({ length: 22 }, (_, index) => level * (0.6 + 0.4 * Math.sin(index)));

  return (
    <>
      <div>
        <SegmentedControl
          label="Recording pill"
          value={pill}
          isDisabled={!current}
          onChange={(value) => settings.change({ pill: value as PillStyle })}
        >
          <SegmentedControlItem value="compact" label="Compact" />
          <SegmentedControlItem value="full" label="Full" />
        </SegmentedControl>
      </div>
      <div {...stylex.props(styles.stage)} aria-hidden>
        <div key={pill} {...stylex.props(styles.shown)}>
          {pill === "compact" ? (
            <div {...stylex.props(styles.compact)}>
              <VoiceWave level={Math.min(1, Math.sqrt(level) * 2.4)} color={ink} />
            </div>
          ) : (
            <div {...stylex.props(styles.full)}>
              <span {...stylex.props(styles.caption)}>
                Listening. Describe the bug as you show it.
              </span>
              <div {...stylex.props(styles.controls)}>
                <span {...stylex.props(styles.dot)} />
                <Waveform levels={bars} color={ink} height={18} barWidth={2.5} gap={2} />
                <span {...stylex.props(styles.clock)}>0:08</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <Text color="secondary" size="sm">
        {NOTE[pill]}
      </Text>
    </>
  );
}
