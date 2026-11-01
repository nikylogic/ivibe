// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { fetchAccount, OPEN_APP_URL } from "./account.ts";
import { Footer } from "./finale.tsx";
import { TopBar } from "./home.tsx";
import { Nav } from "./nav.tsx";
import { ivibeTheme } from "./theme.ts";

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-primary)",
  },
  main: {
    minHeight: "78vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    paddingTop: 120,
    paddingBottom: 72,
    paddingInline: 24,
  },
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontWeight: 400,
    fontSize: "clamp(36px, 5vw, 48px)",
    lineHeight: 1.05,
    letterSpacing: "-0.01em",
    margin: 0,
  },
});

/** Dodo tells the server by webhook a moment after the payment, so give it about a minute. */
const POLL_MS = 2000;
const POLL_TRIES = 30;

type Stage =
  | { name: "confirming" }
  | { name: "pro"; login: string | null }
  | { name: "late" }
  | { name: "unknown" };

function wordsFor(stage: Stage): { title: string; line: string } {
  switch (stage.name) {
    case "confirming":
      return { title: "Confirming your payment", line: "This takes a few seconds." };
    case "pro":
      return {
        title: "You're on Pro.",
        line: stage.login
          ? `Sign in to the app as @${stage.login}.`
          : "Sign in to the app with the same GitHub account.",
      };
    case "late":
      return { title: "Still confirming", line: "Open iVibe in a minute. Pro will be there." };
    case "unknown":
      return {
        title: "Thanks for choosing Pro",
        line: "Sign in to the app with the GitHub account you bought with.",
      };
  }
}

/** /welcome: where Dodo sends a website buyer. It says Pro only once the server has seen the payment. */
export function WelcomePage({
  mode,
  onModeChange,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  const [stage, setStage] = useState<Stage>({ name: "confirming" });

  useEffect(() => {
    document.title = "Welcome to Pro · iVibe";
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async (tries: number) => {
      const account = await fetchAccount();
      if (stopped) return;
      if (account?.signedIn === false) return setStage({ name: "unknown" });
      if (account?.pro) return setStage({ name: "pro", login: account.login });
      if (tries <= 1) return setStage({ name: "late" });
      timer = setTimeout(() => void check(tries - 1), POLL_MS);
    };
    void check(POLL_TRIES);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  const words = wordsFor(stage);

  return (
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode={mode}>
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <Nav page="legal" />
      <main {...stylex.props(styles.main)}>
        <VStack gap={5} hAlign="center">
          <Mascot size={120} state={stage.name === "pro" ? "done" : "idle"} />
          <VStack gap={2} hAlign="center">
            <Heading level={1} xstyle={styles.title}>
              {words.title}
            </Heading>
            <Text color="secondary">{words.line}</Text>
          </VStack>
          {stage.name !== "confirming" && (
            <VStack gap={4} hAlign="center">
              <HStack gap={2} hAlign="center" wrap="wrap">
                <Button label="Open iVibe" variant="primary" href={OPEN_APP_URL} />
                <Button label="Download" variant="secondary" href="/download" />
              </HStack>
              {stage.name === "late" && (
                <Text size="sm" color="secondary">
                  Not there? Write to{" "}
                  <Link href="mailto:business@ivibe.tech" size="sm">
                    business@ivibe.tech
                  </Link>
                </Text>
              )}
            </VStack>
          )}
        </VStack>
      </main>
      <Footer mode={mode} onModeChange={onModeChange} />
    </div>
  );
}
