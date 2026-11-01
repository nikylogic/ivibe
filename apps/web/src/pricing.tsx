// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Cloud, Download, KeyRound } from "lucide-react";
import { glide, MONO } from "./demo/kit.tsx";

/**
 * The price, as the receipt feature 6 ended on: one printed for each way to run iVibe. Each prints
 * once when it comes into view and then stays still, so the numbers are easy to read. With reduced
 * motion both are simply there.
 */

const PAPER = "#f6f2e8";
const INK = "#2a2622";
const FAINT = "#6f675c";
const SERIF = '"Instrument Serif", Georgia, serif';
const TEETH = 28;
const TOOTH_DEPTH = 5;

const styles = stylex.create({
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
      default: "repeat(2, minmax(0, 330px))",
      "@media (max-width: 760px)": "minmax(0, 330px)",
    },
    justifyContent: "center",
    gap: { default: 40, "@media (max-width: 760px)": 32 },
    marginTop: 56,
  },
  after: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 20,
    marginTop: 48,
  },
});

type Row = { label: string; value: string };

const YOUR_KEY: Row[] = [
  { label: "Recordings", value: "unlimited" },
  { label: "Account", value: "not needed" },
  { label: "Meta usage", value: "billed to your key" },
];

const PRO: Row[] = [
  { label: "API key", value: "not needed" },
  { label: "Meta usage", value: "$4 a month" },
  { label: "Backups", value: "encrypted" },
];

/** How much of the paper has come out, and when: the rows stop-start, the total comes last. */
const FEED = [
  { at: 0, to: 0.24 },
  { at: 420, to: 0.42 },
  { at: 800, to: 0.6 },
  { at: 1180, to: 1 },
];
const FEED_MS = 340;
const PRINT_MS = FEED[FEED.length - 1]!.at + FEED_MS;
/** The second receipt starts a beat after the first. */
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
        const end = PRINT_MS + STAGGER_MS;
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
  icon,
  rows,
  total,
  amount,
  t,
}: {
  name: string;
  icon: ReactNode;
  rows: Row[];
  total: string;
  amount: string;
  t: number;
}) {
  const fed = t === Infinity ? 1 : fedAt(t);
  return (
    <article style={{ position: "relative", paddingTop: 22 }}>
      {/* The pill the paper comes out of. */}
      <div
        style={{
          position: "absolute",
          zIndex: 1,
          top: 0,
          left: 0,
          right: 0,
          height: 44,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          color: "#f4f1ea",
          fontSize: 14,
          fontWeight: 500,
          background: "#0f0e0d",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.26), 0 2px 6px rgba(0, 0, 0, 0.18)",
        }}
      >
        {icon}
        <h3 style={{ margin: 0, font: "inherit", color: "inherit" }}>{name}</h3>
      </div>
      <div style={{ filter: "drop-shadow(0 12px 16px rgba(0, 0, 0, 0.2))", marginInline: 12 }}>
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

export function Pricing() {
  const { box, t } = usePrint();
  return (
    <section id="pricing" {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.words)}>
        <VStack gap={4}>
          <Heading level={2} xstyle={styles.title}>
            Two ways to run it.
          </Heading>
          <Text size="lg" color="secondary">
            Same app. You choose who pays Meta.
          </Text>
        </VStack>
      </div>
      <div ref={box} {...stylex.props(styles.receipts)}>
        <Receipt
          name="Your key"
          icon={<KeyRound size={15} strokeWidth={2} aria-hidden="true" />}
          rows={YOUR_KEY}
          total="Owed to iVibe"
          amount="$0.00"
          t={t}
        />
        <Receipt
          name="iVibe Pro"
          icon={<Cloud size={15} strokeWidth={2} aria-hidden="true" />}
          rows={PRO}
          total="Per month"
          amount="$8.00"
          t={t === Infinity ? t : t - STAGGER_MS}
        />
      </div>
      <div {...stylex.props(styles.after)}>
        <Text color="secondary">
          Pro usage resets each month. Not sure yet? Try it on free credits with GitHub.
        </Text>
        <Button
          label="Download"
          variant="primary"
          icon={<Download size={16} strokeWidth={2} aria-hidden="true" />}
          href="/download"
        />
      </div>
    </section>
  );
}
