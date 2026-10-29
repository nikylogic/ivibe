// SPDX-License-Identifier: AGPL-3.0-only

import { flushSync } from "react-dom";

/**
 * Applies a state change through a view transition, styled in global.css by its type:
 * `page` (the old page fades out as the new one rises in) or `mode` (the page cross-fades in
 * place). Falls back to an instant change where view transitions aren't supported.
 */
export function transition(type: "page" | "mode", update: () => void) {
  if (!document.startViewTransition) return update();
  document.startViewTransition({ update: () => flushSync(update), types: [type] });
}
