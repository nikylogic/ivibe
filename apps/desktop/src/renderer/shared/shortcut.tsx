// SPDX-License-Identifier: AGPL-3.0-only

import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

const styles = stylex.create({
  row: { display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" },
  key: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 22,
    paddingInline: 6,
    borderRadius: 6,
    backgroundColor: "var(--color-neutral)",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--color-border-emphasized)",
    color: "var(--color-text-primary)",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 500,
  },
});

/**
 * The record shortcut as keycaps. Astryx's Kbd always draws macOS symbols for Ctrl and Alt, so
 * Windows and Linux get their own key names here.
 */
export function Shortcut({ isMac }: { isMac: boolean }) {
  const keys = isMac ? ["⌃", "⌥", "R"] : ["Ctrl", "Alt", "R"];
  return (
    <kbd {...stylex.props(styles.row)} aria-label={isMac ? "Control Option R" : "Control Alt R"}>
      {keys.map((key) => (
        <span key={key} {...stylex.props(styles.key)}>
          {key}
        </span>
      ))}
    </kbd>
  );
}

/** Spreads StyleX styles and adds plain CSS classes (a bare className would replace StyleX's). */
export function withClass(
  className: string,
  ...styles: (StyleXStyles | false | null | undefined)[]
): ReturnType<typeof stylex.props> {
  const props = stylex.props(...styles);
  return { ...props, className: [props.className, className].filter(Boolean).join(" ") };
}
