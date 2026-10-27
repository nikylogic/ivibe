// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { SideNav, SideNavItem } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { FileText, KeyRound, Mic, Settings2 } from "lucide-react";
import { withClass } from "../shared/shortcut.tsx";
import { mount, signal } from "../shared/theme.tsx";
import { RecordPage } from "./record-page.tsx";
import { SettingsPage } from "./settings-page.tsx";
import { useAppInfo, useByok, useRecordingStatus, useSettings } from "./state.ts";
import type { ByokState, Page } from "./state.ts";

const styles = stylex.create({
  // Clears the macOS traffic lights and the Windows/Linux overlay controls; drags the window.
  titleBar: { height: 44, flexShrink: 0 },
  header: { display: "flex", flexDirection: "column", width: "100%" },
  wordmark: {
    paddingInline: 10,
    paddingBottom: 12,
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: 30,
    lineHeight: 1,
    letterSpacing: "-0.01em",
  },
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    margin: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "var(--color-background-muted)",
  },
  footerRow: { display: "flex", alignItems: "center", gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  content: { display: "flex", flexDirection: "column", minHeight: "100%" },
  center: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
});

const icon = (Icon: typeof Mic) => <Icon size={17} strokeWidth={1.75} />;

function KeyStatus({ byok, onOpen }: { byok: ByokState; onOpen: () => void }) {
  if (!byok.status) return null;
  if (byok.status.hasKey) {
    return (
      <div {...stylex.props(styles.footer)}>
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
    <div {...stylex.props(styles.footer)}>
      <Text size="sm">Add your Meta key to analyze recordings for free.</Text>
      <div>
        <Button
          label="Add key"
          size="sm"
          variant="secondary"
          icon={icon(KeyRound)}
          onClick={onOpen}
        />
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState<Page>("record");
  const status = useRecordingStatus();
  const info = useAppInfo();
  const byok = useByok();
  const settings = useSettings();

  const sideNav = (
    <SideNav
      header={
        <div {...stylex.props(styles.header)}>
          <div {...withClass("drag-region", styles.titleBar)} />
          <div {...stylex.props(styles.wordmark)}>iVibe</div>
        </div>
      }
      footer={<KeyStatus byok={byok} onOpen={() => setPage("settings")} />}
    >
      <SideNavItem
        label="Record"
        icon={icon(Mic)}
        isSelected={page === "record"}
        onClick={() => setPage("record")}
      />
      <SideNavItem
        label="Reports"
        icon={icon(FileText)}
        isSelected={page === "reports"}
        onClick={() => setPage("reports")}
      />
      <SideNavItem
        label="Settings"
        icon={icon(Settings2)}
        isSelected={page === "settings"}
        onClick={() => setPage("settings")}
      />
    </SideNav>
  );

  return (
    <AppShell
      variant="elevated"
      height="fill"
      contentPadding={0}
      sideNav={sideNav}
      mobileNav={false}
    >
      <div {...stylex.props(styles.content)}>
        <div {...withClass("drag-region", styles.titleBar)} />
        {page === "record" && <RecordPage status={status} info={info} settings={settings} />}
        {page === "reports" && (
          <div {...stylex.props(styles.center)}>
            <EmptyState
              icon={<FileText size={28} strokeWidth={1.5} />}
              title="No reports yet"
              description="Record a bug and its report, with the root cause and a fix prompt, shows up here."
              actions={
                <Button label="Record a bug" variant="primary" onClick={() => setPage("record")} />
              }
            />
          </div>
        )}
        {page === "settings" && <SettingsPage info={info} byok={byok} settings={settings} />}
      </div>
    </AppShell>
  );
}

mount(<App />);
