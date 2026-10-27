// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The Dictate shortcut's gestures:
 *
 * - Hold: recording starts on the press and stops on release, push-to-talk.
 * - Double-press: recording starts hands-free; another double-press stops it.
 * - A single short tap does nothing (the recording it started is cancelled).
 *
 * Recording starts on the first press so no words are lost while the gesture is still unclear.
 * Global hotkeys only report presses (repeated while held), so release comes from polling the
 * key's state.
 */

/** Held at least this long, a press is push-to-talk. */
export const HOLD_MS = 300;
/** A second press within this long of the first release makes a double-press. */
export const DOUBLE_MS = 400;
const POLL_MS = 40;

export interface GestureActions {
  /** Whether the shortcut's main key is physically down. */
  isHeld: () => Promise<boolean>;
  isRecording: () => boolean;
  start: () => void;
  stop: () => void;
  cancel: () => void;
  /** The gesture is over (idle or hands-free): a good time to put Caps Lock back. */
  settled: () => void;
}

type State =
  | "idle"
  /** Down, not yet long enough to be a hold. */
  | "pressed"
  | "holding"
  /** Released after a short press; a second press would make it a double. */
  | "tapped"
  | "handsfree"
  /** Hands-free, and one press of a stopping double-press has landed. */
  | "handsfreeTapped";

export class DictateGesture {
  #state: State = "idle";
  /** The key is down; repeated hotkey events while held are ignored. */
  #down = false;
  #pressedAt = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #polling = false;

  readonly #actions: GestureActions;
  readonly #now: () => number;

  constructor(actions: GestureActions, now: () => number = Date.now) {
    this.#actions = actions;
    this.#now = now;
  }

  get state(): State {
    return this.#state;
  }

  /** Called on every hotkey event for the Dictate shortcut. */
  press(): void {
    if (this.#down) return;
    // A recording stopped some other way (button, time limit, error) ends the gesture.
    if (this.#state !== "idle" && this.#state !== "tapped" && !this.#actions.isRecording()) {
      this.#reset();
    }
    this.#down = true;
    this.#pressedAt = this.#now();
    clearTimeout(this.#timer);

    switch (this.#state) {
      case "idle":
        this.#state = "pressed";
        this.#actions.start();
        break;
      case "tapped":
        // Second press of a double: keep the recording going, hands-free.
        this.#state = "handsfree";
        break;
      case "handsfree":
        this.#state = "handsfreeTapped";
        break;
      case "handsfreeTapped":
        this.#state = "idle";
        this.#actions.stop();
        break;
      default:
        break;
    }
    void this.#watchRelease();
  }

  /** Forget any gesture in progress, e.g. when the shortcut changes. */
  reset(): void {
    this.#reset();
    this.#down = false;
  }

  #reset(): void {
    clearTimeout(this.#timer);
    this.#state = "idle";
  }

  async #watchRelease(): Promise<void> {
    if (this.#polling) return;
    this.#polling = true;
    try {
      while (await this.#actions.isHeld()) {
        if (this.#state === "pressed" && this.#now() - this.#pressedAt >= HOLD_MS) {
          this.#state = "holding";
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    } finally {
      this.#polling = false;
    }
    this.#down = false;
    this.#released();
  }

  #released(): void {
    const short = this.#now() - this.#pressedAt < HOLD_MS;
    switch (this.#state) {
      case "pressed":
        if (!short) {
          this.#state = "idle";
          this.#actions.stop();
          this.#actions.settled();
          return;
        }
        this.#state = "tapped";
        this.#timer = setTimeout(() => {
          // Just one tap: nothing was meant to be recorded.
          this.#state = "idle";
          this.#actions.cancel();
          this.#actions.settled();
        }, DOUBLE_MS);
        return;
      case "holding":
        this.#state = "idle";
        this.#actions.stop();
        this.#actions.settled();
        return;
      case "handsfree":
        this.#actions.settled();
        return;
      case "handsfreeTapped":
        if (!short) {
          // A long press while hands-free is not half of a double; stay hands-free.
          this.#state = "handsfree";
          return;
        }
        this.#timer = setTimeout(() => {
          this.#state = "handsfree";
          this.#actions.settled();
        }, DOUBLE_MS);
        return;
      case "idle":
        this.#actions.settled();
        return;
      default:
        return;
    }
  }
}
