// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Footer } from "./footer.tsx";
import { Nav } from "./nav.tsx";
import { REPO } from "./release.ts";
import { breadcrumbs, usePageMeta } from "./seo.ts";
import { ivibeTheme } from "./theme.ts";
import { TopBar } from "./top-bar.tsx";

/**
 * Pages for people searching for this kind of tool. Comparisons say where the other app is the
 * better pick, and each fact about another app comes from that app's own site: recheck them, and
 * CHECKED, whenever these pages change.
 */

const SERIF = '"Instrument Serif", Georgia, serif';
const CHECKED = "November 2026";
const github = `https://github.com/${REPO}`;

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-primary)",
  },
  main: {
    maxWidth: 720,
    marginInline: "auto",
    paddingInline: { default: 24, "@media (max-width: 640px)": 16 },
    paddingTop: { default: 136, "@media (max-width: 760px)": 104 },
    paddingBottom: 88,
  },
  title: {
    fontFamily: SERIF,
    fontWeight: 400,
    fontSize: "clamp(38px, 5.4vw, 56px)",
    lineHeight: 1.04,
    letterSpacing: "-0.015em",
    margin: 0,
  },
  lead: { display: "block", fontSize: 19, lineHeight: 1.5, marginTop: 16 },
  section: { marginTop: 44, display: "flex", flexDirection: "column", gap: 16 },
  h2: {
    fontFamily: SERIF,
    fontWeight: 400,
    fontSize: 30,
    lineHeight: 1.12,
    margin: 0,
  },
  p: { display: "block", fontSize: 17, lineHeight: 1.7 },
  list: {
    margin: 0,
    paddingInlineStart: 22,
    listStyleType: "disc",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    fontSize: 17,
    lineHeight: 1.6,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: { default: 15, "@media (max-width: 640px)": 14 },
    lineHeight: 1.45,
  },
  cell: {
    textAlign: "start",
    verticalAlign: "top",
    paddingBlock: 12,
    paddingInlineEnd: 16,
    fontWeight: 400,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "color-mix(in srgb, var(--color-text-primary) 12%, transparent)",
  },
  head: { fontWeight: 500 },
  end: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20, marginTop: 44 },
  note: { display: "block", marginTop: 28 },
});

function P({ children }: { children: ReactNode }) {
  return (
    <Text xstyle={styles.p} color="secondary">
      {children}
    </Text>
  );
}

function Items({ children }: { children: ReactNode }) {
  return <ul {...stylex.props(styles.list)}>{children}</ul>;
}

function To({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link hasUnderline href={href}>
      {children}
    </Link>
  );
}

/** A side-by-side table of iVibe and another app. */
function Versus({ other, rows }: { other: string; rows: [string, string, string][] }) {
  return (
    <table {...stylex.props(styles.table)}>
      <thead>
        <tr>
          <th scope="col" {...stylex.props(styles.cell, styles.head)}>
            <span hidden>Feature</span>
          </th>
          <th scope="col" {...stylex.props(styles.cell, styles.head)}>
            iVibe
          </th>
          <th scope="col" {...stylex.props(styles.cell, styles.head)}>
            {other}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, ours, theirs]) => (
          <tr key={label}>
            <th scope="row" {...stylex.props(styles.cell)}>
              {label}
            </th>
            <td {...stylex.props(styles.cell)}>{ours}</td>
            <td {...stylex.props(styles.cell)}>{theirs}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Guide = {
  path: string;
  /** The name in the breadcrumb trail. */
  name: string;
  seoTitle: string;
  description: string;
  title: string;
  lead: string;
  sections: { heading: string; body: ReactNode }[];
  /** The other app's own site, where this page's facts about it came from. */
  source?: { name: string; url: string };
};

const GUIDES: Guide[] = [
  {
    path: "/voice-to-prompt",
    name: "Voice to prompt",
    seoTitle: "Voice to prompt for Claude Code and Cursor · iVibe",
    description:
      "Talk through what you want and iVibe pastes a clear prompt into Claude Code, Cursor or ChatGPT. Show a bug on screen and it adds marked-up screenshots.",
    title: "Voice to prompt for Claude Code and Cursor",
    lead: "Say what you want the way you'd tell a teammate. iVibe writes the prompt and pastes it into your coding agent.",
    sections: [
      {
        heading: "Why talk instead of type",
        body: (
          <P>
            A good prompt has context: what you were doing, what you expected, what you already
            tried. You leave that out when you type, because typing it is slow. Talking keeps it in,
            and iVibe takes out the ums, the false starts and the second thoughts.
          </P>
        ),
      },
      {
        heading: "Two ways to do it",
        body: (
          <Items>
            <li>
              <To href="/docs/prompt">Prompt</To>: ramble an idea and get a clear, structured
              prompt.
            </li>
            <li>
              <To href="/docs/fix">Fix</To>: show a bug on screen while you explain it. You get a
              fix prompt with marked-up screenshots as proof, so your agent can see what you saw.
            </li>
          </Items>
        ),
      },
      {
        heading: "How it gets to your agent",
        body: (
          <>
            <P>
              Press a shortcut, talk, and press it again. The result lands where you were typing.
            </P>
            <Items>
              <li>Claude Code, Muse Code and chat apps get screenshots as pasted images.</li>
              <li>Other terminal agents get them as file paths.</li>
              <li>The text pastes into anything you can type in, Cursor included.</li>
            </Items>
            <P>
              See <To href="/docs/pasting">where results go</To> for the details.
            </P>
          </>
        ),
      },
      {
        heading: "What leaves your computer",
        body: (
          <P>
            Keys, tokens and passwords are painted over on your computer before anything is sent.
            It&apos;s automatic and can miss things, so keep anything you&apos;d never share off
            screen. Read <To href="/blog/how-ivibe-hides-your-secrets">how that works</To>.
          </P>
        ),
      },
      {
        heading: "What it costs",
        body: (
          <P>
            The app is free and open source. Use your own Meta key and Meta bills you for what you
            use, or start with 50 free credits. Pro is $8 a month for 400 credits. See{" "}
            <To href="/docs/plans">plans and credits</To>.
          </P>
        ),
      },
    ],
  },
  {
    path: "/open-source-dictation",
    name: "Open-source dictation",
    seoTitle: "Open-source dictation for Windows, Mac and Linux · iVibe",
    description:
      "iVibe is AGPL-licensed dictation for Windows, macOS and Linux. Talk in any app and get clean text, using your own Meta key. Needs the internet.",
    title: "Open-source dictation for Windows, Mac and Linux",
    lead: "Talk in any app and get your own words back, cleaned up. Every line of the app is on GitHub.",
    sections: [
      {
        heading: "What you get",
        body: (
          <Items>
            <li>One shortcut in any app, with the result pasted where you were typing.</li>
            <li>
              No filler words or false starts, or turn the cleanup off to get your words as heard.
            </li>
            <li>Select text and say what to change, like “make this more formal”.</li>
            <li>25 languages, which you can mix as you talk.</li>
            <li>Your last 200 results kept on your computer, or turned off.</li>
          </Items>
        ),
      },
      {
        heading: "What open source means here",
        body: (
          <P>
            The <To href={github}>code is public</To> under AGPL-3.0, so you can read what it does
            with your voice and your screen, and build it yourself. Secret redaction runs on your
            computer, and the <To href={`${github}/tree/main/packages/redact`}>code for it</To> is
            there too.
          </P>
        ),
      },
      {
        heading: "What it isn't",
        body: (
          <P>
            iVibe isn&apos;t a local-only tool. Open source describes the app, while the speech and
            cleanup run on Meta&apos;s models, so it needs the internet. If your audio must never
            leave your computer, pick a tool that runs a local model instead.
          </P>
        ),
      },
      {
        heading: "Where your voice goes",
        body: (
          <P>
            With your own key, it goes straight to Meta. With Pro, it passes through iVibe and
            isn&apos;t kept. On free credits, Meta may use it to improve its models. The{" "}
            <To href="/privacy">privacy policy</To> has the full picture.
          </P>
        ),
      },
      {
        heading: "Get started",
        body: (
          <P>
            <To href="/docs/install">Install iVibe</To>, add a key or use the free credits, then{" "}
            <To href="/docs/quickstart">make your first recording</To>. The installers aren&apos;t
            code-signed yet, so your computer asks once.
          </P>
        ),
      },
    ],
  },
  {
    path: "/compare/wispr-flow",
    name: "Wispr Flow alternative",
    seoTitle: "An open-source Wispr Flow alternative · iVibe",
    description:
      "How iVibe compares with Wispr Flow on price, platforms and source code, what iVibe adds for coding agents, and when Wispr Flow is the better pick.",
    title: "An open-source Wispr Flow alternative",
    lead: "Wispr Flow is polished dictation for everywhere you type. iVibe is open source, runs on Linux, and turns a bug on your screen into a prompt.",
    source: { name: "Wispr Flow's pricing page", url: "https://wisprflow.ai/pricing" },
    sections: [
      {
        heading: "Side by side",
        body: (
          <Versus
            other="Wispr Flow"
            rows={[
              [
                "Free plan",
                "Unlimited recordings on your own Meta key, which Meta bills you for, plus 50 free credits",
                "A limited number of words a week",
              ],
              [
                "Paid plan",
                "$8 a month for 400 credits",
                "$15 a month, or $12 a month billed yearly, with no dictation limit",
              ],
              ["Computers", "Windows, Mac, Linux", "Windows, Mac"],
              ["Phones", "No", "iPhone, Android"],
              ["Source code", "Public, AGPL-3.0", "Not published, as far as we can find"],
              ["Bug prompts with screenshots", "Yes", "Not listed"],
            ]}
          />
        ),
      },
      {
        heading: "Pick iVibe if",
        body: (
          <Items>
            <li>You want to read the code that hears your voice and sees your screen.</li>
            <li>You work on Linux.</li>
            <li>
              You talk to coding agents, and want <To href="/docs/fix">bugs shown with proof</To>{" "}
              rather than only described.
            </li>
            <li>You&apos;d rather pay Meta directly, with your own key.</li>
          </Items>
        ),
      },
      {
        heading: "Pick Wispr Flow if",
        body: (
          <Items>
            <li>You dictate on your phone as well as your computer.</li>
            <li>You want unlimited dictation for one flat price, not credits.</li>
            <li>You&apos;d rather not see a security prompt: iVibe isn&apos;t code-signed yet.</li>
          </Items>
        ),
      },
    ],
  },
  {
    path: "/compare/superwhisper",
    name: "Superwhisper alternative",
    seoTitle: "An open-source Superwhisper alternative · iVibe",
    description:
      "How iVibe compares with Superwhisper on price, platforms and offline use, what iVibe adds for coding agents, and when Superwhisper is the better pick.",
    title: "An open-source Superwhisper alternative",
    lead: "Superwhisper runs models on your own computer and works offline. iVibe is open source, runs on Linux, and turns a bug on your screen into a prompt.",
    source: { name: "Superwhisper's website", url: "https://superwhisper.com" },
    sections: [
      {
        heading: "Side by side",
        body: (
          <Versus
            other="Superwhisper"
            rows={[
              [
                "Free plan",
                "Unlimited recordings on your own Meta key, which Meta bills you for, plus 50 free credits",
                "Unlimited use of Whisper models",
              ],
              ["Paid plan", "$8 a month for 400 credits", "Monthly, yearly or lifetime Pro plans"],
              ["Computers", "Windows, Mac, Linux", "Windows, Mac"],
              ["Phones", "No", "iPhone, Android"],
              ["Works offline", "No, it needs Meta's models", "Yes"],
              ["Languages", "25", "100+"],
              ["Source code", "Public, AGPL-3.0", "Not published, as far as we can find"],
              ["Bug prompts with screenshots", "Yes", "Not listed"],
            ]}
          />
        ),
      },
      {
        heading: "Pick iVibe if",
        body: (
          <Items>
            <li>You want to read the code that hears your voice and sees your screen.</li>
            <li>You work on Linux.</li>
            <li>
              You talk to coding agents, and want <To href="/docs/fix">bugs shown with proof</To>{" "}
              rather than only described.
            </li>
          </Items>
        ),
      },
      {
        heading: "Pick Superwhisper if",
        body: (
          <Items>
            <li>You need dictation offline, or your audio has to stay on your computer.</li>
            <li>You dictate on your phone as well as your computer.</li>
            <li>You speak a language outside iVibe&apos;s 25.</li>
            <li>You&apos;d rather pay once than every month.</li>
          </Items>
        ),
      },
    ],
  },
];

const guideAt = (path: string) => GUIDES.find((guide) => guide.path === path);

/** Whether an address is a guide; otherwise it's a 404. */
export const hasGuidePage = (path: string) => !!guideAt(path);

export function GuidePage({
  mode,
  onModeChange,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  const guide = guideAt(window.location.pathname.replace(/\/+$/, ""))!;
  usePageMeta({
    title: guide.seoTitle,
    description: guide.description,
    path: guide.path,
    jsonLd: [breadcrumbs({ name: "iVibe", path: "/" }, { name: guide.name, path: guide.path })],
  });
  return (
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode={mode}>
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <Nav page="legal" mode={mode} onModeChange={onModeChange} />
      <main {...stylex.props(styles.main)}>
        <Heading level={1} xstyle={styles.title}>
          {guide.title}
        </Heading>
        <Text color="secondary" xstyle={styles.lead}>
          {guide.lead}
        </Text>
        {guide.sections.map((section) => (
          <section key={section.heading} {...stylex.props(styles.section)}>
            <Heading level={2} xstyle={styles.h2}>
              {section.heading}
            </Heading>
            {section.body}
          </section>
        ))}
        {guide.source && (
          <Text size="sm" color="secondary" xstyle={styles.note}>
            Facts about the other app come from <To href={guide.source.url}>{guide.source.name}</To>
            , checked in {CHECKED}. Prices and features change, so check there too. Names belong to
            their owners.
          </Text>
        )}
        <div {...stylex.props(styles.end)}>
          <Button label="Download iVibe" variant="primary" href="/download" />
          <Link href={github}>See the code</Link>
        </div>
      </main>
      <Footer mode={mode} onModeChange={onModeChange} />
    </div>
  );
}
