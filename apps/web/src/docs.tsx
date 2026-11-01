// SPDX-License-Identifier: AGPL-3.0-only

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { CommandPalette } from "@astryxdesign/core/CommandPalette";
import { Heading } from "@astryxdesign/core/Heading";
import { Kbd } from "@astryxdesign/core/Kbd";
import { Link } from "@astryxdesign/core/Link";
import { Outline } from "@astryxdesign/core/Outline";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { createStaticSource } from "@astryxdesign/core/Typeahead";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import {
  acceleratorKeys,
  defaultShortcuts,
  PASTE_SHORTCUT,
} from "../../desktop/src/shared/shortcuts.ts";
import { Footer } from "./finale.tsx";
import { TopBar } from "./home.tsx";
import { Nav } from "./nav.tsx";
import { detectPlatform, MAC_INSTALL, RELEASES_URL, REPO } from "./release.ts";
import type { Platform } from "./release.ts";
import { ivibeTheme } from "./theme.ts";

/**
 * The docs: short pages, each about one job, the way people look things up. Pick your computer once
 * and every shortcut, step and command follows. The shortcuts come from the app's own defaults, so
 * the two can't disagree. Anything for contributors stays on GitHub.
 */

/** StyleX can only read constants defined in this file. */
const MONO = '"Cascadia Code", "SF Mono", Menlo, Consolas, monospace';
const OS_KEY = "ivibe.docs.os";
const OS_ELECTRON: Record<Platform, string> = { windows: "win32", mac: "darwin", linux: "linux" };

const OsContext = createContext<Platform>("windows");
const GoContext = createContext<(path: string) => void>(() => undefined);

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-primary)",
  },
  layout: {
    maxWidth: 1240,
    marginInline: "auto",
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
    paddingTop: { default: 104, "@media (max-width: 900px)": 84 },
    paddingBottom: 72,
    display: "grid",
    gridTemplateColumns: {
      default: "220px minmax(0, 680px) 180px",
      "@media (max-width: 1180px)": "220px minmax(0, 1fr)",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    justifyContent: "space-between",
    columnGap: 48,
    alignItems: "start",
  },
  side: {
    position: "sticky",
    top: 88,
    maxHeight: "calc(100vh - 104px)",
    overflowY: "auto",
    scrollbarWidth: "thin",
    display: { default: "flex", "@media (max-width: 900px)": "none" },
    flexDirection: "column",
    gap: 20,
    paddingBottom: 16,
  },
  mobile: {
    display: { default: "none", "@media (max-width: 900px)": "flex" },
    flexDirection: "column",
    gap: 12,
    marginBottom: 28,
  },
  groups: { display: "flex", flexDirection: "column" },
  group: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    paddingBlock: 16,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "color-mix(in srgb, var(--color-text-primary) 9%, transparent)",
  },
  // A label, not a link: small capitals, with no hover or padding like the pages under it.
  groupName: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    color: "color-mix(in srgb, var(--color-text-primary) 48%, transparent)",
    paddingInline: 10,
    paddingBottom: 8,
    cursor: "default",
    userSelect: "none",
  },
  pageLink: {
    display: "block",
    paddingBlock: 6,
    paddingInline: 10,
    borderRadius: 8,
    fontSize: 14,
    color: {
      default: "var(--color-text-secondary)",
      ":hover": "var(--color-text-primary)",
    },
    textDecoration: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": "color-mix(in srgb, var(--color-text-primary) 5%, transparent)",
    },
  },
  pageLinkOn: {
    color: "var(--color-text-primary)",
    fontWeight: 500,
    backgroundColor: "color-mix(in srgb, var(--color-text-primary) 8%, transparent)",
  },
  outline: {
    position: "sticky",
    top: 88,
    display: { default: "block", "@media (max-width: 1180px)": "none" },
  },
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontWeight: 400,
    fontSize: "clamp(36px, 4vw, 48px)",
    lineHeight: 1.05,
    letterSpacing: "-0.01em",
    margin: 0,
  },
  lead: { display: "block", marginTop: 10, fontSize: 17, lineHeight: 1.5 },
  section: { marginTop: 40, scrollMarginTop: 88 },
  sectionTitle: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: 27,
    fontWeight: 400,
    lineHeight: 1.2,
    margin: 0,
    marginBottom: 12,
  },
  blocks: { display: "flex", flexDirection: "column", gap: 14 },
  p: { display: "block", lineHeight: 1.65 },
  list: {
    listStyleType: "disc",
    margin: 0,
    paddingInlineStart: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    lineHeight: 1.65,
  },
  ordered: { listStyleType: "decimal" },
  keys: { display: "inline-flex", alignItems: "center", gap: 3, verticalAlign: "baseline" },
  // Drawn here because Kbd swaps key names for Mac symbols, even on Windows.
  keycap: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 22,
    paddingInline: 6,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    whiteSpace: "nowrap",
    backgroundColor: "color-mix(in srgb, var(--color-text-primary) 9%, transparent)",
    boxShadow: "inset 0 -1px 0 color-mix(in srgb, var(--color-text-primary) 18%, transparent)",
  },
  table: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "color-mix(in srgb, var(--color-text-primary) 12%, transparent)",
    overflow: "hidden",
  },
  cell: {
    display: "flex",
    alignItems: "center",
    minHeight: 46,
    paddingBlock: 10,
    paddingInline: 14,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "color-mix(in srgb, var(--color-text-primary) 8%, transparent)",
  },
  cellFirst: { borderTopWidth: 0 },
  flow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingBlock: 28,
    paddingInline: 16,
    borderRadius: 14,
    backgroundColor: "#0f0e0d",
    color: "#f4f1ea",
  },
  flowArrow: { opacity: 0.45 },
  next: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 56,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "color-mix(in srgb, var(--color-text-primary) 10%, transparent)",
  },
});

function P({ children }: { children: ReactNode }) {
  return <Text xstyle={styles.p}>{children}</Text>;
}

function Items({ children, ordered = false }: { children: ReactNode; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return <List {...stylex.props(styles.list, ordered && styles.ordered)}>{children}</List>;
}

/** Keys drawn from an accelerator such as "Control+Alt+V", in this computer's own symbols. */
function Keys({ accelerator }: { accelerator: string }) {
  const os = useContext(OsContext);
  return (
    <span {...stylex.props(styles.keys)}>
      {acceleratorKeys(accelerator, os === "mac").map((key) => (
        <kbd key={key} {...stylex.props(styles.keycap)}>
          {key}
        </kbd>
      ))}
    </span>
  );
}

type Mode = "fix" | "prompt" | "dictate";

function Esc() {
  return <kbd {...stylex.props(styles.keycap)}>Esc</kbd>;
}

/** The default shortcut for a mode on the computer picked. */
function Shortcut({ mode }: { mode: Mode }) {
  const os = useContext(OsContext);
  return <Keys accelerator={defaultShortcuts(OS_ELECTRON[os])[mode]} />;
}

/** Text for one computer only. */
function On({ os, children }: { os: Platform | Platform[]; children: ReactNode }) {
  const current = useContext(OsContext);
  return [os].flat().includes(current) ? <>{children}</> : null;
}

function To({ page, children }: { page: string; children: ReactNode }) {
  const go = useContext(GoContext);
  const href = page ? `/docs/${page}` : "/docs";
  return (
    <Link
      hasUnderline
      href={href}
      onClick={(event) => {
        event.preventDefault();
        go(href);
      }}
    >
      {children}
    </Link>
  );
}

function Rows({ rows }: { rows: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <div {...stylex.props(styles.table)}>
      {rows.map((row, index) => (
        <div key={index} style={{ display: "contents" }}>
          <div {...stylex.props(styles.cell, index === 0 && styles.cellFirst)}>
            <Text>{row.label}</Text>
          </div>
          <div {...stylex.props(styles.cell, index === 0 && styles.cellFirst)}>{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function ModeShortcuts() {
  return (
    <Rows
      rows={[
        { label: "Fix", value: <Shortcut mode="fix" /> },
        { label: "Prompt", value: <Shortcut mode="prompt" /> },
        { label: "Dictate", value: <Shortcut mode="dictate" /> },
        { label: "Paste the last result", value: <Keys accelerator={PASTE_SHORTCUT} /> },
      ]}
    />
  );
}

function StartStop({ mode }: { mode: Mode }) {
  return (
    <P>
      Press <Shortcut mode={mode} /> to start and press it again to stop. Press <Esc /> to cancel.
    </P>
  );
}

type Section = { heading: string; body: ReactNode };
type DocPage = {
  slug: string;
  group: string;
  title: string;
  lead: string;
  sections: Section[];
};

const github = `https://github.com/${REPO}`;

const PAGES: DocPage[] = [
  {
    slug: "",
    group: "Get started",
    title: "Introduction",
    lead: "iVibe is a desktop app that turns your voice, and your screen when it helps, into text pasted where you were typing.",
    sections: [
      {
        heading: "Three modes",
        body: (
          <Items>
            <li>
              <To page="fix">Fix</To>: show a bug and describe it. You get a prompt for your coding
              agent, with marked-up screenshots as proof.
            </li>
            <li>
              <To page="prompt">Prompt</To>: ramble an idea. You get a clear, structured prompt.
            </li>
            <li>
              <To page="dictate">Dictate</To>: talk. You get your own words, cleaned up.
            </li>
          </Items>
        ),
      },
      {
        heading: "Start here",
        body: (
          <Items ordered>
            <li>
              <To page="install">Install iVibe</To>.
            </li>
            <li>
              <To page="plans">Add a Meta key or sign in for free credits</To>.
            </li>
            <li>
              <To page="quickstart">Make your first recording</To>.
            </li>
          </Items>
        ),
      },
    ],
  },
  {
    slug: "install",
    group: "Get started",
    title: "Install",
    lead: "Get iVibe running on your computer. The installers aren't code-signed yet, so your computer asks once.",
    sections: [
      {
        heading: "Download and open",
        body: (
          <>
            <On os="windows">
              <P>
                Works on Windows 10 and 11. Get the installer from the{" "}
                <Link hasUnderline href="/download">
                  download page
                </Link>{" "}
                and run it. If you see “Windows protected your PC”, click <strong>More info</strong>
                , then <strong>Run anyway</strong>.
              </P>
            </On>
            <On os="mac">
              <P>The quickest way is one line in Terminal. It skips the security prompt:</P>
              <CodeBlock code={MAC_INSTALL} language="bash" hasCopyButton isWrapped />
              <P>
                Or get the <code>.dmg</code> from the{" "}
                <Link hasUnderline href="/download">
                  download page
                </Link>{" "}
                and double-click iVibe; it offers to move itself to Applications. If macOS says it
                can&apos;t verify iVibe, open{" "}
                <strong>System Settings → Privacy &amp; Security</strong> and click{" "}
                <strong>Open Anyway</strong>.
              </P>
            </On>
            <On os="linux">
              <P>
                Get a build from the{" "}
                <Link hasUnderline href="/download">
                  download page
                </Link>
                . On Ubuntu or Debian:
              </P>
              <CodeBlock
                code="sudo apt install ./iVibe-<version>-linux-amd64.deb"
                language="bash"
                hasCopyButton
              />
              <P>On any other distribution, use the AppImage:</P>
              <CodeBlock
                code={
                  "chmod +x iVibe-<version>-linux-x86_64.AppImage\n./iVibe-<version>-linux-x86_64.AppImage"
                }
                language="bash"
                hasCopyButton
              />
            </On>
          </>
        ),
      },
      {
        heading: "Allow what it needs",
        body: (
          <>
            <On os="windows">
              <P>
                iVibe uses your microphone. If Windows blocks it, allow it in Windows Settings under
                Privacy &amp; security → Microphone.
              </P>
            </On>
            <On os="mac">
              <Items>
                <li>
                  <strong>Microphone</strong>, for your voice.
                </li>
                <li>
                  <strong>Screen &amp; System Audio Recording</strong>, for Fix. macOS asks at the
                  first recording, then iVibe relaunches. macOS 15 asks again about once a month.
                </li>
                <li>
                  <strong>Accessibility</strong>, to paste for you. Without it, results are copied
                  and you paste them yourself.
                </li>
              </Items>
            </On>
            <On os="linux">
              <P>
                To paste for you, iVibe uses <code>xdotool</code> on X11. Without it, or on Wayland,
                results are copied and you paste them yourself.
              </P>
              <CodeBlock code="sudo apt install xdotool" language="bash" hasCopyButton />
            </On>
          </>
        ),
      },
      {
        heading: "Updates",
        body: (
          <P>
            <On os={["windows", "linux"]}>
              iVibe downloads updates in the background and installs them when you restart.
            </On>
            <On os="mac">
              iVibe tells you when a new version is out, and you install it yourself.
            </On>{" "}
            See what changed in the{" "}
            <Link hasUnderline href={`${github}/releases`}>
              release notes
            </Link>
            .
          </P>
        ),
      },
    ],
  },
  {
    slug: "quickstart",
    group: "Get started",
    title: "Your first recording",
    lead: "From nothing to pasted text in under a minute, using Dictate.",
    sections: [
      {
        heading: "Try it",
        body: (
          <Items ordered>
            <li>Click into any text box: an email, a chat, a note.</li>
            <li>
              <On os="windows">
                Hold <Shortcut mode="dictate" /> and talk. Let go when you&apos;re done.
              </On>
              <On os={["mac", "linux"]}>
                Press <Shortcut mode="dictate" /> and talk. Press it again when you&apos;re done.
              </On>
            </li>
            <li>Your words appear in the box, cleaned up.</li>
          </Items>
        ),
      },
      {
        heading: "If nothing happens",
        body: (
          <P>
            You need a key or free credits first: see <To page="plans">Plans and credits</To>. For
            anything else, see <To page="troubleshooting">Troubleshooting</To>.
          </P>
        ),
      },
      {
        heading: "Next",
        body: (
          <P>
            Open your coding agent and try <To page="fix">Fix</To> on a real bug.
          </P>
        ),
      },
    ],
  },
  {
    slug: "fix",
    group: "Modes",
    title: "Fix",
    lead: "Show the bug and say what's wrong. iVibe writes the prompt and picks the screenshots that prove it. iVibe captures the bug; your coding agent fixes it.",
    sections: [
      {
        heading: "How to use it",
        body: (
          <>
            <Items ordered>
              <li>Keep your coding agent in the window you were typing in.</li>
              <li>Open the bug on your screen.</li>
              <li>
                Press <Shortcut mode="fix" />, show the problem and describe it out loud.
              </li>
              <li>Press the shortcut again to stop. A recording can last up to 60 seconds.</li>
            </Items>
            <P>
              Press <Esc /> to cancel.
            </P>
          </>
        ),
      },
      {
        heading: "What you get",
        body: (
          <P>
            A prompt pasted into your agent, with screenshots marked up to show the exact button or
            error. Each screenshot follows the sentence about it. See{" "}
            <To page="pasting">Where results go</To>.
          </P>
        ),
      },
      {
        heading: "What it records",
        body: (
          <P>
            The screen under your cursor and your microphone. Keys, tokens and passwords are painted
            over before anything leaves your computer: see{" "}
            <To page="privacy">Privacy and security</To>.
          </P>
        ),
      },
    ],
  },
  {
    slug: "prompt",
    group: "Modes",
    title: "Prompt",
    lead: "Ramble an idea. iVibe turns it into a clear, structured prompt. It uses your voice only, not your screen.",
    sections: [
      {
        heading: "How to use it",
        body: (
          <>
            <StartStop mode="prompt" />
            <P>A recording can last up to 60 seconds.</P>
          </>
        ),
      },
      {
        heading: "Get better prompts",
        body: (
          <P>
            Tell iVibe your role and stack once, in <To page="settings">Settings → Personal</To>,
            and every prompt has the right context.
          </P>
        ),
      },
    ],
  },
  {
    slug: "dictate",
    group: "Modes",
    title: "Dictate",
    lead: "Your own words, cleaned up: no filler words, no false starts. It uses your voice only, and a recording can last up to 5 minutes.",
    sections: [
      {
        heading: "How to use it",
        body: (
          <>
            <On os="windows">
              <Items>
                <li>
                  <strong>Hold</strong> <Shortcut mode="dictate" /> to talk, and let go to finish.
                </li>
                <li>
                  <strong>Double-press</strong> it to go hands-free, and double-press again to
                  finish.
                </li>
              </Items>
              <P>
                A single short tap does nothing, and Caps Lock is put back the way it was. Press{" "}
                <Esc /> to cancel.
              </P>
            </On>
            <On os={["mac", "linux"]}>
              <StartStop mode="dictate" />
            </On>
          </>
        ),
      },
      {
        heading: "Edit selected text by voice",
        body: (
          <P>
            Select text in any app and dictate. Say what to change, like “make this more formal” or
            “translate to Hindi”, or say new words. The result replaces your selection.
          </P>
        ),
      },
      {
        heading: "Turn off the cleanup",
        body: (
          <P>
            Turn off <strong>Clean up with AI</strong> in Settings to paste your words as heard.
            It&apos;s faster and uses fewer credits, but you lose editing by voice.
          </P>
        ),
      },
    ],
  },
  {
    slug: "pasting",
    group: "Using iVibe",
    title: "Where results go",
    lead: "iVibe pastes into the app you were in when you started recording.",
    sections: [
      {
        heading: "Screenshots",
        body: (
          <Items>
            <li>Chat apps and Claude Code get them as pasted images.</li>
            <li>Other terminal agents get them as file paths.</li>
            <li>
              Turn them off with <strong>Attach screenshots as proof</strong> in Settings.
            </li>
          </Items>
        ),
      },
      {
        heading: "If you switched apps",
        body: (
          <>
            <P>The result waits on your clipboard instead of landing in the wrong place.</P>
            <Items>
              <On os="windows">
                <li>Click into a text field and it pastes there, screenshots included.</li>
              </On>
              <li>
                Or press <Keys accelerator={PASTE_SHORTCUT} /> to paste it into the app in front.
              </li>
            </Items>
          </>
        ),
      },
      {
        heading: "Find an old result",
        body: (
          <P>
            The last 200 results are kept in <strong>History</strong> on your computer, ready to
            read or paste again. You can turn History off or clear it in Settings.
          </P>
        ),
      },
    ],
  },
  {
    slug: "shortcuts",
    group: "Using iVibe",
    title: "Shortcuts",
    lead: "Each mode has its own shortcut, and you can change them.",
    sections: [
      { heading: "Defaults", body: <ModeShortcuts /> },
      {
        heading: "Change a shortcut",
        body: (
          <P>
            In <strong>Settings → Shortcuts</strong>, click a shortcut and press the new keys. If
            another app is using it, iVibe tells you so you can pick another.{" "}
            <On os="windows">Use Ctrl, Alt or Shift with another key, or Caps Lock or an F key.</On>
          </P>
        ),
      },
    ],
  },
  {
    slug: "settings",
    group: "Using iVibe",
    title: "Make it yours",
    lead: "A little context once, so every result sounds like you.",
    sections: [
      {
        heading: "Personal",
        body: (
          <Items>
            <li>
              <strong>About you</strong>: your role and stack, so prompts have the right context.
            </li>
            <li>
              <strong>Your words</strong>: names and terms to always spell your way.
            </li>
            <li>
              <strong>Always</strong>: standing instructions for every result.
            </li>
          </Items>
        ),
      },
      {
        heading: "Languages",
        body: (
          <P>
            iVibe understands 25 languages, and you can mix them as you talk. Choose{" "}
            <strong>Languages you speak</strong> to settle how words that fit either language are
            written, and <strong>Write results in</strong> to pick the language of the result.
          </P>
        ),
      },
      {
        heading: "The pill",
        body: (
          <P>
            Choose a compact or full pill, and turn its sounds on or off. The pill stays out of
            screen recordings and screenshots unless you turn on{" "}
            <strong>Show in screen recordings</strong>, for demos and tutorials.
          </P>
        ),
      },
      {
        heading: "Microphone",
        body: (
          <P>
            iVibe uses your system&apos;s default. Pick another and test it in{" "}
            <strong>Settings → Microphone</strong>.
          </P>
        ),
      },
    ],
  },
  {
    slug: "plans",
    group: "Account",
    title: "Plans and credits",
    lead: "iVibe needs Meta's models to run. There are three ways to reach them, and the app is the same on all of them.",
    sections: [
      {
        heading: "Use your own Meta key",
        body: (
          <>
            <P>Free. Your recordings go straight to Meta, and Meta bills your account.</P>
            <Items ordered>
              <li>
                Get a key at{" "}
                <Link hasUnderline href="https://dev.meta.ai">
                  dev.meta.ai
                </Link>
                . It starts with <code>LLM_</code>.
              </li>
              <li>
                Paste it into <strong>Settings → Meta API key</strong>. It&apos;s encrypted with
                your system keychain.
              </li>
            </Items>
          </>
        ),
      },
      {
        heading: "Use free credits",
        body: (
          <>
            <P>
              Choose <strong>Continue with GitHub</strong> for 50 free credits, no key needed. Your
              GitHub account must be at least 14 days old, and there are limits per computer and per
              network.
            </P>
            <Banner
              status="info"
              title="On free credits, Meta may use your recordings to improve its models."
              description="Add your own key or go Pro to opt out."
            />
          </>
        ),
      },
      {
        heading: "Go Pro",
        body: (
          <P>
            $8 a month for 400 credits and encrypted <To page="backups">backups</To>, no key needed.
            Buy it in the app and manage or cancel it from the billing portal. Credits reset at each
            renewal and don&apos;t roll over.
          </P>
        ),
      },
      {
        heading: "What a credit buys",
        body: (
          <P>
            A dictation costs a fraction of a credit, and a Fix a few credits. Your usage is in the
            app&apos;s Settings.
          </P>
        ),
      },
      {
        heading: "If you have a key and an account",
        body: (
          <P>
            On Pro, recordings use your credits first. Otherwise they use your key first. If the
            first can&apos;t run, iVibe tries the other. You can change both in{" "}
            <strong>Settings → Meta API key</strong>.
          </P>
        ),
      },
    ],
  },
  {
    slug: "backups",
    group: "Account",
    title: "Backups",
    lead: "Pro keeps your history and settings safe, encrypted so that only you can read them.",
    sections: [
      {
        heading: "Turn them on",
        body: (
          <P>
            In <strong>Settings → iVibe Cloud</strong>, set up backups and choose how often they
            run: daily, weekly or monthly. Up to 500 MB is included. On a new computer, sign in and
            restore with your recovery key.
          </P>
        ),
      },
      {
        heading: "Your recovery key",
        body: (
          <Banner
            status="warning"
            title="Save your recovery key somewhere safe."
            description="Only you hold it. iVibe can't read your backups, and can't get them back without it."
          />
        ),
      },
      {
        heading: "What happens when Pro ends",
        body: (
          <P>
            You can still restore, export and delete. Backups are kept for 90 days after Pro ends,
            then deleted.
          </P>
        ),
      },
    ],
  },
  {
    slug: "privacy",
    group: "Account",
    title: "Privacy and security",
    lead: "What leaves your computer, and what doesn't. The full policy is on the Privacy page.",
    sections: [
      {
        heading: "What stays on your computer",
        body: (
          <Items>
            <li>Unredacted frames, which are held in memory and never saved or uploaded.</li>
            <li>Your Meta key, encrypted with your system keychain.</li>
            <li>Your history, unless you back it up with Pro, encrypted.</li>
          </Items>
        ),
      },
      {
        heading: "What gets painted over",
        body: (
          <>
            <P>
              Every frame is read on your computer, and API keys, tokens, <code>.env</code> lines
              and password managers are painted over with solid boxes before anything can leave.
            </P>
            <Banner
              status="warning"
              title="Redaction is automatic and can miss things."
              description="Keep anything you'd never share off screen while you record."
            />
          </>
        ),
      },
      {
        heading: "What goes to Meta",
        body: (
          <P>
            Your voice, your text and the redacted screenshots. With your own key they go straight
            to Meta; with Pro they pass through iVibe and aren&apos;t kept. Read the full{" "}
            <Link hasUnderline href="/privacy">
              Privacy policy
            </Link>
            .
          </P>
        ),
      },
    ],
  },
  {
    slug: "troubleshooting",
    group: "Help",
    title: "Troubleshooting",
    lead: "The problems people hit most, and what to do.",
    sections: [
      {
        heading: "The pill doesn't appear",
        body: (
          <Items>
            <li>
              Check that iVibe is running, and update to the{" "}
              <Link hasUnderline href={RELEASES_URL}>
                latest version
              </Link>
              .
            </li>
            <li>
              Open <strong>Settings → Shortcuts</strong>. If another app is using a shortcut, iVibe
              says so there: pick another.
            </li>
            <li>
              If you&apos;re looking for it in a screenshot or recording, it stays hidden unless you
              turn on <strong>Show in screen recordings</strong>.
            </li>
          </Items>
        ),
      },
      {
        heading: "“Sign in to iVibe Cloud or add your Meta API key”",
        body: (
          <P>
            iVibe has nothing to run on yet. See <To page="plans">Plans and credits</To>.
          </P>
        ),
      },
      {
        heading: "“No speech was heard”",
        body: (
          <P>
            Check your microphone in <strong>Settings → Microphone</strong> and use the test there.
            <On os="mac"> Also check that iVibe is allowed the microphone in System Settings.</On>
          </P>
        ),
      },
      {
        heading: "“Couldn't transcribe”",
        body: (
          <P>iVibe needs the internet to reach Meta&apos;s models. Check your connection or key.</P>
        ),
      },
      {
        heading: "Nothing was pasted",
        body: (
          <Items>
            <li>
              The result is probably on your clipboard. Press <Keys accelerator={PASTE_SHORTCUT} />{" "}
              or paste it yourself.
            </li>
            <li>
              Check <strong>Paste into the app I was using</strong> in Settings.
            </li>
            <On os="mac">
              <li>
                Allow iVibe under <strong>Accessibility</strong> in System Settings.
              </li>
            </On>
            <On os="linux">
              <li>
                Install <code>xdotool</code>. On Wayland, results are always copied.
              </li>
            </On>
          </Items>
        ),
      },
      {
        heading: "Screenshots didn't appear",
        body: (
          <P>
            Screenshots are for Fix only, and the app has to accept images. Check{" "}
            <strong>Attach screenshots as proof</strong> in Settings. See{" "}
            <To page="pasting">Where results go</To>.
          </P>
        ),
      },
      {
        heading: "Free credits were refused",
        body: (
          <P>
            Your GitHub account must be at least 14 days old, and each computer and network has a
            limit. Free credits also have a daily limit across everyone, so try again tomorrow, or
            add your own key.
          </P>
        ),
      },
      {
        heading: "My key doesn't work",
        body: (
          <P>
            Keys start with <code>LLM_</code>. If it&apos;s refused, check its billing and limits at{" "}
            <Link hasUnderline href="https://dev.meta.ai">
              dev.meta.ai
            </Link>
            .
          </P>
        ),
      },
      {
        heading: "Still stuck",
        body: (
          <P>
            <Link hasUnderline href={`${github}/issues`}>
              Open an issue on GitHub
            </Link>{" "}
            with your iVibe version, your computer, and what you did.
          </P>
        ),
      },
    ],
  },
];

const GROUPS = [...new Set(PAGES.map((page) => page.group))];

const headingId = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const pathOf = (page: DocPage, heading?: string) =>
  `${page.slug ? `/docs/${page.slug}` : "/docs"}${heading ? `#${headingId(heading)}` : ""}`;

const slugFrom = (path: string) => path.replace(/\/+$/, "").replace(/^\/docs\/?/, "");

const SEARCH_ITEMS = PAGES.flatMap((page) => [
  { id: pathOf(page), label: page.title },
  ...page.sections.map((section) => ({
    id: pathOf(page, section.heading),
    label: `${page.title}: ${section.heading}`,
  })),
]);
const searchSource = createStaticSource(SEARCH_ITEMS);

function readOs(): Platform {
  try {
    const stored = localStorage.getItem(OS_KEY);
    if (stored === "windows" || stored === "mac" || stored === "linux") return stored;
  } catch {
    // Without storage, it follows the visitor's computer.
  }
  return detectPlatform() ?? "windows";
}

function OsSwitch({ os, onChange }: { os: Platform; onChange: (os: Platform) => void }) {
  return (
    <SegmentedControl
      label="Your computer"
      size="sm"
      value={os}
      onChange={(value) => onChange(value as Platform)}
    >
      <SegmentedControlItem value="windows" label="Windows" />
      <SegmentedControlItem value="mac" label="Mac" />
      <SegmentedControlItem value="linux" label="Linux" />
    </SegmentedControl>
  );
}

export function DocsPage({
  mode,
  onModeChange,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  const [slug, setSlug] = useState(() => slugFrom(window.location.pathname));
  const [os, setOs] = useState<Platform>(readOs);
  const [searching, setSearching] = useState(false);
  const [activeId, setActiveId] = useState<string>();

  const index = Math.max(
    0,
    PAGES.findIndex((page) => page.slug === slug),
  );
  const page = PAGES[index]!;
  const previous = PAGES[index - 1];
  const next = PAGES[index + 1];

  const pickOs = (value: Platform) => {
    setOs(value);
    try {
      localStorage.setItem(OS_KEY, value);
    } catch {
      // A remembered computer is a convenience.
    }
  };

  /** Moves between pages without reloading, so the sidebar stays where it is. */
  const go = useMemo(
    () => (path: string) => {
      const [pathname, hash] = path.split("#");
      window.history.pushState(null, "", path);
      setSlug(slugFrom(pathname ?? ""));
      window.setTimeout(() => {
        const target = hash ? document.getElementById(hash) : null;
        if (target) target.scrollIntoView();
        else window.scrollTo(0, 0);
      }, 0);
    },
    [],
  );

  useEffect(() => {
    const onPop = () => setSlug(slugFrom(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title = `${page.title} · iVibe Docs`;
  }, [page.title]);

  // Arriving on a link to one section of a page.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searchButton = (
    <Button
      label="Search"
      variant="secondary"
      size="sm"
      icon={<Search size={14} strokeWidth={2} aria-hidden="true" />}
      endContent={<Kbd keys="mod+k" />}
      onClick={() => setSearching(true)}
    />
  );

  return (
    <OsContext.Provider value={os}>
      <GoContext.Provider value={go}>
        <div {...stylex.props(styles.page)}>
          <Theme theme={ivibeTheme} mode={mode}>
            <TopBar mode={mode} onModeChange={onModeChange} />
          </Theme>
          <Nav page="docs" />
          <div {...stylex.props(styles.layout)}>
            <aside {...stylex.props(styles.side)}>
              {searchButton}
              <OsSwitch os={os} onChange={pickOs} />
              <nav aria-label="Docs" {...stylex.props(styles.groups)}>
                {GROUPS.map((group) => (
                  <div key={group} {...stylex.props(styles.group)}>
                    <span {...stylex.props(styles.groupName)}>{group}</span>
                    {PAGES.filter((item) => item.group === group).map((item) => (
                      <a
                        key={item.slug}
                        href={pathOf(item)}
                        aria-current={item === page ? "page" : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          go(pathOf(item));
                        }}
                        {...stylex.props(styles.pageLink, item === page && styles.pageLinkOn)}
                      >
                        {item.title}
                      </a>
                    ))}
                  </div>
                ))}
              </nav>
            </aside>

            <main>
              <div {...stylex.props(styles.mobile)}>
                <Selector
                  label="Page"
                  isLabelHidden
                  value={pathOf(page)}
                  options={PAGES.map((item) => ({ value: pathOf(item), label: item.title }))}
                  onChange={go}
                  width="100%"
                />
                <OsSwitch os={os} onChange={pickOs} />
              </div>

              <Text size="sm" color="secondary">
                {page.group}
              </Text>
              <Heading level={1} xstyle={styles.title}>
                {page.title}
              </Heading>
              <Text color="secondary" xstyle={styles.lead}>
                {page.lead}
              </Text>

              {page.sections.map((section) => (
                <section
                  key={section.heading}
                  id={headingId(section.heading)}
                  {...stylex.props(styles.section)}
                >
                  <Heading level={2} xstyle={styles.sectionTitle}>
                    {section.heading}
                  </Heading>
                  <div {...stylex.props(styles.blocks)}>{section.body}</div>
                </section>
              ))}

              <div {...stylex.props(styles.next)}>
                {previous ? (
                  <Button
                    label={previous.title}
                    variant="ghost"
                    icon={<ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />}
                    href={pathOf(previous)}
                    onClick={(event) => {
                      event.preventDefault();
                      go(pathOf(previous));
                    }}
                  />
                ) : (
                  <span />
                )}
                {next && (
                  <Button
                    label={next.title}
                    variant="ghost"
                    endContent={<ArrowRight size={15} strokeWidth={2} aria-hidden="true" />}
                    href={pathOf(next)}
                    onClick={(event) => {
                      event.preventDefault();
                      go(pathOf(next));
                    }}
                  />
                )}
              </div>
            </main>

            <div {...stylex.props(styles.outline)}>
              {page.sections.length > 1 && (
                <Outline
                  key={page.slug}
                  label="On this page"
                  density="compact"
                  items={page.sections.map((section) => ({
                    id: headingId(section.heading),
                    label: section.heading,
                    level: 2,
                  }))}
                  activeId={activeId}
                  onActiveIdChange={setActiveId}
                  offset={96}
                />
              )}
            </div>
          </div>
          <Footer mode={mode} onModeChange={onModeChange} />
          <CommandPalette
            isOpen={searching}
            onOpenChange={setSearching}
            searchSource={searchSource}
            label="Search the docs"
            onValueChange={(value: string | null) => {
              if (!value) return;
              setSearching(false);
              go(value);
            }}
          />
        </div>
      </GoContext.Provider>
    </OsContext.Provider>
  );
}
