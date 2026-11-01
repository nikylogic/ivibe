// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Collapsible, CollapsibleGroup } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { look } from "./features.tsx";
import { Awake } from "./pricing.tsx";
import { REPO } from "./release.ts";

/**
 * The questions people ask, asked the way iVibe hears them. The first time a question opens, the
 * pill listens to it said out loud, the filler words lift away, and the answer lands. After that,
 * and with reduced motion, the answer is simply there. Every answer stays in the page.
 */

/** In `said`, the words in [brackets] are the fillers that lift away. */
export const QUESTIONS = [
  {
    ask: "Is it free?",
    said: "[um,] is it, [like,] actually free?",
    answer: "Yes, with your own Meta key. Meta bills you for what you use.",
  },
  {
    ask: "Do I need a Meta key?",
    said: "[wait,] do I need a Meta key?",
    answer: "No. Start with 50 free credits, or go Pro.",
  },
  {
    ask: "Why not use built-in dictation?",
    said: "why not just use, [um,] built-in dictation?",
    answer: "It types every word. iVibe cleans them up, writes prompts and proves bugs.",
  },
  {
    ask: "Is it always recording?",
    said: "[so, uh,] is it always recording?",
    answer: "No. Only from when you press the shortcut until you stop.",
  },
  {
    ask: "Where does my data go?",
    said: "[hmm,] where do my recordings go?",
    answer:
      "Secrets are hidden on your device first. With your key, the rest goes straight to Meta. With Pro, it passes through iVibe and isn't kept. On free credits, Meta may use it to improve its models.",
  },
  {
    ask: "Which apps does it work in?",
    said: "[and, like,] which apps does it work in?",
    answer: "Text goes anywhere you can type. Screenshots need an app that accepts images.",
  },
  {
    ask: "Which languages does it understand?",
    said: "[um,] does it get my language?",
    answer: "25. Mix them as you talk, and get the result in the one you want.",
  },
  {
    ask: "Does it work offline?",
    said: "[uh,] does it work offline?",
    answer: "No. It needs the internet to reach Meta's models.",
  },
  {
    ask: "Why the security warning on install?",
    said: "[um,] why the security warning?",
    answer:
      "iVibe isn't code-signed yet, so your computer asks once. On Windows, click More info, then Run anyway.",
  },
  {
    ask: "Can I cancel Pro?",
    said: "[and, um,] can I cancel Pro whenever?",
    answer: "Yes, anytime, from the billing portal.",
  },
];

const HEAR_MS = 480;
const LANDS_MS = 1000;

const styles = stylex.create({
  section: {
    backgroundColor:
      "color-mix(in srgb, var(--color-text-primary) 3%, var(--color-background-surface))",
    paddingBlock: { default: 120, "@media (max-width: 900px)": 72 },
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
  },
  inner: {
    maxWidth: 1040,
    marginInline: "auto",
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 0.7fr) minmax(0, 1.3fr)",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    columnGap: 72,
    rowGap: 32,
    alignItems: "start",
  },
  words: {
    position: { default: "sticky", "@media (max-width: 900px)": "static" },
    top: 96,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: "clamp(36px, 4vw, 52px)",
    fontWeight: 400,
    lineHeight: 1.04,
    letterSpacing: "-0.01em",
    margin: 0,
  },
  // Rows that open and close smoothly, however tall their content is.
  fold: {
    display: "grid",
    transitionProperty: "grid-template-rows, opacity",
    transitionDuration: "320ms",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
  foldOpen: { gridTemplateRows: "1fr", opacity: 1 },
  foldShut: { gridTemplateRows: "0fr", opacity: 0 },
  foldInner: { minHeight: 0, overflow: "hidden" },
  heard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingBottom: 4,
  },
  // The small pill, listening.
  pill: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    height: 24,
    paddingInline: 9,
    borderRadius: 9,
    backgroundColor: "#0f0e0d",
  },
  said: {
    fontSize: 15,
    fontStyle: "italic",
    color: "var(--color-text-secondary)",
  },
  word: { display: "inline-block", whiteSpace: "pre" },
  filler: {
    maxWidth: "6em",
    transitionProperty: "max-width, opacity, transform",
    transitionDuration: "380ms",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    overflow: "hidden",
    verticalAlign: "bottom",
  },
  lifted: { maxWidth: 0, opacity: 0, transform: "translateY(-10px)" },
});

/** One question's words: `[fillers]` and the rest, each ending in its own space. */
function wordsOf(said: string) {
  return [...said.matchAll(/\[([^\]]+)\]\s*|([^[\s]+)\s*/g)].flatMap((match) =>
    match[1]
      ? match[1].split(" ").map((text) => ({ text: `${text} `, filler: true }))
      : [{ text: `${match[2]} `, filler: false }],
  );
}

function Answer({ said, answer, open }: { said: string; answer: string; open: boolean }) {
  const [phase, setPhase] = useState<"waiting" | "hearing" | "cleaning" | "landed">(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "landed" : "waiting",
  );
  const played = useRef(phase === "landed");
  useEffect(() => {
    if (!open || played.current) return;
    played.current = true;
    setPhase("hearing");
    const clean = window.setTimeout(() => setPhase("cleaning"), HEAR_MS);
    const land = window.setTimeout(() => setPhase("landed"), LANDS_MS);
    return () => {
      window.clearTimeout(clean);
      window.clearTimeout(land);
      setPhase("landed");
    };
  }, [open]);
  const landed = phase === "landed";
  return (
    <>
      <div
        aria-hidden="true"
        {...stylex.props(styles.fold, landed ? styles.foldShut : styles.foldOpen)}
      >
        <div {...stylex.props(styles.foldInner)}>
          <div {...stylex.props(styles.heard)}>
            <span {...stylex.props(styles.pill)}>
              <Awake />
            </span>
            <span {...stylex.props(styles.said)}>
              {wordsOf(said).map((word, index) => (
                <span
                  key={index}
                  {...stylex.props(
                    styles.word,
                    word.filler && styles.filler,
                    word.filler && (phase === "cleaning" || landed) && styles.lifted,
                  )}
                >
                  {word.text}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
      <div {...stylex.props(styles.fold, landed ? styles.foldOpen : styles.foldShut)}>
        <div {...stylex.props(styles.foldInner)}>
          <Text color="secondary">{answer}</Text>
        </div>
      </div>
    </>
  );
}

export function Faq() {
  const [opened, setOpened] = useState("");
  return (
    <section id="faq" {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.inner)}>
        <div {...stylex.props(styles.words)}>
          <Heading level={2} xstyle={styles.title}>
            Just ask.
          </Heading>
          <Text color="secondary">
            Still stuck? <Link href={`https://github.com/${REPO}/issues`}>Ask on GitHub</Link>.
          </Text>
        </div>
        <CollapsibleGroup
          type="single"
          hasDividers
          density="spacious"
          value={opened}
          onChange={(value) => setOpened(typeof value === "string" ? value : "")}
        >
          {QUESTIONS.map((question) => (
            <Collapsible
              key={question.ask}
              value={question.ask}
              trigger={
                <span
                  onPointerEnter={(event) => look(event.currentTarget)}
                  onPointerLeave={() => look(null)}
                >
                  {question.ask}
                </span>
              }
            >
              <Answer
                said={question.said}
                answer={question.answer}
                open={opened === question.ask}
              />
            </Collapsible>
          ))}
        </CollapsibleGroup>
      </div>
    </section>
  );
}
