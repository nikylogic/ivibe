// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ChevronDown, KeyRound, ShieldCheck } from "lucide-react";
import { Mascot } from "../shared/mascot/mascot.tsx";
import { withClass } from "../shared/shortcut.tsx";
import { VoiceWave } from "../shared/voice-wave.tsx";
import { SignInButtons } from "./sign-in-buttons.tsx";
import { ipcMessage } from "./state.ts";
import type { ByokState, CloudState } from "./state.ts";

/**
 * First launch: the left side shows what iVibe does, the right side is the way in (D24). iVibe
 * Cloud gives free credits after a Google or GitHub sign-in; the user's own Meta key needs no
 * account at all. Either can be skipped and set up later in Settings.
 */

const SERIF = '"Instrument Serif", Georgia, serif';
/** The brand's terracotta, readable on both the light and the dark panel. */
const VOICE = "#c8654c";
const NEXT_EXAMPLE_MS = 5000;
/** The window's smallest heights, where both sides tighten up rather than scroll. */
const SHORT = "@media (max-height: 640px)";

const arrive = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(6px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const styles = stylex.create({
  page: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 420px)",
    height: "100vh",
    backgroundColor: "var(--color-background-surface)",
  },
  titleBar: { position: "absolute", insetInline: 0, top: 0, height: 44, zIndex: 1 },
  stage: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: { default: 24, [SHORT]: 14 },
    minWidth: 0,
    overflowY: "auto",
    paddingBlock: { default: 44, [SHORT]: 24 },
    paddingInline: 48,
    backgroundColor: "var(--color-background-body)",
  },
  stageInner: {
    display: "flex",
    flexDirection: "column",
    gap: { default: 24, [SHORT]: 14 },
    width: "100%",
    maxWidth: 560,
    marginInline: "auto",
  },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  mascot: { width: 72, height: 72, flexShrink: 0 },
  wordmark: { fontFamily: SERIF, fontSize: 40, lineHeight: 1 },
  headline: {
    margin: 0,
    fontFamily: SERIF,
    fontSize: "clamp(40px, 5.2vw, 60px)",
    fontWeight: 400,
    lineHeight: 1.04,
    letterSpacing: "-0.01em",
  },
  demo: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    maxWidth: 560,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border-emphasized)",
    backgroundColor: "var(--color-background-surface)",
  },
  tabs: { display: "flex", gap: 4 },
  tab: {
    paddingBlock: 5,
    paddingInline: 12,
    borderWidth: 0,
    borderRadius: 999,
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    color: "var(--color-text-secondary)",
    backgroundColor: { default: "transparent", ":hover": "var(--color-background-muted)" },
    transitionProperty: "background-color, color",
    transitionDuration: "var(--motion-micro)",
  },
  tabOn: {
    color: "var(--color-on-accent)",
    backgroundColor: { default: "var(--color-accent)", ":hover": "var(--color-accent)" },
  },
  example: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    animationName: arrive,
    animationDuration: "var(--motion-layout)",
    animationTimingFunction: "var(--motion-ease)",
  },
  label: { fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" },
  said: { display: "flex", flexDirection: "column", gap: 4, minHeight: 78 },
  quote: { fontFamily: SERIF, fontStyle: "italic", fontSize: 23, lineHeight: 1.2 },
  flow: { display: "flex", alignItems: "center", gap: 10 },
  flowLine: { flex: 1, height: 1, backgroundColor: "var(--color-border-emphasized)" },
  result: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minHeight: 84,
    padding: 14,
    borderRadius: 12,
    color: "var(--color-on-accent)",
    backgroundColor: "var(--color-accent)",
  },
  resultLabel: { fontSize: 12, opacity: 0.7 },
  resultTitle: { fontSize: 15, fontWeight: 600, lineHeight: 1.3 },
  resultNote: { fontSize: 13, lineHeight: 1.35, opacity: 0.75 },
  panel: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: { default: 18, [SHORT]: 12 },
    minWidth: 0,
    overflowY: "auto",
    paddingBlock: { default: 44, [SHORT]: 28 },
    paddingInline: 36,
  },
  panelTitle: { margin: 0, fontFamily: SERIF, fontSize: 38, fontWeight: 400, lineHeight: 1.05 },
  intro: { display: "flex", flexDirection: "column", gap: 6 },
  divider: { display: "flex", alignItems: "center", gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: "var(--color-border-emphasized)" },
  keyToggle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: 0,
    borderWidth: 0,
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 500,
    textAlign: "left",
    cursor: "pointer",
    color: "var(--color-text-primary)",
    backgroundColor: "transparent",
  },
  grow: { flex: 1 },
  chevron: { transitionProperty: "transform", transitionDuration: "var(--motion-small)" },
  chevronOpen: { transform: "rotate(180deg)" },
  keyBlock: { display: "flex", flexDirection: "column", gap: 10 },
  footer: { display: "flex", alignItems: "flex-start", gap: 8 },
  privacyIcon: { flexShrink: 0, marginTop: 2 },
  skip: { alignSelf: "center" },
});

/** The same three examples as the website's demo. */
const EXAMPLES = [
  {
    mode: "Fix",
    said: "“I change my bio and hit Save, and nothing happens.”",
    title: "Save on Edit profile does nothing",
    note: "The report, plus marked-up screenshots as proof.",
  },
  {
    mode: "Prompt",
    said: "“Uh, so I want, like, a dark mode toggle.”",
    title: "Add a dark mode toggle",
    note: "A goal, requirements and a clear “done when”.",
  },
  {
    mode: "Dictate",
    said: "“Um, the demo is, uh, the demo is ready for tomorrow.”",
    title: "The demo is ready for tomorrow.",
    note: "What you meant to say, in any app.",
  },
];

function Demo() {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState(false);

  // It moves on by itself until someone picks a mode, and never under reduced motion.
  useEffect(() => {
    if (chosen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % EXAMPLES.length),
      NEXT_EXAMPLE_MS,
    );
    return () => clearInterval(timer);
  }, [chosen]);

  const example = EXAMPLES[index]!;
  return (
    <section {...stylex.props(styles.demo)} aria-label="What iVibe does">
      <div {...stylex.props(styles.tabs)}>
        {EXAMPLES.map((item, itemIndex) => (
          <button
            key={item.mode}
            type="button"
            aria-pressed={itemIndex === index}
            onClick={() => {
              setChosen(true);
              setIndex(itemIndex);
            }}
            {...stylex.props(styles.tab, itemIndex === index && styles.tabOn)}
          >
            {item.mode}
          </button>
        ))}
      </div>
      <div key={example.mode} {...stylex.props(styles.example)}>
        <div {...stylex.props(styles.said)}>
          <span {...stylex.props(styles.label)}>You say</span>
          <span {...stylex.props(styles.quote)}>{example.said}</span>
        </div>
        <div {...stylex.props(styles.flow)} aria-hidden="true">
          <VoiceWave level={0.55} color={VOICE} bars={17} height={24} />
          <span {...stylex.props(styles.flowLine)} />
        </div>
        <div {...stylex.props(styles.result)}>
          <span {...stylex.props(styles.resultLabel)}>iVibe pastes</span>
          <span {...stylex.props(styles.resultTitle)}>{example.title}</span>
          <span {...stylex.props(styles.resultNote)}>{example.note}</span>
        </div>
      </div>
    </section>
  );
}

function KeyChoice({ byok }: { byok: ByokState }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await byok.save(key);
    } catch (err) {
      setError(ipcMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div {...stylex.props(styles.keyBlock)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        {...stylex.props(styles.keyToggle)}
      >
        <KeyRound size={18} strokeWidth={1.75} />
        <span {...stylex.props(styles.grow)}>Use your own Meta key</span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          {...stylex.props(styles.chevron, open && styles.chevronOpen)}
        />
      </button>
      <Text color="secondary" size="sm">
        Free forever, with no account. Calls go from this device straight to Meta.
      </Text>
      {open && (
        <>
          <Text color="secondary" size="sm">
            Get a free key at{" "}
            <Link href="https://dev.meta.ai" target="_blank">
              dev.meta.ai
            </Link>
          </Text>
          <TextInput
            type="password"
            label="Meta Model API key"
            placeholder="LLM_…"
            value={key}
            onChange={setKey}
            onEnter={() => void save()}
            status={error ? { type: "error", message: error } : undefined}
            width="100%"
          />
          <Button
            label="Save key and start"
            variant="secondary"
            isDisabled={!key}
            isLoading={isSaving}
            onClick={() => void save()}
          />
        </>
      )}
    </div>
  );
}

export function WelcomePage({
  cloud,
  byok,
  onSkip,
}: {
  cloud: CloudState;
  byok: ByokState;
  onSkip: () => void;
}) {
  const status = cloud.status;
  return (
    <div {...stylex.props(styles.page)}>
      <div {...withClass("drag-region", styles.titleBar)} />

      <main {...stylex.props(styles.stage)}>
        <div {...stylex.props(styles.stageInner)}>
          <div {...stylex.props(styles.brand)}>
            <span {...stylex.props(styles.mascot)}>
              <Mascot size={72} />
            </span>
            <span {...stylex.props(styles.wordmark)}>iVibe</span>
          </div>
          <h1 {...stylex.props(styles.headline)}>
            Show the problem.
            <br />
            <i>Say what’s wrong.</i>
          </h1>
          <Demo />
        </div>
      </main>

      <aside {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.intro)}>
          <h2 {...stylex.props(styles.panelTitle)}>Start free</h2>
          <Text color="secondary">
            {status?.trialCredits ?? 50} free credits: about 10 Fix runs or 100 dictations. No API
            key needed.
          </Text>
        </div>

        <SignInButtons cloud={cloud} layout="stack" />
        {status?.message && <Text size="sm">{status.message}</Text>}

        <Text color="secondary" size="sm">
          Your credits start with your first recording. Free-credit runs use Meta’s contributor
          model, so Meta may use them to improve its models. Your own key never does.
        </Text>

        <div {...stylex.props(styles.divider)}>
          <span {...stylex.props(styles.rule)} />
          <Text color="secondary" size="sm">
            or
          </Text>
          <span {...stylex.props(styles.rule)} />
        </div>

        <KeyChoice byok={byok} />

        <div {...stylex.props(styles.footer)}>
          <ShieldCheck size={16} strokeWidth={1.75} {...stylex.props(styles.privacyIcon)} />
          <Text color="secondary" size="sm">
            Keys, tokens and passwords are hidden on this device before anything is sent.
          </Text>
        </div>
        <div {...stylex.props(styles.skip)}>
          <Button label="Skip for now" variant="ghost" onClick={onSkip} />
        </div>
      </aside>
    </div>
  );
}
