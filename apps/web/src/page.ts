// SPDX-License-Identifier: AGPL-3.0-only

import type { ComponentType } from "react";
import type { ThemeMode } from "@astryxdesign/core/theme";

/** What every page takes. */
export type PageComponent = ComponentType<{
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}>;
