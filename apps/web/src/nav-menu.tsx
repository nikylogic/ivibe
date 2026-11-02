// SPDX-License-Identifier: AGPL-3.0-only

import * as stylex from "@stylexjs/stylex";
import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import type { NavLink } from "./nav.tsx";
import { ivibeTheme } from "./theme.ts";
import { ThemeSwitch } from "./theme-switch.tsx";

/**
 * Runs once the sheet has closed and let go of the page, which it holds still by pinning the body
 * until its closing motion ends: a scroll asked for before then would be lost.
 */
function whenUnlocked(run: () => void) {
  const started = performance.now();
  const check = () => {
    if (document.body.style.position !== "fixed" || performance.now() - started > 2000) run();
    else requestAnimationFrame(check);
  };
  // The sheet starts closing on the next render, so the lock is still on when this first looks.
  window.setTimeout(check, 60);
}

const styles = stylex.create({
  links: { display: "flex", flexDirection: "column" },
  link: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    minHeight: 52,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 17,
    textAlign: "start",
    textDecoration: "none",
    color: "var(--color-text-primary)",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "color-mix(in srgb, var(--color-text-primary) 10%, transparent)",
  },
  theme: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    minHeight: 64,
  },
});

/** The navbar's links and the theme switch, on screens too narrow to show them in the bar. */
export default function NavMenu({
  isOpen,
  onOpenChange,
  links,
  mode,
  onModeChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  links: NavLink[];
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  return (
    <Theme theme={ivibeTheme} mode={mode}>
      <BottomSheet label="Menu" height="hug" isOpen={isOpen} onOpenChange={onOpenChange}>
        <nav aria-label="Menu" {...stylex.props(styles.links)}>
          {links.map((link) =>
            link.href ? (
              <a
                key={link.label}
                href={link.href}
                target={link.href.startsWith("http") ? "_blank" : undefined}
                rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                onClick={() => onOpenChange(false)}
                {...stylex.props(styles.link)}
              >
                {link.menuLabel ?? link.label}
              </a>
            ) : (
              <button
                key={link.label}
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  whenUnlocked(() => link.onClick?.());
                }}
                {...stylex.props(styles.link)}
              >
                {link.menuLabel ?? link.label}
              </button>
            ),
          )}
        </nav>
        <div {...stylex.props(styles.theme)}>
          <Text>Appearance</Text>
          <ThemeSwitch mode={mode} onModeChange={onModeChange} size="lg" />
        </div>
      </BottomSheet>
    </Theme>
  );
}
