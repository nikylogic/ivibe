// SPDX-License-Identifier: AGPL-3.0-only

import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Monitor, Moon, Sun } from "lucide-react";

/** Light, system or dark: at the top of the hero, and in the footer. */
export function ThemeSwitch({
  mode,
  onModeChange,
  size = "sm",
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
  size?: "sm" | "lg";
}) {
  return (
    <SegmentedControl
      label="Appearance"
      size={size}
      value={mode}
      onChange={(value) => onModeChange(value as ThemeMode)}
    >
      <SegmentedControlItem value="light" label="Light" isLabelHidden icon={<Sun size={14} />} />
      <SegmentedControlItem
        value="system"
        label="System"
        isLabelHidden
        icon={<Monitor size={14} />}
      />
      <SegmentedControlItem value="dark" label="Dark" isLabelHidden icon={<Moon size={14} />} />
    </SegmentedControl>
  );
}
