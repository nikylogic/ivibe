// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { SideNav, SideNavCollapseButton, SideNavItem } from "@astryxdesign/core/SideNav";
import { ArrowLeft, History, Mic, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { withClass } from "../shared/shortcut.tsx";
import { mount } from "../shared/theme.tsx";
import { Mascot } from "../shared/mascot/mascot.tsx";
import { HistoryPage } from "./history-page.tsx";
import { transition } from "./motion.ts";
import { ProfileFooter } from "./profile.tsx";
import { RecordPage } from "./record-page.tsx";
import { SECTIONS, SettingsPage } from "./settings-page.tsx";
import { WelcomePage } from "./welcome-page.tsx";
import type { SettingsSection } from "./settings-page.tsx";
import {
  useAppInfo,
  useByok,
  useCloud,
  useRecordingStatus,
  useSettings,
  useShortcutStatus,
} from "./state.ts";
import type { Page } from "./state.ts";

/** Remembers whether the sidebar was collapsed; a convenience, so failures are ignored. */
const COLLAPSED_KEY = "ivibe.sidebar.collapsed";
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

const styles = stylex.create({
  // The window is the page colour; the title-bar overlay (main/windows.ts) matches it.
  root: {
    display: "flex",
    height: "100vh",
    backgroundColor: "var(--color-background-surface)",
  },
  // The sidebar floats inside the window as a card.
  rail: { display: "flex", flexShrink: 0, padding: 10, paddingInlineEnd: 0 },
  floating: {
    position: "relative",
    display: "flex",
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-background-body)",
    boxShadow: "0 10px 30px var(--color-shadow), 0 1px 3px var(--color-shadow)",
    overflow: "hidden",
    // The card animates its width and clips; the nav inside keeps its layout while it moves.
    transitionProperty: "width",
    transitionDuration: "var(--motion-layout)",
    transitionTimingFunction: "var(--motion-ease)",
  },
  // 1px border each side around the nav's 248 px, or Astryx's collapsed --spacing-12 (48 px).
  floatingOpen: { width: 250 },
  floatingClosed: { width: 50 },
  nav: { width: 248, flexShrink: 0 },
  // Clears the macOS traffic lights and the Windows/Linux overlay controls; drags the window.
  titleBar: { height: 44, flexShrink: 0 },
  navTitleBar: { height: 58, flexShrink: 0 },
  // The collapse toggle floats over the card's top right corner, so it rides the card's edge as
  // the card narrows and ends up centred in the collapsed rail: no jump, never clipped.
  toggle: {
    position: "absolute",
    top: 10,
    insetInlineEnd: 10,
    zIndex: 2,
    transitionProperty: "inset-inline-end, top",
    transitionDuration: "var(--motion-layout)",
    transitionTimingFunction: "var(--motion-ease)",
  },
  toggleCollapsed: { insetInlineEnd: 8 },
  // The collapsed rail is narrower than the macOS traffic lights, so there the expand button
  // sits just below them.
  toggleBelowLights: { top: 26 },
  header: { display: "flex", flexDirection: "column", width: "100%" },
  brand: {
    display: "flex",
    alignItems: "center",
    paddingInlineStart: 10,
    paddingBottom: 14,
    // The same height expanded and collapsed, so the nav items below never move.
    boxSizing: "border-box",
    height: 46,
  },
  // The toy stands about as tall as the wordmark; its canvas has room around it to move, so
  // it is pulled in close to the text, and lifted a little so its body (not its key) lines up.
  // It is one mascot in both layouts: collapsing shrinks it and slides it to the rail's centre
  // in step with the card, rather than swapping in a second one.
  mascot: {
    display: "flex",
    flexShrink: 0,
    marginTop: -21,
    marginBottom: -11,
    marginInlineStart: -16,
    marginInlineEnd: -4,
    transitionProperty: "transform",
    transitionDuration: "var(--motion-layout)",
    transitionTimingFunction: "var(--motion-ease)",
  },
  // A little bigger than the nav icons, centred in the 48 px rail.
  mascotCollapsed: { transform: "translateX(-9px) scale(0.66)" },
  wordmark: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: 32,
    lineHeight: 1,
    letterSpacing: "-0.01em",
    transitionProperty: "opacity",
    transitionDuration: "var(--motion-micro)",
    transitionTimingFunction: "var(--motion-ease)",
  },
  // Leaves first, so a half-clipped "iV" never shows while the card narrows, and fades back in
  // as the card widens.
  wordmarkLeaving: { opacity: 0 },
  wordmarkArriving: {
    animationName: "ivibe-fade",
    animationDuration: "var(--motion-small)",
    animationTimingFunction: "var(--motion-ease)",
  },
  items: { display: "flex", flexDirection: "column", gap: 4 },
  gap: { height: 8 },
  navSwap: {
    display: "flex",
    animationName: "ivibe-fade",
    animationDuration: "var(--motion-small)",
    animationTimingFunction: "var(--motion-ease)",
  },
  page: { flex: 1, display: "flex", flexDirection: "column" },
  // Named for the page-switch view transition in global.css.
  main: {
    flex: 1,
    minWidth: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    viewTransitionName: "page",
  },
  center: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
});

const icon = (Icon: typeof Mic) => <Icon size={19} strokeWidth={1.75} />;

function Screens() {
  const [page, setPage] = useState<Page>("record");
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [compact, setCompact] = useState(collapsed);
  // In case the width transition never reports its end (window hidden mid-animation).
  const compactTimer = useRef(0);
  const status = useRecordingStatus();
  const info = useAppInfo();
  const isMac = info?.platform === "darwin";
  const byok = useByok();
  const cloud = useCloud();
  const settings = useSettings();
  const shortcutStatus = useShortcutStatus();
  const go = (next: Page) => transition("page", () => setPage(next));
  const openSettings = (section: SettingsSection | null) =>
    transition("page", () => setSettingsSection(section));

  const current = settings.settings;
  const ready = current !== null && byok.status !== null && cloud.status !== null;
  const hasAccess = !!byok.status?.hasKey || !!cloud.status?.signedIn;
  // Signing in or saving a key from anywhere finishes the welcome for good.
  useEffect(() => {
    if (current && !current.welcomed && hasAccess) settings.change({ welcomed: true });
  }, [current, hasAccess, settings]);

  // `collapsed` is where the sidebar is going (the card's width); `compact` is the layout inside
  // it. Collapsing narrows the card over the full layout and switches to the icon layout once
  // it has finished; expanding switches first and lets the widening card reveal it.
  const collapsible = {
    isCollapsed: compact,
    hasButton: false,
    buttonLabel: collapsed ? "Expand sidebar" : "Collapse sidebar",
    onCollapsedChange: (next: boolean) => {
      setCollapsed(next);
      window.clearTimeout(compactTimer.current);
      if (next) compactTimer.current = window.setTimeout(() => setCompact(true), 400);
      else setCompact(false);
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Not remembered; the sidebar still works.
      }
    },
  };

  const toggle = (
    <SideNavCollapseButton collapsible={collapsible}>
      {collapsed ? (
        <PanelLeftOpen size={18} strokeWidth={1.75} />
      ) : (
        <PanelLeftClose size={18} strokeWidth={1.75} />
      )}
    </SideNavCollapseButton>
  );

  // Settings takes over the window like any page; Escape goes back.
  const inSettings = settingsSection !== null;
  useEffect(() => {
    if (!inSettings) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        transition("page", () => setSettingsSection(null));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [inSettings]);

  if (!ready) return null;
  if (!current.welcomed && !hasAccess) {
    return (
      <WelcomePage cloud={cloud} byok={byok} onSkip={() => settings.change({ welcomed: true })} />
    );
  }

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.rail)}>
        <div
          {...withClass(
            collapsed && !inSettings
              ? compact
                ? "sidebar-collapsed"
                : "sidebar-collapsed sidebar-collapsing"
              : "",
            styles.floating,
            collapsed && !inSettings ? styles.floatingClosed : styles.floatingOpen,
          )}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === "width") {
              setCompact(collapsed);
            }
          }}
        >
          {/* Keyed so each nav arrives with a fade rather than morphing into the other. */}
          <div key={inSettings ? "settings" : "app"} {...stylex.props(styles.navSwap)}>
            {inSettings ? (
              <SideNav
                xstyle={styles.nav}
                header={
                  <div {...stylex.props(styles.header)}>
                    <div {...withClass("drag-region", styles.navTitleBar)} />
                    <div {...stylex.props(styles.brand)}>
                      <span {...stylex.props(styles.wordmark)}>Settings</span>
                    </div>
                  </div>
                }
              >
                <div {...stylex.props(styles.items)}>
                  <SideNavItem
                    label="Back to app"
                    size="lg"
                    icon={icon(ArrowLeft)}
                    onClick={() => openSettings(null)}
                  />
                  <div {...stylex.props(styles.gap)} />
                  {SECTIONS.map(({ id, label, icon: Icon }) => (
                    <SideNavItem
                      key={id}
                      label={label}
                      size="lg"
                      icon={icon(Icon)}
                      isSelected={settingsSection === id}
                      onClick={() => openSettings(id)}
                    />
                  ))}
                </div>
              </SideNav>
            ) : (
              <SideNav
                xstyle={!compact && styles.nav}
                collapsible={collapsible}
                header={
                  <div {...stylex.props(styles.header)}>
                    <div {...withClass("drag-region", styles.navTitleBar)} />
                    <div {...stylex.props(styles.brand)}>
                      <span {...stylex.props(styles.mascot, collapsed && styles.mascotCollapsed)}>
                        <Mascot size={62} />
                      </span>
                      {!compact && (
                        <span
                          {...stylex.props(
                            styles.wordmark,
                            styles.wordmarkArriving,
                            collapsed && styles.wordmarkLeaving,
                          )}
                        >
                          iVibe
                        </span>
                      )}
                    </div>
                  </div>
                }
                footer={
                  <ProfileFooter
                    byok={byok}
                    cloud={cloud}
                    personalName={current.personal.name}
                    collapsed={compact}
                    onOpen={openSettings}
                  />
                }
              >
                <div {...stylex.props(styles.items)}>
                  <SideNavItem
                    label="Record"
                    size="lg"
                    icon={icon(Mic)}
                    isSelected={page === "record"}
                    onClick={() => go("record")}
                  />
                  <SideNavItem
                    label="History"
                    size="lg"
                    icon={icon(History)}
                    isSelected={page === "history"}
                    onClick={() => go("history")}
                  />
                </div>
              </SideNav>
            )}
          </div>
          {/* After the nav: Electron applies drag regions in document order, so the button's
              no-drag must come after the drag strip it sits on, or clicks would drag the window. */}
          {!inSettings && (
            <span
              {...withClass(
                "no-drag",
                styles.toggle,
                collapsed && styles.toggleCollapsed,
                collapsed && isMac && styles.toggleBelowLights,
              )}
            >
              {toggle}
            </span>
          )}
        </div>
      </div>

      <main {...stylex.props(styles.main)}>
        <div {...withClass("drag-region", styles.titleBar)} />
        <div key={inSettings ? "settings" : page} {...stylex.props(styles.page)}>
          {settingsSection && (
            <SettingsPage
              section={settingsSection}
              info={info}
              byok={byok}
              cloud={cloud}
              settings={settings}
              shortcutStatus={shortcutStatus}
            />
          )}
          {!inSettings && page === "record" && (
            <RecordPage
              status={status}
              info={info}
              settings={settings}
              shortcutStatus={shortcutStatus}
              onOpenBackup={() => openSettings("cloud")}
            />
          )}
          {!inSettings && page === "history" && (
            <HistoryPage
              initialMode={settings.settings?.mode ?? "fix"}
              isMac={isMac}
              onRecord={() => go("record")}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/** Astryx's own component text follows the interface language, and so does the document's. */
function App() {
  const language = useSettings().settings?.language ?? "en";
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return (
    <InternationalizationProvider locale={language}>
      <Screens />
    </InternationalizationProvider>
  );
}

mount(<App />);
