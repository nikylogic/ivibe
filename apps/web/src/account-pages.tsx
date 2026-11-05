// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { GitHubMark, GoogleMark } from "../../desktop/src/renderer/ui/sign-in-buttons.tsx";
import { AUTH_URL, BACK_TO_APP_URL, OPEN_APP_URL, SIGN_IN_APP_URL } from "./account.ts";
import { Footer } from "./footer.tsx";
import { Paper, Stage } from "./moment.tsx";
import type { MomentWords } from "./moment.tsx";
import { Nav } from "./nav.tsx";
import { usePageMeta } from "./seo.ts";
import { ivibeTheme } from "./theme.ts";
import { TopBar } from "./top-bar.tsx";

/**
 * Where sign-in and billing land. The API redirects here (apps/api/src/moments.ts), with anything
 * private after the # so that it never reaches a server. Nothing here is trusted: a login code only
 * works in the app that started that sign-in, and the provider's name comes from a fixed list.
 */

type PageProps = { mode: ThemeMode; onModeChange: (mode: ThemeMode) => void };
type Fragment = URLSearchParams;
type Page = {
  look: "stage" | "paper";
  tone?: "Fix" | "Prompt" | "Dictate";
  /** The browser tab, and the description the build insists every page has. */
  title: string;
  description: string;
  words: (fragment: Fragment) => MomentWords;
  /** Opens the app as soon as the page shows, when the API asked for that. */
  appLink?: (fragment: Fragment) => string | null;
};

const BACK = { label: "Back to iVibe", href: BACK_TO_APP_URL };
const NO_APP = { label: "Don’t have iVibe here? Download it", href: "/download" };
const DOWNLOAD = { label: "Download iVibe", href: "/download" };

const providerName = (fragment: Fragment) =>
  fragment.get("provider") === "GitHub" ? "GitHub" : "Google";

const signInLink = (fragment: Fragment) => {
  const code = fragment.get("code");
  return code ? `${SIGN_IN_APP_URL}${encodeURIComponent(code)}` : null;
};

const PAGES: Record<string, Page> = {
  "signed-in": {
    look: "stage",
    tone: "Fix",
    title: "You’re signed in · iVibe",
    description: "You’re signed in to iVibe. Go back to the app.",
    appLink: signInLink,
    words: (fragment) => {
      const name = fragment.get("name")?.slice(0, 120);
      return {
        first: "You’re in",
        second: "iVibe will take it from here",
        line: name ? `Signed in as ${name}.` : undefined,
        mascot: "done",
        actions: [{ label: "Open iVibe", href: signInLink(fragment) ?? BACK_TO_APP_URL }],
        aside: NO_APP,
      };
    },
  },
  pro: {
    look: "stage",
    tone: "Prompt",
    title: "You’re on Pro · iVibe",
    description: "You’re on iVibe Pro. Your credits reach the app in a few seconds.",
    appLink: (fragment) => (fragment.has("open") ? OPEN_APP_URL : null),
    words: () => ({
      first: "You’re on Pro",
      second: "now say something",
      line: "Your 400 credits reach the app in a few seconds.",
      mascot: "done",
      actions: [{ label: "Open iVibe", href: OPEN_APP_URL }],
    }),
  },
  "all-set": {
    look: "stage",
    tone: "Dictate",
    title: "All set · iVibe",
    description: "You’re done with billing. Go back to iVibe.",
    appLink: (fragment) => (fragment.has("open") ? OPEN_APP_URL : null),
    words: () => ({
      first: "All set",
      second: "back to what you were saying",
      mascot: "done",
      actions: [{ label: "Open iVibe", href: OPEN_APP_URL }],
    }),
  },
  "payment-failed": {
    look: "paper",
    title: "Payment didn’t go through · iVibe",
    description: "The payment didn’t go through and nothing was charged.",
    words: () => ({
      first: "That payment didn’t go through",
      second: "nothing was charged",
      line: "You can try again from the app, with the same card or another one.",
      mascot: "shy",
      actions: [BACK],
    }),
  },
  "checkout-failed": {
    look: "paper",
    title: "Checkout didn’t open · iVibe",
    description: "Checkout didn’t open and you weren’t charged. Try again in a moment.",
    words: () => ({
      first: "Checkout didn’t open",
      second: "you weren’t charged",
      line: "That one is on our side. Give it a moment and try again.",
      mascot: "shy",
      actions: [
        { label: "Try again", href: `${AUTH_URL}/buy` },
        { label: "Back to pricing", href: "/#pricing" },
      ],
    }),
  },
  "sign-in-expired": {
    look: "paper",
    title: "Sign-in expired · iVibe",
    description: "That sign-in expired. Start again from the iVibe app.",
    words: () => ({
      first: "That sign-in timed out",
      second: "they only last ten minutes",
      line: "Start again from the app. It only takes a moment.",
      mascot: "shy",
      actions: [BACK],
      aside: NO_APP,
    }),
  },
  "sign-in-failed": {
    look: "paper",
    title: "Sign-in failed · iVibe",
    description: "The sign-in wasn’t confirmed. Try again from the iVibe app.",
    words: (fragment) => ({
      first: `${providerName(fragment)} didn’t confirm it`,
      second: "so nothing has changed",
      line: "Try again from the app. Picking the other sign-in works too.",
      mascot: "shy",
      actions: [BACK],
      aside: NO_APP,
    }),
  },
  "google-unavailable": {
    look: "paper",
    title: "Google sign-in isn’t available · iVibe",
    description: "Google sign-in isn’t available right now. Continue with GitHub in the app.",
    words: () => ({
      first: "Google sign-in is away",
      second: "GitHub still works",
      line: "Go back to the app and continue with GitHub.",
      mascot: "shy",
      actions: [BACK],
    }),
  },
  "pro-coming-soon": {
    look: "paper",
    title: "Pro is coming soon · iVibe",
    description: "iVibe Pro isn’t on sale yet. Add your own Meta key to use iVibe for free.",
    words: () => ({
      first: "Pro isn’t open yet",
      second: "your own key works for free",
      line: "Add a Meta key in the app and use all of iVibe until then.",
      actions: [DOWNLOAD],
    }),
  },
  "open-from-app": {
    look: "paper",
    title: "Open this from the app · iVibe",
    description: "Sign-in starts inside the iVibe app. Open it and choose how to sign in.",
    words: () => ({
      first: "This starts in the app",
      second: "that’s how it knows it’s you",
      line: "Open iVibe and choose how to sign in.",
      actions: [BACK],
      aside: NO_APP,
    }),
  },
};

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-primary)",
  },
  // The download page's two columns: who it is on the left, what to press on the right.
  main: {
    maxWidth: 960,
    minHeight: "86svh",
    marginInline: "auto",
    paddingInline: 24,
    paddingTop: { default: 136, "@media (max-width: 760px)": 104 },
    paddingBottom: 96,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(260px, 420px) minmax(0, 420px)",
      "@media (max-width: 760px)": "minmax(0, 1fr)",
    },
    justifyContent: "center",
    columnGap: 72,
    rowGap: 40,
    alignItems: "center",
  },
  brand: {
    display: "flex",
    flexDirection: "column",
    alignItems: { default: "flex-start", "@media (max-width: 760px)": "center" },
    textAlign: { default: "start", "@media (max-width: 760px)": "center" },
    gap: 12,
  },
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontWeight: 400,
    fontSize: "clamp(40px, 5vw, 60px)",
    lineHeight: 1.05,
    letterSpacing: "-0.015em",
    margin: 0,
  },
  second: { display: "block", fontStyle: "italic", color: "var(--color-text-secondary)" },
  row: { display: "flex", justifyContent: "space-between", gap: 16 },
  amount: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: 36,
    lineHeight: 1,
  },
});

/** Pro's offer, as the pricing table says it. */
const PRO = [
  { label: "API key", value: "not needed" },
  { label: "Usage", value: "400 credits a month" },
  { label: "Backups", value: "encrypted" },
  { label: "Support", value: "priority" },
];

/** Signing in on the way to checkout. The mascot looks over at the buttons as you lean to them. */
function ChooseSignIn({ mode, onModeChange }: PageProps) {
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  const look = () => setGaze({ x: 1.4, y: 0.1 });
  const away = () => setGaze(null);
  return (
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode={mode}>
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <Nav page="legal" mode={mode} onModeChange={onModeChange} />
      <main {...stylex.props(styles.main)}>
        <div {...stylex.props(styles.brand)}>
          <Mascot size={132} state="idle" gaze={gaze} />
          <Heading level={1} xstyle={styles.title}>
            One thing first.
            <span {...stylex.props(styles.second)}>Who’s buying?</span>
          </Heading>
          <Text color="secondary">Pro lands on this account, so use the one from the app.</Text>
        </div>

        <VStack gap={6}>
          <div
            className="touch-area"
            onMouseEnter={look}
            onMouseLeave={away}
            onFocus={look}
            onBlur={away}
          >
            <VStack gap={2}>
              <Button
                label="Continue with Google"
                variant="primary"
                size="lg"
                width="100%"
                icon={<GoogleMark />}
                href={`${AUTH_URL}/buy?with=google`}
              />
              <Button
                label="Continue with GitHub"
                variant="secondary"
                size="lg"
                width="100%"
                icon={<GitHubMark />}
                href={`${AUTH_URL}/buy?with=github`}
              />
            </VStack>
          </div>
          <Divider />
          <VStack gap={3}>
            <div {...stylex.props(styles.row)}>
              <Text weight="semibold">iVibe Pro</Text>
              <HStack gap={1} vAlign="center">
                <span {...stylex.props(styles.amount)}>$8</span>
                <Text size="sm" color="secondary">
                  a month
                </Text>
              </HStack>
            </div>
            <VStack gap={1}>
              {PRO.map((row) => (
                <div key={row.label} {...stylex.props(styles.row)}>
                  <Text size="sm" color="secondary">
                    {row.label}
                  </Text>
                  <Text size="sm">{row.value}</Text>
                </div>
              ))}
            </VStack>
          </VStack>
          <Divider />
          <HStack gap={5} hAlign="center" wrap="wrap">
            <Link href="/#pricing" size="sm">
              Compare plans
            </Link>
            <Link href="/refunds" size="sm">
              Refunds
            </Link>
            <Link href="/terms" size="sm">
              Terms
            </Link>
          </HStack>
        </VStack>
      </main>
      <Footer mode={mode} onModeChange={onModeChange} />
    </div>
  );
}

const CHOOSE_META = {
  title: "Sign in to buy Pro · iVibe",
  description: "Choose the account you use in the app, so iVibe Pro lands in the right place.",
};

/** Every address here. */
const PATHS = [...Object.keys(PAGES), "sign-in"].map((name) => `/account/${name}`);

export function hasAccountPage(path: string): boolean {
  return PATHS.includes(path);
}

/** Opens the app once, as the page first shows. The page's button stays for a refused prompt. */
function useOpenApp(link: string | null | undefined) {
  const opened = useRef(false);
  useEffect(() => {
    if (!link || opened.current) return;
    opened.current = true;
    window.location.href = link;
  }, [link]);
}

export function AccountPage({ mode, onModeChange }: PageProps) {
  const path = window.location.pathname.replace(/\/+$/, "");
  const page = PAGES[path.slice("/account/".length)];
  const [fragment] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  usePageMeta({
    ...(page ? { title: page.title, description: page.description } : CHOOSE_META),
    path,
    noindex: true,
  });
  useOpenApp(page?.appLink?.(fragment));
  if (!page) return <ChooseSignIn mode={mode} onModeChange={onModeChange} />;
  return page.look === "stage" ? (
    <Stage mode={mode} onModeChange={onModeChange} tone={page.tone} {...page.words(fragment)} />
  ) : (
    <Paper mode={mode} onModeChange={onModeChange} {...page.words(fragment)} />
  );
}
