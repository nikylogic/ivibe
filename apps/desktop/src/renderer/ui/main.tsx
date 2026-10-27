// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { SideNav, SideNavCollapseButton, SideNavItem } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { History, KeyRound, Mic, Settings2 } from "lucide-react";
import { withClass } from "../shared/shortcut.tsx";
import { mount, signal } from "../shared/theme.tsx";
import { HistoryPage } from "./history-page.tsx";
import { RecordPage } from "./record-page.tsx";
import { SettingsPanel } from "./settings-page.tsx";
import type { SettingsSection } from "./settings-page.tsx";
import {
  useAppInfo,
  useByok,
  useRecordingStatus,
  useSettings,
  useShortcutStatus,
} from "./state.ts";
import type { ByokState, Page } from "./state.ts";

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
    display: "flex",
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-background-body)",
    boxShadow: "0 10px 30px var(--color-shadow), 0 1px 3px var(--color-shadow)",
    overflow: "hidden",
  },
  nav: { width: 248, transitionProperty: "width", transitionDuration: "180ms" },
  // Clears the macOS traffic lights and the Windows/Linux overlay controls; drags the window.
  titleBar: { height: 44, flexShrink: 0 },
  navTitleBar: { height: 34, flexShrink: 0 },
  header: { display: "flex", flexDirection: "column", width: "100%" },
  brand: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingInlineStart: 10,
    paddingBottom: 14,
  },
  brandCollapsed: { justifyContent: "center", paddingInlineStart: 0 },
  wordmark: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: 32,
    lineHeight: 1,
    letterSpacing: "-0.01em",
  },
  items: { display: "flex", flexDirection: "column", gap: 4 },
  footer: { display: "flex", flexDirection: "column", gap: 8, width: "100%" },
  keyCard: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginInline: 2,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "var(--color-background-muted)",
  },
  footerRow: { display: "flex", alignItems: "center", gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0 },
  main: { flex: 1, minWidth: 0, overflowY: "auto", display: "flex", flexDirection: "column" },
  center: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
});

const icon = (Icon: typeof Mic) => <Icon size={19} strokeWidth={1.75} />;

function KeyStatus({ byok, onOpen }: { byok: ByokState; onOpen: () => void }) {
  if (!byok.status) return null;
  if (byok.status.hasKey) {
    return (
      <div {...stylex.props(styles.keyCard)}>
        <div {...stylex.props(styles.footerRow)}>
          <span {...stylex.props(styles.dot)} style={{ backgroundColor: signal.ok }} />
          <Text size="sm">Free plan · your key</Text>
        </div>
        <Text size="sm" color="secondary">
          Meta key ending in {byok.status.hint}
        </Text>
      </div>
    );
  }
  return (
    <div {...stylex.props(styles.keyCard)}>
      <Text size="sm">Add your Meta key to analyze recordings for free.</Text>
      <div>
        <Button
          label="Add key"
          size="sm"
          variant="secondary"
          icon={<KeyRound size={15} strokeWidth={1.75} />}
          onClick={onOpen}
        />
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState<Page>("record");
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const status = useRecordingStatus();
  const info = useAppInfo();
  const byok = useByok();
  const settings = useSettings();
  const shortcutStatus = useShortcutStatus();

  const collapsible = {
    isCollapsed: collapsed,
    hasButton: false,
    buttonLabel: collapsed ? "Expand sidebar" : "Collapse sidebar",
    onCollapsedChange: (next: boolean) => {
      setCollapsed(next);
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Not remembered; the sidebar still works.
      }
    },
  };

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.rail)}>
        <div {...stylex.props(styles.floating)}>
          <SideNav
            xstyle={!collapsed && styles.nav}
            collapsible={collapsible}
            header={
              <div {...stylex.props(styles.header)}>
                <div {...withClass("drag-region", styles.navTitleBar)} />
                <div {...stylex.props(styles.brand, collapsed && styles.brandCollapsed)}>
                  {!collapsed && <span {...stylex.props(styles.wordmark)}>iVibe</span>}
                  <SideNavCollapseButton collapsible={collapsible} />
                </div>
              </div>
            }
            footer={
              <div {...stylex.props(styles.footer)}>
                {!collapsed && <KeyStatus byok={byok} onOpen={() => setSettingsSection("key")} />}
                <SideNavItem
                  label="Settings"
                  size="lg"
                  icon={icon(Settings2)}
                  isSelected={settingsSection !== null}
                  onClick={() => setSettingsSection("general")}
                />
              </div>
            }
          >
            <div {...stylex.props(styles.items)}>
              <SideNavItem
                label="Record"
                size="lg"
                icon={icon(Mic)}
                isSelected={page === "record"}
                onClick={() => setPage("record")}
              />
              <SideNavItem
                label="History"
                size="lg"
                icon={icon(History)}
                isSelected={page === "history"}
                onClick={() => setPage("history")}
              />
            </div>
          </SideNav>
        </div>
      </div>

      <main {...stylex.props(styles.main)}>
        <div {...withClass("drag-region", styles.titleBar)} />
        {page === "record" && (
          <RecordPage
            status={status}
            info={info}
            settings={settings}
            shortcutStatus={shortcutStatus}
          />
        )}
        {page === "history" && (
          <HistoryPage
            initialMode={settings.settings?.mode ?? "fix"}
            isMac={info?.platform === "darwin"}
            onRecord={() => setPage("record")}
          />
        )}
      </main>

      <Dialog
        isOpen={settingsSection !== null}
        onOpenChange={(isOpen) => !isOpen && setSettingsSection(null)}
        width={880}
        maxHeight="90vh"
        padding={0}
      >
        {settingsSection && (
          <SettingsPanel
            section={settingsSection}
            onSectionChange={setSettingsSection}
            onClose={() => setSettingsSection(null)}
            info={info}
            byok={byok}
            settings={settings}
            shortcutStatus={shortcutStatus}
          />
        )}
      </Dialog>
    </div>
  );
}

mount(<App />);
