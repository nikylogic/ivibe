// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import type { HudApi } from "../../preload/hud.ts";
import type { RecordingStatus } from "../../shared/ipc.ts";
import { formatClock, mount } from "../shared/theme.tsx";

declare global {
  interface Window {
    ivibeHud: HudApi;
  }
}

const styles = stylex.create({
  pill: {
    height: "100%",
    paddingInline: 14,
    borderRadius: 999,
    backgroundColor: "rgba(16, 13, 36, 0.94)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  meter: {
    width: 56,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    overflow: "hidden",
  },
  level: {
    height: "100%",
    backgroundColor: "#7c5cff",
    transition: "width 90ms linear",
  },
  warning: { color: "#ff8fb0" },
});

function Hud() {
  const [status, setStatus] = useState<RecordingStatus | null>(null);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const offState = window.ivibeHud.onState(setStatus);
    const offLevel = window.ivibeHud.onLevel(setLevel);
    return () => {
      offState();
      offLevel();
    };
  }, []);

  const elapsed = status?.elapsedMs ?? 0;
  const max = status?.maxMs ?? 60_000;
  const nearEnd = max - elapsed <= 10_000;
  const width = `${Math.min(100, Math.round(Math.sqrt(level) * 180))}%`;

  return (
    // The whole pill drags the window; the buttons opt out (global.css).
    <HStack align="center" justify="between" gap={3} xstyle={styles.pill} className="drag-region">
      <HStack align="center" gap={2}>
        <StatusDot variant="error" label="Recording" isPulsing />
        <Text weight="bold" hasTabularNumbers xstyle={nearEnd ? styles.warning : undefined}>
          {formatClock(elapsed)} / {formatClock(max)}
        </Text>
        <div {...stylex.props(styles.meter)} aria-label="Microphone level">
          <div {...stylex.props(styles.level)} style={{ width }} />
        </div>
      </HStack>
      <HStack gap={1} className="no-drag">
        <Button label="Cancel" variant="ghost" onClick={() => void window.ivibeHud.cancel()} />
        <Button label="Stop" variant="primary" onClick={() => void window.ivibeHud.stop()} />
      </HStack>
    </HStack>
  );
}

document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";
mount(<Hud />, "dark");
