// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Where the result goes (docs/architecture.md D20): the app that had focus when recording
 * started, classified from its process name and window title.
 */

export type TargetKind =
  /** A coding agent in a terminal (Claude Code, Codex, Gemini CLI). */
  | "terminal-agent"
  | "terminal"
  /** Editors with AI chat (Cursor, VS Code, Windsurf, Zed, JetBrains). */
  | "editor"
  /** Chat apps and AI builders, desktop or in a browser: images are pasted. */
  | "chat"
  | "browser"
  | "other";

export interface TargetApp {
  kind: TargetKind;
  /** A friendly name for the pill and the prompt ("Claude Code", "Cursor", "ChatGPT"). */
  name: string;
  process: string;
  title: string;
}

const TERMINALS =
  /^(windowsterminal|wt|openconsole|conhost|powershell|pwsh|cmd|bash|mintty|wezterm(-gui)?|alacritty|kitty|ghostty|warp|hyper|tabby|iterm2?|terminal|gnome-terminal(-server)?|konsole|xterm|tilix|terminator|foot)$/i;
const BROWSERS = /^(chrome|msedge|firefox|brave|arc|opera|vivaldi|safari|chromium|zen)$/i;

const AGENTS_IN_TITLE: [RegExp, string][] = [
  [/claude/i, "Claude Code"],
  [/\bcodex\b/i, "Codex"],
  [/\bgemini\b/i, "Gemini CLI"],
  [/\baider\b/i, "Aider"],
  [/\bopencode\b/i, "opencode"],
  [/\bamp\b/i, "Amp"],
];

const EDITORS: [RegExp, string][] = [
  [/^cursor$/i, "Cursor"],
  [/^windsurf$/i, "Windsurf"],
  [/^code( - insiders)?$|^electron$/i, "VS Code"],
  [/^zed$/i, "Zed"],
  [/^(idea|webstorm|pycharm|goland|rider|clion|phpstorm|rubymine|studio)(64)?$/i, "JetBrains IDE"],
  [/^trae$/i, "Trae"],
  [/^kiro$/i, "Kiro"],
];

const CHAT_APPS: [RegExp, string][] = [
  [/^claude$/i, "Claude"],
  [/^chatgpt$/i, "ChatGPT"],
  [/^codex$/i, "Codex"],
];

const CHAT_SITES: [RegExp, string][] = [
  [/chatgpt/i, "ChatGPT"],
  [/claude/i, "Claude"],
  [/gemini/i, "Gemini"],
  [/meta ai/i, "Meta AI"],
  [/lovable/i, "Lovable"],
  [/bolt/i, "Bolt"],
  [/\bv0\b/i, "v0"],
  [/replit/i, "Replit"],
  [/perplexity/i, "Perplexity"],
];

const match = (pairs: [RegExp, string][], text: string) =>
  pairs.find(([pattern]) => pattern.test(text))?.[1];

/** Strips ".exe" and paths so "C:\…\Cursor.exe" and "Cursor" classify the same. */
const baseName = (process: string) =>
  process
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(exe|app)$/i, "");

export function classifyTarget(rawProcess: string, title: string): TargetApp {
  const process = baseName(rawProcess);
  const base = { process, title };

  if (TERMINALS.test(process)) {
    const agent = match(AGENTS_IN_TITLE, title);
    return agent
      ? { ...base, kind: "terminal-agent", name: agent }
      : { ...base, kind: "terminal", name: "the terminal" };
  }
  const editor = match(EDITORS, process);
  if (editor) return { ...base, kind: "editor", name: editor };
  const chat = match(CHAT_APPS, process);
  if (chat) return { ...base, kind: "chat", name: chat };
  if (BROWSERS.test(process)) {
    const site = match(CHAT_SITES, title);
    return site
      ? { ...base, kind: "chat", name: site }
      : { ...base, kind: "browser", name: "the browser" };
  }
  return { ...base, kind: "other", name: process || "the app" };
}

/**
 * How proof images reach the target: pasted as images (chat apps, editors, and Claude Code, which
 * takes a pasted image as an [Image #N] chip), or referenced as saved files for other terminals
 * and when the result is only copied.
 */
export function imageDelivery(target: TargetApp): "paste" | "paths" {
  if (target.kind === "terminal-agent") return target.name === "Claude Code" ? "paste" : "paths";
  if (target.kind === "chat" || target.kind === "editor" || target.kind === "browser")
    return "paste";
  return "paths";
}
