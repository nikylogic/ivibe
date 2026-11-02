// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { HStack } from "@astryxdesign/core/HStack";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { ThemeSwitch } from "./theme-switch.tsx";

const styles = stylex.create({
  bar: {
    position: "fixed",
    // Under this width the switch is in the navbar's menu, and here it would overlap the navbar.
    display: { default: "flex", "@media (max-width: 899px)": "none" },
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: "center",
    // No brand on the left: the hero names iVibe. Just GitHub and the theme, on the right.
    justifyContent: "flex-end",
    // Level with the navbar, and clear of the top edge of the hero's frame.
    paddingBlock: 19,
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
  },
});

export function TopBar({
  mode,
  onModeChange,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  // The theme switch rests here through the hero and the demo, and leaves below the demo (the
  // footer has it there).
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const check = () => {
      const demo = document.getElementById("modes");
      setBelow(!!demo && demo.getBoundingClientRect().bottom < window.innerHeight - 1);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);
  return (
    <header
      className="touch-area"
      {...stylex.props(styles.bar)}
      style={{
        opacity: below ? 0 : 1,
        pointerEvents: below ? "none" : undefined,
        transition: "opacity 300ms ease",
      }}
    >
      <HStack gap={2} vAlign="center">
        <ThemeSwitch mode={mode} onModeChange={onModeChange} />
      </HStack>
    </header>
  );
}
