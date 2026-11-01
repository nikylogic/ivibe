// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import type { MascotState } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { appleIcon, linuxIcon, TopBar, useRelease, windowsIcon } from "./home.tsx";
import { Nav } from "./nav.tsx";
import { detectPlatform, MAC_INSTALL, REPO, RELEASES_URL } from "./release.ts";
import type { Download, Platform, Release } from "./release.ts";
import { ivibeTheme } from "./theme.ts";

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-primary)",
  },
  // Two columns: who it is on the left, the downloads on the right; stacked on a phone.
  main: {
    maxWidth: 960,
    marginInline: "auto",
    paddingInline: 24,
    paddingTop: { default: 136, "@media (max-width: 760px)": 104 },
    paddingBottom: 96,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(220px, 320px) minmax(0, 500px)",
      "@media (max-width: 760px)": "minmax(0, 1fr)",
    },
    justifyContent: "center",
    columnGap: 72,
    rowGap: 48,
    alignItems: "start",
  },
  brand: {
    position: { default: "sticky", "@media (max-width: 760px)": "static" },
    top: 136,
    display: "flex",
    flexDirection: "column",
    alignItems: { default: "flex-start", "@media (max-width: 760px)": "center" },
    textAlign: { default: "start", "@media (max-width: 760px)": "center" },
    gap: 12,
  },
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontWeight: 400,
    fontSize: "clamp(36px, 5vw, 48px)",
    lineHeight: 1.05,
    letterSpacing: "-0.01em",
    margin: 0,
  },
  meta: { display: "flex", justifyContent: "space-between", gap: 12 },
});

/** One platform: its name and choice of build, the download, and what the file is. */
function PlatformBlock({
  name,
  icon,
  label,
  choices,
  isFirst,
  version,
  extra,
}: {
  name: string;
  icon: ReactNode;
  label: string;
  /** The builds to pick between; one has no picker. */
  choices: { key: string; label: string; download: Download }[];
  isFirst: boolean;
  version?: string;
  extra?: ReactNode;
}) {
  const [picked, setPicked] = useState(choices[0]!.key);
  const choice = choices.find((item) => item.key === picked) ?? choices[0]!;
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" hAlign="between">
        <HStack gap={2} vAlign="center">
          <span style={{ display: "inline-flex", width: 16, justifyContent: "center" }}>
            {icon}
          </span>
          <Text weight="semibold">{name}</Text>
        </HStack>
        {choices.length > 1 && (
          <SegmentedControl
            label={`${name} build`}
            size="sm"
            value={picked}
            onChange={(value) => setPicked(String(value))}
          >
            {choices.map((item) => (
              <SegmentedControlItem key={item.key} value={item.key} label={item.label} />
            ))}
          </SegmentedControl>
        )}
      </HStack>
      <Button
        label={label}
        variant={isFirst ? "primary" : "secondary"}
        icon={icon}
        width="100%"
        href={choice.download.url}
      />
      <div {...stylex.props(styles.meta)}>
        <Text size="sm" color="secondary">
          {choice.download.label}
          {choice.download.size ? ` · ${choice.download.size}` : ""}
        </Text>
        {version && (
          <Text size="sm" color="secondary">
            v{version}
          </Text>
        )}
      </div>
      {extra}
    </VStack>
  );
}

function platforms(release: Release): Record<Platform, Parameters<typeof PlatformBlock>[0]> {
  return {
    mac: {
      name: "macOS",
      icon: appleIcon,
      label: "Download for Mac",
      choices: [
        { key: "arm", label: "Apple silicon", download: release.macArm },
        { key: "intel", label: "Intel", download: release.macIntel },
      ],
      isFirst: false,
      version: release.version,
      extra: (
        <VStack gap={1}>
          <Text size="sm" color="secondary">
            Or install from Terminal, with no security prompt:
          </Text>
          <CodeBlock code={MAC_INSTALL} language="bash" hasCopyButton isWrapped size="sm" />
        </VStack>
      ),
    },
    windows: {
      name: "Windows",
      icon: windowsIcon,
      label: "Download for Windows",
      choices: [{ key: "installer", label: "Installer", download: release.windows }],
      isFirst: false,
      version: release.version,
    },
    linux: {
      name: "Linux",
      icon: linuxIcon,
      label: "Download for Linux",
      choices: [
        { key: "appimage", label: "AppImage", download: release.linuxAppImage },
        { key: "deb", label: ".deb", download: release.linuxDeb },
      ],
      isFirst: false,
      version: release.version,
    },
  };
}

/**
 * /download: every build of iVibe on one calm page. The visitor's own platform comes first
 * with the filled button; each platform shows its builds, the file and the version, all from the
 * latest GitHub release.
 */
export function DownloadPage({
  mode,
  onModeChange,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  const release = useRelease();
  const detected = detectPlatform();
  const order: Platform[] =
    detected === "windows"
      ? ["windows", "mac", "linux"]
      : detected === "linux"
        ? ["linux", "mac", "windows"]
        : ["mac", "windows", "linux"];
  const blocks = platforms(release);

  // A happy hello: the mascot is pleased you came to get it.
  const [mood, setMood] = useState<MascotState>("idle");
  useEffect(() => {
    document.title = "Download iVibe";
    const hello = setTimeout(() => setMood("done"), 500);
    const rest = setTimeout(() => setMood("idle"), 2500);
    return () => {
      clearTimeout(hello);
      clearTimeout(rest);
    };
  }, []);

  return (
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode={mode}>
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <Nav page="download" />
      <main {...stylex.props(styles.main)}>
        <div {...stylex.props(styles.brand)}>
          <Mascot size={120} state={mood} />
          <Heading level={1} xstyle={styles.title}>
            Get iVibe
          </Heading>
          <Text color="secondary">
            {release.version ? `Version ${release.version}` : "The latest version"}, for Mac,
            Windows and Linux.
          </Text>
        </div>

        <VStack gap={8}>
          <VStack gap={6}>
            {order.map((platform, index) => (
              <PlatformBlock
                key={platform}
                {...blocks[platform]}
                isFirst={index === 0 && detected !== null}
              />
            ))}
          </VStack>

          <VStack gap={4}>
            <Divider />
            <HStack gap={5} hAlign="center" wrap="wrap">
              <Link href={RELEASES_URL} size="sm">
                Release notes
              </Link>
              <Link href={`https://github.com/${REPO}/releases`} size="sm">
                All versions
              </Link>
              <Link href={`https://github.com/${REPO}`} size="sm">
                Source code
              </Link>
            </HStack>
          </VStack>
        </VStack>
      </main>
    </div>
  );
}
