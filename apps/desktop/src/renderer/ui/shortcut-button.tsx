// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "@astryxdesign/core/Text";
import type { OutputMode, ShortcutStatus } from "../../shared/ipc.ts";
import { PASTE_SHORTCUT, acceleratorFromEvent } from "../../shared/shortcuts.ts";
import { Shortcut } from "../shared/shortcut.tsx";
import { signal } from "../shared/theme.tsx";
import type { SettingsState } from "./state.ts";

const pulse = stylex.keyframes({
  "0%": { opacity: 1 },
  "50%": { opacity: 0.45 },
  "100%": { opacity: 1 },
});

const styles = stylex.create({
  wrap: { display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" },
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
    transitionDuration: "120ms",
    color: "var(--color-text-secondary)",
    fontFamily: "inherit",
    fontSize: 13,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": "2px solid var(--color-border-emphasized)" },
  },
  capturing: {
    borderStyle: "solid",
    borderColor: {
      default: "var(--color-border-emphasized)",
      ":hover": "var(--color-border-emphasized)",
    },
    backgroundColor: "var(--color-background-muted)",
    color: "var(--color-text-primary)",
  },
  listening: {
    animationName: pulse,
    animationDuration: "1.2s",
    animationIterationCount: "infinite",
  },
  dot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0 },
});

/**
 * A mode's global shortcut as keycaps. Clicking it records a new one: the shortcuts are paused
 * so the keys reach this window, Escape cancels, and clashes are refused before saving.
 */
export function ShortcutButton({
  mode,
  settings,
  status,
  isMac,
}: {
  mode: OutputMode;
  settings: SettingsState;
  status: ShortcutStatus | null;
  isMac: boolean;
}) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shortcuts = settings.settings?.shortcuts;
  // Read at keypress time, so the listener isn't re-armed (and shortcuts resumed) mid-capture.
  const latest = useRef({ shortcuts, change: settings.change });
  latest.current = { shortcuts, change: settings.change };

  useEffect(() => {
    if (!isCapturing) return;
    void window.ivibe.shortcuts.pause(true);
    const finish = () => setIsCapturing(false);
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const bare = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
      if (event.key === "Escape" && bare) {
        setError(null);
        finish();
        return;
      }
      const result = acceleratorFromEvent(event);
      if (result.type === "pending") return;
      if (result.type === "invalid") {
        setError(result.message);
        return;
      }
      const { accelerator } = result;
      const { shortcuts, change } = latest.current;
      if (!shortcuts) return;
      const owner = (Object.keys(shortcuts) as OutputMode[]).find(
        (other) => other !== mode && shortcuts[other] === accelerator,
      );
      if (owner || accelerator === PASTE_SHORTCUT) {
        setError(`That's already the ${owner ?? "paste"} shortcut.`);
        return;
      }
      setError(null);
      change({ shortcuts: { ...shortcuts, [mode]: accelerator } });
      finish();
    };
    const cancel = () => finish();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", cancel);
      // However the capture ended (saved, Esc, clicked away), the shortcuts come back.
      void window.ivibe.shortcuts.pause(false);
    };
  }, [isCapturing, mode]);

  if (!shortcuts) return null;
  const isTaken = status?.[mode] === false;
  return (
    <div {...stylex.props(styles.wrap)}>
      <button
        type="button"
        title={isCapturing ? "Press the new shortcut. Esc cancels." : "Click to change"}
        aria-label={
          isCapturing ? "Press the new shortcut" : `Shortcut ${shortcuts[mode]}. Click to change.`
        }
        onClick={() => {
          setError(null);
          setIsCapturing(!isCapturing);
        }}
        onBlur={() => isCapturing && setIsCapturing(false)}
        {...stylex.props(styles.button, isCapturing && styles.capturing)}
      >
        {isCapturing ? (
          <span {...stylex.props(styles.listening)}>Press keys…</span>
        ) : (
          <>
            <Shortcut accelerator={shortcuts[mode]} isMac={isMac} />
            {isTaken && (
              <span
                {...stylex.props(styles.dot)}
                style={{ backgroundColor: signal.secret }}
                title="Another app is using this shortcut"
              />
            )}
          </>
        )}
      </button>
      {(error || (isTaken && !isCapturing)) && (
        <Text size="sm" color="secondary">
          {error ?? "Another app is using this shortcut. Click to pick another."}
        </Text>
      )}
    </div>
  );
}
