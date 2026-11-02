// SPDX-License-Identifier: AGPL-3.0-only

import type { Segment } from "./hud.tsx";

/** The three modes, and what's said in each. Both demos read these, so they can't disagree. */

export type Mode = "fix" | "prompt" | "dictate";

export const ORDER: Mode[] = ["fix", "prompt", "dictate"];
export const LABELS: Record<Mode, string> = { fix: "Fix", prompt: "Prompt", dictate: "Dictate" };

export const SAID: Record<Mode, Segment[]> = {
  fix: [
    { text: "I change my bio and hit Save,", at: 2600, final: 3400 },
    { text: "and nothing happens.", at: 3500, final: 4300 },
    { text: "The console says it can’t read map.", at: 4500, final: 5600 },
    { text: "It should save and show a toast.", at: 6000, final: 7100 },
  ],
  prompt: [
    { text: "Uh, so I want, like, a dark mode toggle.", at: 1400, final: 2400 },
    { text: "It should remember my choice.", at: 2600, final: 3500 },
    { text: "Oh and, um, follow the system setting", at: 3700, final: 4600 },
    { text: "by default, I guess.", at: 4700, final: 5500 },
  ],
  dictate: [
    { text: "Hey Asha, um, the demo is, uh,", at: 1400, final: 2300 },
    { text: "the demo is ready for tomorrow.", at: 2400, final: 3300 },
    { text: "So, like, let me know what you think.", at: 3500, final: 4500 },
  ],
};
