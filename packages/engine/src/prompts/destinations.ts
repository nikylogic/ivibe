// SPDX-License-Identifier: AGPL-3.0-only

import type { TargetApp } from "../targets.ts";

/**
 * Layer 3 of the prompt stack (docs/vibes-and-prompts.md §4.2): how to write for the app the
 * result is pasted into, picked from the app that had focus when recording started.
 */

export type DestinationStyle =
  "terminal-agent" | "editor" | "ai-chat" | "messaging" | "email" | "tracker" | "plain";

const MESSAGING = /slack|teams|discord|whatsapp|telegram|signal|messenger/i;
const EMAIL = /gmail|outlook|thunderbird|superhuman|\bmail\b|proton mail/i;
const TRACKER = /jira|linear|github|gitlab|asana|clickup|notion|trello/i;

/** Messaging, email and trackers are found by process or window title, in the app or a browser. */
export function destinationStyle(target: TargetApp): DestinationStyle {
  if (target.kind === "terminal-agent" || target.kind === "terminal") return "terminal-agent";
  if (target.kind === "editor") return "editor";
  if (target.kind === "chat") return "ai-chat";
  const text = `${target.process} ${target.title}`;
  if (MESSAGING.test(text)) return "messaging";
  if (EMAIL.test(text)) return "email";
  if (TRACKER.test(text)) return "tracker";
  return "plain";
}

/** For results that ask an AI to do something (Fix, Prompt). */
const FOR_AGENTS: Record<DestinationStyle, string> = {
  "terminal-agent":
    "It is pasted into a coding agent in a terminal. Be specific and compact: name the files, functions and commands involved, and end with how to verify the work. No markdown headings or bold.",
  editor:
    "It is pasted into an AI chat inside a code editor. Be specific: name the files and functions involved, and end with how to verify the work. No markdown headings.",
  "ai-chat":
    "It is pasted into an AI chat app. Give enough context for someone who has not seen the screen, in full sentences. Simple markdown lists are fine.",
  messaging:
    "It is pasted into a team chat. Keep it short and conversational, in a few short paragraphs, with no headings.",
  email: "It is pasted into an email. Use short paragraphs and no markdown.",
  tracker:
    "It is pasted into an issue tracker. Put a short title on the first line, then the details in sections.",
  plain: "Use neutral plain text.",
};

/** For dictation, which keeps the user's own words: formatting only, never a new tone. */
const FOR_DICTATION: Record<DestinationStyle, string> = {
  "terminal-agent": "It is typed into a terminal: keep it as plain sentences, without lists.",
  editor: "It is typed into a code editor or its AI chat.",
  "ai-chat": "It is typed into an AI chat.",
  messaging: "It is typed into a team chat: keep it casual and short, as they said it.",
  email: "It is typed into an email: split it into paragraphs where they change topic.",
  tracker: "It is typed into an issue tracker.",
  plain: "",
};

export function destinationGuide(target: TargetApp, purpose: "agent" | "dictation"): string {
  const style = destinationStyle(target);
  const guide = (purpose === "agent" ? FOR_AGENTS : FOR_DICTATION)[style];
  if (!guide) return "";
  const where = target.name === "the clipboard" ? "" : ` The app is ${target.name}.`;
  return `Destination:${where} ${guide}`;
}
