// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Cloud, KeyRound, ShieldCheck } from "lucide-react";
import { withClass } from "../shared/shortcut.tsx";
import { ipcMessage } from "./state.ts";
import type { ByokState, CloudState } from "./state.ts";

/**
 * First launch: two equal ways in (D24). iVibe Cloud gives free credits after a GitHub sign-in;
 * the user's own Meta key needs no account at all. Either can be skipped and set up later in
 * Settings.
 */

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "var(--color-background-surface)",
  },
  titleBar: { height: 44, flexShrink: 0 },
  body: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
    paddingInline: 32,
    paddingBottom: 44,
  },
  intro: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    textAlign: "center",
  },
  wordmark: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: 64,
    lineHeight: 1,
    letterSpacing: "-0.01em",
  },
  tagline: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: 28,
    fontStyle: "italic",
    color: "var(--color-text-secondary)",
  },
  choices: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
    width: "100%",
    maxWidth: 760,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border-emphasized)",
    backgroundColor: "var(--color-background-card)",
  },
  cardTitle: { display: "flex", alignItems: "center", gap: 10, fontSize: 17, fontWeight: 600 },
  grow: { flex: 1, display: "flex", flexDirection: "column", gap: 8 },
  privacy: { display: "flex", alignItems: "center", gap: 8 },
  footer: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10 },
});

function CloudChoice({ cloud }: { cloud: CloudState }) {
  const status = cloud.status;
  return (
    <section {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.cardTitle)}>
        <Cloud size={20} strokeWidth={1.75} />
        Start free with iVibe Cloud
      </div>
      <div {...stylex.props(styles.grow)}>
        <Text color="secondary">
          Sign in with GitHub and get {status?.trialCredits ?? 50} free credits: about 10 Fix runs
          or 100 dictations. No API key needed.
        </Text>
        <Text color="secondary" size="sm">
          Your credits start with your first recording. Free-credit runs use Meta's contributor
          model, so Meta may use them to improve its models. Your own key never does.
        </Text>
        {status?.message && <Text size="sm">{status.message}</Text>}
      </div>
      <Button
        label={status?.pending ? "Finish signing in in your browser…" : "Continue with GitHub"}
        variant="primary"
        isLoading={status?.pending}
        onClick={cloud.signIn}
      />
    </section>
  );
}

function KeyChoice({ byok }: { byok: ByokState }) {
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
    <section {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.cardTitle)}>
        <KeyRound size={20} strokeWidth={1.75} />
        Use your own Meta key
      </div>
      <div {...stylex.props(styles.grow)}>
        <Text color="secondary">
          Free forever, no account. Calls go from this device straight to Meta. Get a free key at{" "}
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
      </div>
      <Button
        label="Save key and start"
        variant="secondary"
        isDisabled={!key}
        isLoading={isSaving}
        onClick={() => void save()}
      />
    </section>
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
  return (
    <div {...stylex.props(styles.page)}>
      <div {...withClass("drag-region", styles.titleBar)} />
      <main {...stylex.props(styles.body)}>
        <div {...stylex.props(styles.intro)}>
          <span {...stylex.props(styles.wordmark)}>iVibe</span>
          <span {...stylex.props(styles.tagline)}>Show the bug. Get the fix.</span>
          <Text color="secondary">
            Record your screen and voice; iVibe pastes a fix prompt into the app you were using.
          </Text>
        </div>

        <div {...stylex.props(styles.choices)}>
          <CloudChoice cloud={cloud} />
          <KeyChoice byok={byok} />
        </div>

        <div {...stylex.props(styles.footer)}>
          <div {...stylex.props(styles.privacy)}>
            <ShieldCheck size={16} strokeWidth={1.75} />
            <Text color="secondary" size="sm">
              Keys, tokens and passwords are blurred on this device before anything is sent.
            </Text>
          </div>
          <Button label="Skip for now" variant="ghost" onClick={onSkip} />
        </div>
      </main>
    </div>
  );
}
