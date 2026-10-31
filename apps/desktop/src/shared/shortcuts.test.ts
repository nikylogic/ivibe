// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import {
  acceleratorFromEvent,
  acceleratorKeys,
  defaultShortcuts,
  heldModifiers,
  isValidAccelerator,
} from "./shortcuts.ts";

const key = (
  code: string,
  modifiers: Partial<Record<"ctrl" | "alt" | "shift" | "meta", boolean>> = {},
) => ({
  code,
  ctrlKey: modifiers.ctrl ?? false,
  altKey: modifiers.alt ?? false,
  shiftKey: modifiers.shift ?? false,
  metaKey: modifiers.meta ?? false,
});

describe("shortcuts", () => {
  it("defaults to Caps Lock on Windows, Option+Space on macOS and letters on Linux", () => {
    expect(defaultShortcuts("win32")).toEqual({
      dictate: "Capslock",
      fix: "Control+Capslock",
      prompt: "Alt+Capslock",
    });
    expect(defaultShortcuts("darwin")).toEqual({
      dictate: "Alt+Space",
      fix: "Control+Alt+Space",
      prompt: "Alt+Shift+Space",
    });
    for (const accelerator of [
      ...Object.values(defaultShortcuts("darwin")),
      ...Object.values(defaultShortcuts("linux")),
    ]) {
      expect(isValidAccelerator(accelerator)).toBe(true);
      expect(accelerator).not.toContain("Capslock");
    }
  });

  it("records shortcuts from key presses", () => {
    expect(acceleratorFromEvent(key("CapsLock"))).toEqual({
      type: "shortcut",
      accelerator: "Capslock",
    });
    expect(acceleratorFromEvent(key("CapsLock", { ctrl: true }))).toEqual({
      type: "shortcut",
      accelerator: "Control+Capslock",
    });
    expect(acceleratorFromEvent(key("KeyD", { ctrl: true, shift: true }))).toEqual({
      type: "shortcut",
      accelerator: "Control+Shift+D",
    });
    expect(acceleratorFromEvent(key("F9"))).toEqual({ type: "shortcut", accelerator: "F9" });
  });

  it("waits through modifiers and refuses keys that would block typing", () => {
    expect(acceleratorFromEvent(key("ControlLeft", { ctrl: true }))).toEqual({ type: "pending" });
    expect(acceleratorFromEvent(key("KeyA")).type).toBe("invalid");
    expect(acceleratorFromEvent(key("KeyA", { shift: true })).type).toBe("invalid");
  });

  it("shows the modifiers held so far", () => {
    expect(heldModifiers(key("ControlLeft", { ctrl: true, alt: true }))).toBe("Control+Alt");
    expect(heldModifiers(key("KeyA"))).toBe("");
  });

  it("validates stored accelerators", () => {
    expect(isValidAccelerator("Alt+Capslock")).toBe(true);
    expect(isValidAccelerator("A")).toBe(false);
    expect(isValidAccelerator("Hyper+A")).toBe(false);
    expect(isValidAccelerator(42)).toBe(false);
  });

  it("draws keycaps per platform", () => {
    expect(acceleratorKeys("Control+Capslock", false)).toEqual(["Ctrl", "Caps Lock"]);
    expect(acceleratorKeys("Control+Capslock", true)).toEqual(["⌃", "⇪"]);
  });
});
