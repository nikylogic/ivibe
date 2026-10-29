// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Check } from "lucide-react";
import type { OutputMode, ShortcutKey, ShortcutStatus } from "../../shared/ipc.ts";
import {
  PASTE_SHORTCUT,
  acceleratorFromEvent,
  acceleratorKeys,
  heldModifiers,
} from "../../shared/shortcuts.ts";
import { Shortcut } from "../shared/shortcut.tsx";
import { signal } from "../shared/theme.tsx";
import type { SettingsState } from "./state.ts";

/** Gives up if nothing is chosen, well before main's own 30 s safety resume. */
const CAPTURE_MS = 20_000;
const FLASH_MS = 2400;

const pulse = stylex.keyframes({
  "0%": { borderColor: "var(--color-border-emphasized)" },
  "50%": { borderColor: "var(--color-text-secondary)" },
  "100%": { borderColor: "var(--color-border-emphasized)" },
});

const styles = stylex.create({
  wrap: { position: "relative", display: "inline-flex" },
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 34,
    paddingInline: 8,
    // Dashed by default so it reads as editable; solid and filled on hover, like a button.
    borderWidth: 1,
    borderStyle: { default: "dashed", ":hover": "solid" },
    borderColor: "var(--color-border-emphasized)",
    borderRadius: 10,
    backgroundColor: { default: "transparent", ":hover": "var(--color-background-muted)" },
    transitionProperty: "background-color, border-color",
    transitionDuration: "var(--motion-micro)",
    transitionTimingFunction: "var(--motion-ease)",
    color: "var(--color-text-secondary)",
    fontFamily: "inherit",
    fontSize: 13,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": "2px solid var(--color-border-emphasized)" },
  },
  capturing: {
    borderStyle: { default: "solid", ":hover": "solid" },
    borderWidth: 2,
    paddingInline: 7,
    backgroundColor: {
      default: "var(--color-background-muted)",
      ":hover": "var(--color-background-muted)",
    },
    color: "var(--color-text-primary)",
    animationName: pulse,
    animationDuration: "1.4s",
    animationIterationCount: "infinite",
  },
  placeholder: { display: "inline-flex", alignItems: "center", gap: 4 },
  blank: {
    display: "inline-flex",
    minWidth: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "var(--color-text-secondary)",
  },
  dot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0 },
  // A small note under the button, so the row it sits in doesn't move.
  popover: {
    position: "absolute",
    top: "calc(100% + 8px)",
    zIndex: 20,
    width: "max-content",
    maxWidth: 280,
    paddingBlock: 8,
    paddingInline: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-background-body)",
    boxShadow: "0 8px 24px var(--color-shadow)",
    fontSize: 12,
    lineHeight: 1.45,
    textAlign: "start",
    color: "var(--color-text-secondary)",
    animationName: "ivibe-rise",
    animationDuration: "var(--motion-small)",
    animationTimingFunction: "var(--motion-ease)",
  },
  popoverStart: { left: 0 },
  popoverEnd: { right: 0 },
  popoverTitle: { color: "var(--color-text-primary)", fontWeight: 600 },
  ok: { display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-primary)" },
});

type Flash = { kind: "saved"; accelerator: string } | { kind: "error"; message: string };

/**
 * A mode's global shortcut as keycaps. Clicking it records a new one: main pauses the shortcuts
 * and forwards the keys (a bare Alt would otherwise open the hidden menu bar), the keys held so
 * far show live, Esc or a click elsewhere cancels, and clashes are refused before saving.
 */
export function ShortcutButton({
  mode,
  settings,
  status,
  isMac,
  align = "start",
}: {
  mode: OutputMode;
  settings: SettingsState;
  status: ShortcutStatus | null;
  isMac: boolean;
  /** Which edge of the button the note lines up with. */
  align?: "start" | "end";
}) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [held, setHeld] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const shortcuts = settings.settings?.shortcuts;
  // Read at keypress time, so the listener isn't re-armed (and shortcuts resumed) mid-capture.
  const latest = useRef({ shortcuts, change: settings.change });
  latest.current = { shortcuts, change: settings.change };

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    if (!isCapturing) return;
    void window.ivibe.shortcuts.pause(true);
    const stop = (next: Flash | null) => {
      setIsCapturing(false);
      setHeld("");
      setError(null);
      setFlash(next);
    };
    const onKey = (key: ShortcutKey) => {
      setHeld(heldModifiers(key));
      if (key.type === "up") return;
      const bare = !key.ctrlKey && !key.altKey && !key.shiftKey && !key.metaKey;
      if (key.code === "Escape" && bare) {
        stop(null);
        return;
      }
      const result = acceleratorFromEvent(key);
      if (result.type === "pending") return;
      if (result.type === "invalid") {
        setError(result.message);
        return;
      }
      const { accelerator } = result;
      const { shortcuts, change } = latest.current;
      if (!shortcuts) return;
      if (accelerator === shortcuts[mode]) {
        stop({ kind: "saved", accelerator });
        return;
      }
      const owner = (Object.keys(shortcuts) as OutputMode[]).find(
        (other) => other !== mode && shortcuts[other] === accelerator,
      );
      if (owner || accelerator === PASTE_SHORTCUT) {
        const name = owner ? owner[0]!.toUpperCase() + owner.slice(1) : "Paste";
        setError(`${acceleratorKeys(accelerator, isMac).join(" + ")} is the ${name} shortcut.`);
        return;
      }
      change({ shortcuts: { ...shortcuts, [mode]: accelerator } });
      stop({ kind: "saved", accelerator });
    };
    // A click anywhere but the button cancels; the button's own click toggles.
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) stop(null);
    };
    const timer = setTimeout(
      () => stop({ kind: "error", message: "No keys were pressed, so nothing changed." }),
      CAPTURE_MS,
    );
    const unsubscribe = window.ivibe.shortcuts.onKey(onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("pointerdown", onPointer, true);
      // However the capture ended (saved, Esc, clicked away), the shortcuts come back.
      void window.ivibe.shortcuts.pause(false);
    };
  }, [isCapturing, mode, isMac]);

  if (!shortcuts) return null;
  const isTaken = status?.[mode] === false;

  let note: ReactNode = null;
  if (isCapturing) {
    note = error ? (
      <span style={{ color: signal.secret }}>{error}</span>
    ) : (
      <>
        <span {...stylex.props(styles.popoverTitle)}>Press the new shortcut. </span>
        Hold Ctrl, Alt or Shift and press a key, or press Caps Lock or an F key. Esc cancels.
      </>
    );
  } else if (flash?.kind === "error") {
    note = flash.message;
  } else if (flash?.kind === "saved") {
    note = isTaken ? (
      <span style={{ color: signal.secret }}>
        Another app is using {acceleratorKeys(flash.accelerator, isMac).join(" + ")}. Click to pick
        another.
      </span>
    ) : (
      <span {...stylex.props(styles.ok)}>
        <Check size={14} strokeWidth={2.5} color={signal.ok} />
        Saved. Works from any app.
      </span>
    );
  }

  return (
    <div ref={wrapRef} {...stylex.props(styles.wrap)}>
      <button
        type="button"
        title={
          isCapturing
            ? undefined
            : isTaken
              ? "Another app is using this shortcut. Click to pick another."
              : "Click to change"
        }
        aria-label={
          isCapturing ? "Press the new shortcut" : `Shortcut ${shortcuts[mode]}. Click to change.`
        }
        onClick={() => {
          setError(null);
          setFlash(null);
          setHeld("");
          setIsCapturing(!isCapturing);
        }}
        {...stylex.props(styles.button, isCapturing && styles.capturing)}
      >
        {isCapturing ? (
          held ? (
            <span {...stylex.props(styles.placeholder)}>
              <Shortcut accelerator={held} isMac={isMac} />
              <span {...stylex.props(styles.blank)} />
            </span>
          ) : (
            <span>Press keys…</span>
          )
        ) : (
          <>
            <Shortcut accelerator={shortcuts[mode]} isMac={isMac} />
            {isTaken && (
              <span {...stylex.props(styles.dot)} style={{ backgroundColor: signal.secret }} />
            )}
          </>
        )}
      </button>
      {note && (
        <div
          role="status"
          {...stylex.props(
            styles.popover,
            align === "end" ? styles.popoverEnd : styles.popoverStart,
          )}
        >
          {note}
        </div>
      )}
    </div>
  );
}
