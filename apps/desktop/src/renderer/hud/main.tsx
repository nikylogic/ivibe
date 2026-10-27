// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Square, X } from "lucide-react";
import type { HudApi } from "../../preload/hud.ts";
import type { RecordingStatus } from "../../shared/ipc.ts";
import { withClass } from "../shared/shortcut.tsx";
import { formatClock, mount } from "../shared/theme.tsx";
import { Waveform, useLevelHistory } from "../shared/waveform.tsx";

declare global {
  interface Window {
    ivibeHud: HudApi;
  }
}

const styles = stylex.create({
  frame: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    height: 44,
    paddingInlineStart: 16,
    paddingInlineEnd: 6,
    borderRadius: 999,
    backgroundColor: "#0f0e0d",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.08)",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)",
    animationName: "ivibe-rise",
    animationDuration: "220ms",
    animationTimingFunction: "ease-out",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#e5484d", // signal.recording; StyleX needs a literal
    animationName: "ivibe-pulse",
    animationDuration: "1.6s",
    animationIterationCount: "infinite",
  },
  clock: {
    minWidth: 40,
    color: "#f2efe8",
    fontSize: 13,
    fontWeight: 500,
    fontVariantNumeric: "tabular-nums",
  },
  clockWarning: { color: "#ff9c8a" },
  divider: { width: 1, height: 20, backgroundColor: "rgba(255, 255, 255, 0.1)" },
  actions: { display: "flex", alignItems: "center", gap: 2 },
});

function Hud() {
  const [status, setStatus] = useState<RecordingStatus | null>(null);
  const levels = useLevelHistory(window.ivibeHud.onLevel, 22);

  useEffect(() => window.ivibeHud.onState(setStatus), []);

  const elapsed = status?.elapsedMs ?? 0;
  const max = status?.maxMs ?? 60_000;
  const nearEnd = max - elapsed <= 10_000;

  return (
    <div {...stylex.props(styles.frame)}>
      {/* The pill drags the window; the buttons opt out (global.css). */}
      <div {...withClass("drag-region", styles.pill)} role="status">
        <span {...stylex.props(styles.dot)} aria-label="Recording" />
        <Waveform levels={levels} color="#f2efe8" height={22} barWidth={2.5} gap={2} />
        <span {...stylex.props(styles.clock, nearEnd && styles.clockWarning)}>
          {formatClock(nearEnd ? max - elapsed : elapsed)}
        </span>
        <span {...stylex.props(styles.divider)} />
        <div {...withClass("no-drag", styles.actions)}>
          <IconButton
            label="Cancel recording"
            variant="ghost"
            size="sm"
            icon={<X size={16} strokeWidth={2} />}
            onClick={() => void window.ivibeHud.cancel()}
          />
          <IconButton
            label="Stop recording"
            variant="primary"
            size="sm"
            icon={<Square size={12} strokeWidth={0} fill="currentColor" />}
            onClick={() => void window.ivibeHud.stop()}
          />
        </div>
      </div>
    </div>
  );
}

document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";
mount(<Hud />, "dark");
