// SPDX-License-Identifier: AGPL-3.0-only

import { classifyTarget } from "@ivibe/engine";
import { fieldState, isOwnWindow } from "./os-bridge.ts";
import type { FocusedWindow } from "./os-bridge.ts";

/**
 * Click-to-paste (docs/architecture.md D20): when a result could only be copied, the next click
 * into a text field pastes it there, screenshots and text in order. A click counts when UI
 * Automation reports a text field under keyboard focus, or when it lands in a terminal, whose
 * input UI Automation can't see. Windows only; elsewhere the paste shortcut does the same.
 */

const POLL_MS = 150;
/** Stop waiting after this long; the result stays on the clipboard. */
export const CLICK_TO_PASTE_MS = 90_000;

export class ClickToPaste {
  readonly #onField: (window: FocusedWindow) => Promise<void>;
  readonly #onExpire: () => void;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #deadline = 0;
  #pressed = false;
  #busy = false;

  constructor(options: {
    onField: (window: FocusedWindow) => Promise<void>;
    onExpire: () => void;
  }) {
    this.#onField = options.onField;
    this.#onExpire = options.onExpire;
  }

  get armed(): boolean {
    return this.#timer !== null;
  }

  arm(): void {
    if (this.armed) return;
    this.#deadline = Date.now() + CLICK_TO_PASTE_MS;
    this.#pressed = false;
    // Clears the "clicked since last call" bit, so a click before arming doesn't count.
    void fieldState().then(() => this.#schedule());
  }

  disarm(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #schedule(): void {
    this.#timer = setTimeout(() => void this.#poll(), POLL_MS);
  }

  async #poll(): Promise<void> {
    if (!this.#timer || this.#busy) return;
    if (Date.now() > this.#deadline) {
      this.disarm();
      this.#onExpire();
      return;
    }
    const state = await fieldState();
    if (!this.#timer) return;
    if (!state) {
      // No UI Automation helper (not Windows, or it failed): nothing to watch.
      this.disarm();
      return;
    }
    // Act once the button is released, after the click has moved focus.
    if (state.down) {
      this.#pressed = true;
      this.#schedule();
      return;
    }
    const clicked = this.#pressed || state.clicked;
    this.#pressed = false;
    if (clicked && !isOwnWindow(state)) {
      const kind = classifyTarget(state.process, state.title).kind;
      if (state.editable || kind === "terminal" || kind === "terminal-agent") {
        this.disarm();
        this.#busy = true;
        try {
          await this.#onField(state);
        } finally {
          this.#busy = false;
        }
        return;
      }
    }
    this.#schedule();
  }
}
