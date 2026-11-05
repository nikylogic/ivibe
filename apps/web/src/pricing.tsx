// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Theme } from "@astryxdesign/core/theme";
import { BUY_URL, fetchAccount, signOutOfWeb } from "./account.ts";
import type { WebAccount } from "./account.ts";
import { glide, MONO } from "./demo/kit.tsx";
import { ivibeTheme } from "./theme.ts";

/**
 * The price, as the receipt feature 6 ended on: one printed for each plan. Each prints
 * once when it comes into view and then stays still, so the numbers are easy to read. With reduced
 * motion both are simply there.
 */

const PAPER = "#f6f2e8";
const INK = "#2a2622";
const FAINT = "#6f675c";
const SERIF = '"Instrument Serif", Georgia, serif';
const TEETH = 28;
const TOOTH_DEPTH = 5;

const voice = stylex.keyframes({
  from: { transform: "scaleY(0.22)" },
  to: { transform: "scaleY(1)" },
});

const styles = stylex.create({
  plan: { position: "relative", paddingTop: 22 },
  // Pro stands a little forward of the other two; stacked on a phone they line up.
  forward: { transform: { default: "translateY(-14px)", "@media (max-width: 960px)": "none" } },
  bar: {
    width: 2,
    height: 16,
    borderRadius: 1,
    backgroundColor: "#f4f1ea",
    transform: "scaleY(0.55)",
    animationName: { default: voice, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDirection: "alternate",
    animationIterationCount: "infinite",
    animationTimingFunction: "ease-in-out",
    willChange: "transform",
  },
  section: {
    paddingBlock: { default: 120, "@media (max-width: 900px)": 72 },
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
    overflow: "hidden",
  },
  words: { textAlign: "center", maxWidth: 560, marginInline: "auto" },
  title: {
    fontFamily: SERIF,
    fontSize: "clamp(36px, 4vw, 52px)",
    fontWeight: 400,
    lineHeight: 1.04,
    letterSpacing: "-0.01em",
    margin: 0,
  },
  receipts: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 310px))",
      "@media (max-width: 960px)": "minmax(0, 330px)",
    },
    justifyContent: "center",
    gap: { default: 28, "@media (max-width: 960px)": 32 },
    marginTop: 56,
  },
  after: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 6,
    marginTop: 48,
  },
});

type Row = { label: string; value: string };

const PLANS: {
  name: string;
  action: string;
  href: string;
  rows: Row[];
  total: string;
  amount: string;
  featured?: boolean;
}[] = [
  {
    name: "Free",
    action: "Download",
    href: "/download",
    rows: [
      { label: "Recordings", value: "unlimited" },
      { label: "Usage", value: "on your key" },
      { label: "Free credits", value: "50 to start" },
      { label: "Support", value: "community" },
    ],
    total: "Forever",
    amount: "$0",
  },
  {
    name: "Pro",
    action: "Buy",
    href: BUY_URL,
    rows: [
      { label: "API key", value: "not needed" },
      { label: "Usage", value: "400 credits a month" },
      { label: "Backups", value: "encrypted" },
      { label: "Support", value: "priority" },
    ],
    total: "Per month",
    amount: "$8",
    featured: true,
  },
  {
    name: "Enterprise",
    action: "Contact",
    href: "mailto:business@ivibe.tech",
    rows: [
      { label: "Models", value: "open source" },
      { label: "Runs on", value: "your servers" },
      { label: "Or", value: "hosted by us" },
      { label: "Support", value: "dedicated" },
    ],
    total: "Price",
    amount: "Let's talk",
  },
];

/** How much of the paper has come out, and when: the rows stop-start, the total comes last. */
const FEED = [
  { at: 0, to: 0.28 },
  { at: 380, to: 0.4 },
  { at: 720, to: 0.52 },
  { at: 1060, to: 0.64 },
  { at: 1400, to: 1 },
];
const FEED_MS = 340;
const PRINT_MS = FEED[FEED.length - 1]!.at + FEED_MS;
/** Each receipt starts a beat after the one before. */
const STAGGER_MS = 280;

function fedAt(t: number) {
  let fed = 0;
  let from = 0;
  for (const step of FEED) {
    fed += (step.to - from) * glide(t, step.at, FEED_MS);
    from = step.to;
  }
  return fed;
}

/** The paper down to `fed`, with a torn edge; the top stays straight behind the slot. */
function tornAt(fed: number) {
  const bottom = (fed * 100).toFixed(2);
  const points = ["0 0", "100% 0"];
  for (let tooth = TEETH; tooth >= 0; tooth--) {
    const x = ((tooth / TEETH) * 100).toFixed(2);
    points.push(tooth % 2 ? `${x}% calc(${bottom}% - ${TOOTH_DEPTH}px)` : `${x}% ${bottom}%`);
  }
  return `polygon(${points.join(", ")})`;
}

/** Milliseconds since the receipts came into view, stopping once they've finished printing. */
function usePrint() {
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? Infinity : -1,
  );
  const waiting = t === -1;
  useEffect(() => {
    const element = box.current;
    if (!element || !waiting) return;
    let raf = 0;
    const watch = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        watch.disconnect();
        const end = PRINT_MS + STAGGER_MS * (PLANS.length - 1);
        const start = performance.now();
        const tick = (now: number) => {
          const elapsed = Math.max(0, now - start);
          setT(Math.min(elapsed, end));
          if (elapsed < end) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.35 },
    );
    watch.observe(element);
    return () => {
      watch.disconnect();
      cancelAnimationFrame(raf);
    };
    // Only the first view prints; `waiting` going false must not cancel the run in progress.
  }, []);
  return { box, t };
}

function Receipt({
  name,
  action,
  href,
  rows,
  total,
  amount,
  featured,
  t,
}: (typeof PLANS)[number] & { t: number }) {
  const fed = t === Infinity ? 1 : fedAt(t);
  return (
    <article {...stylex.props(styles.plan, featured && styles.forward)}>
      {/* The pill the paper comes out of: the plan, and what to do about it. */}
      <div
        style={{
          position: "absolute",
          zIndex: 1,
          top: 0,
          left: 0,
          right: 0,
          height: 44,
          borderRadius: 17,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingInline: "18px 6px",
          color: "#f4f1ea",
          fontSize: 14,
          fontWeight: 500,
          background: "#0f0e0d",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.26), 0 2px 6px rgba(0, 0, 0, 0.18)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0, font: "inherit", color: "inherit" }}>{name}</h3>
          {featured && <Awake />}
        </span>
        <Theme theme={ivibeTheme} mode="dark">
          <Button label={action} variant="primary" size="sm" href={href} />
        </Theme>
      </div>
      <div
        style={{
          position: "relative",
          filter: "drop-shadow(0 12px 16px rgba(0, 0, 0, 0.2))",
          marginInline: 12,
        }}
      >
        <div
          style={{
            background: PAPER,
            color: INK,
            clipPath: fed > 0 ? tornAt(fed) : "inset(0 0 100% 0)",
            fontFamily: MONO,
            fontSize: 12.5,
            padding: "42px 20px 24px",
          }}
        >
          {rows.map((row) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 30,
                whiteSpace: "nowrap",
              }}
            >
              <span>{row.label}</span>
              <span
                style={{
                  flex: 1,
                  height: 2,
                  marginTop: 5,
                  backgroundImage: `radial-gradient(circle, ${FAINT} 0.7px, transparent 0.9px)`,
                  backgroundSize: "5px 2px",
                }}
              />
              <span>{row.value}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px dashed ${FAINT}`, margin: "12px 0 8px" }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: 600,
            }}
          >
            <span>{total}</span>
            <span
              style={{
                fontFamily: SERIF,
                fontSize: 38,
                fontWeight: 400,
                lineHeight: 1.15,
                letterSpacing: "-0.01em",
              }}
            >
              {amount}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Pro's pill is the only one awake: the same voice bars the app shows while it listens. */
const BARS = [980, 720, 1140, 640, 860, 1040, 700];

export function Awake() {
  return (
    <span aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {BARS.map((ms, index) => (
        <span
          key={index}
          {...stylex.props(styles.bar)}
          style={{ animationDuration: `${ms}ms`, animationDelay: `${-index * 230}ms` }}
        />
      ))}
    </span>
  );
}

/** What Buy came back with, when it didn't end in a purchase. */
const NOTICES: Record<string, string> = {
  failed: "The payment didn't go through. You weren't charged.",
  cancelled: "Sign-in didn't finish. You weren't charged.",
};

function useBuyNotice() {
  const [notice] = useState(
    () => NOTICES[new URLSearchParams(window.location.search).get("buy") ?? ""],
  );
  useEffect(() => {
    // Said once: a reload or a shared link shouldn't say it again.
    if (notice) window.history.replaceState(null, "", `/${window.location.hash}`);
  }, [notice]);
  return notice;
}

/** Who's signed in, asked only as the plans come near, since most visitors never buy. */
function useAccountNear(box: RefObject<HTMLDivElement | null>) {
  const [account, setAccount] = useState<WebAccount | null>(null);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const watch = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        watch.disconnect();
        void fetchAccount().then(setAccount);
      },
      { rootMargin: "800px" },
    );
    watch.observe(element);
    return () => watch.disconnect();
  }, [box]);
  return { account, setAccount };
}

export function Pricing() {
  const { box, t } = usePrint();
  const notice = useBuyNotice();
  const { account, setAccount } = useAccountNear(box);
  const pro = account?.signedIn === true && account.pro;
  return (
    <section id="pricing" {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.words)}>
        <VStack gap={4}>
          <Heading level={2} xstyle={styles.title}>
            Pick how you run it.
          </Heading>
          <Text size="lg" color="secondary">
            {notice ?? "Same app, every plan."}
          </Text>
        </VStack>
      </div>
      <div ref={box} {...stylex.props(styles.receipts)}>
        {PLANS.map((plan, index) => (
          <Receipt
            key={plan.name}
            {...plan}
            action={plan.featured && pro ? "Manage" : plan.action}
            t={t - index * STAGGER_MS}
          />
        ))}
      </div>
      <div {...stylex.props(styles.after)}>
        <Text color="secondary">
          Free credits need a Google or GitHub sign-in. Pro credits reset monthly.
        </Text>
        <Text size="sm" color="secondary">
          By buying you agree to the <Link href="/terms">Terms</Link> and{" "}
          <Link href="/refunds">Refunds</Link>.
        </Text>
        {account?.signedIn && (
          <Text size="sm" color="secondary">
            {account.login
              ? `Signed in as ${account.login.includes("@") ? "" : "@"}${account.login} · `
              : ""}
            <Link
              onClick={() => {
                void signOutOfWeb().then((done) => {
                  if (done) setAccount({ signedIn: false });
                });
              }}
            >
              Sign out
            </Link>
          </Text>
        )}
      </div>
    </section>
  );
}
