// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { fetchAccount, OPEN_APP_URL } from "./account.ts";
import { Stage as Moment } from "./moment.tsx";
import type { MomentWords } from "./moment.tsx";
import { usePageMeta } from "./seo.ts";

/** Dodo tells the server by webhook a moment after the payment, so give it about a minute. */
const POLL_MS = 2000;
const POLL_TRIES = 30;

type Stage =
  | { name: "confirming" }
  | { name: "pro"; login: string | null }
  | { name: "late" }
  | { name: "unknown" };

const NEXT: MomentWords["actions"] = [
  { label: "Open iVibe", href: OPEN_APP_URL },
  { label: "Download", href: "/download" },
];

function wordsFor(stage: Stage): MomentWords {
  switch (stage.name) {
    case "confirming":
      return {
        first: "Confirming your payment",
        second: "this takes a few seconds",
        mascot: "writing",
      };
    case "pro":
      return {
        first: "You’re on Pro",
        second: "now say something",
        line: stage.login
          ? `Sign in to the app as ${stage.login.includes("@") ? "" : "@"}${stage.login}.`
          : "Sign in to the app with the same account.",
        mascot: "done",
        actions: NEXT,
      };
    case "late":
      return {
        first: "Still confirming",
        second: "Pro will be there in a minute",
        line: "Not there after that? Write to business@ivibe.tech.",
        mascot: "writing",
        actions: NEXT,
      };
    case "unknown":
      return {
        first: "Thanks for choosing Pro",
        second: "now say something",
        line: "Sign in to the app with the account you bought with.",
        mascot: "done",
        actions: NEXT,
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
  usePageMeta({
    title: "Welcome to Pro · iVibe",
    description: "Thanks for choosing iVibe Pro.",
    path: "/welcome",
    noindex: true,
  });
  const [stage, setStage] = useState<Stage>({ name: "confirming" });

  useEffect(() => {
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

  return <Moment mode={mode} onModeChange={onModeChange} tone="Prompt" {...wordsFor(stage)} />;
}
