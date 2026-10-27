// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { classifyTarget } from "../targets.ts";
import { CORE_RULES } from "./core.ts";
import { destinationGuide, destinationStyle } from "./destinations.ts";
import { EMPTY_PERSONAL, normalizePersonal, personalLayer } from "./personal.ts";
import { systemPrompt, transcriptBlock } from "./stack.ts";
import { promptTask } from "./tasks.ts";

describe("destinationStyle", () => {
  it.each([
    ["WindowsTerminal", "claude", "terminal-agent"],
    ["Cursor", "app.tsx", "editor"],
    ["chrome", "ChatGPT", "ai-chat"],
    ["slack", "general", "messaging"],
    ["chrome", "Inbox (3) - me@example.com - Gmail", "email"],
    ["chrome", "WEB-42 Save fails - Jira", "tracker"],
    ["notepad", "notes.txt", "plain"],
  ])("%s / %s → %s", (process, title, style) => {
    expect(destinationStyle(classifyTarget(process, title))).toBe(style);
  });

  it("gives dictation formatting hints only, and none for plain apps", () => {
    expect(destinationGuide(classifyTarget("slack", "general"), "dictation")).toContain("casual");
    expect(destinationGuide(classifyTarget("notepad", "x"), "dictation")).toBe("");
  });
});

describe("normalizePersonal", () => {
  it("trims, de-duplicates and caps what it is given", () => {
    const personal = normalizePersonal({
      name: "  Nikhil  ",
      dictationLanguage: "english",
      dictionary: ["iVibe", "iVibe", " Muse Spark ", "", 7],
      instructions: "x".repeat(900),
    });
    expect(personal.name).toBe("Nikhil");
    expect(personal.dictationLanguage).toBe("english");
    expect(personal.dictionary).toEqual(["iVibe", "Muse Spark"]);
    expect(personal.instructions).toHaveLength(500);
  });

  it("falls back to empty settings for garbage", () => {
    expect(normalizePersonal(null)).toEqual(EMPTY_PERSONAL);
    expect(personalLayer(EMPTY_PERSONAL)).toBe("");
  });
});

describe("systemPrompt", () => {
  it("puts the core rules first, then the task, destination and the user", () => {
    const prompt = systemPrompt(
      promptTask("Claude Code"),
      {
        target: classifyTarget("WindowsTerminal", "claude"),
        personal: { ...EMPTY_PERSONAL, dictionary: ["Supabase"] },
      },
      "agent",
    );
    expect(prompt.startsWith(CORE_RULES)).toBe(true);
    const order = ["Task:", "Destination:", "About the user:"].map((part) => prompt.indexOf(part));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(prompt).toContain("Supabase");
  });
});

describe("transcriptBlock", () => {
  it("marks the transcript up as data", () => {
    expect(transcriptBlock([{ startMs: 3200, text: "Save does nothing" }])).toBe(
      "<transcript>\n[0:03] Save does nothing\n</transcript>",
    );
  });
});
