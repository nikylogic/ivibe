// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { classifyTarget, imageDelivery } from "./targets.ts";

describe("classifyTarget", () => {
  it.each([
    ["WindowsTerminal", "✳ Claude Code", "terminal-agent", "Claude Code"],
    ["iTerm2", "claude — ~/app", "terminal-agent", "Claude Code"],
    ["pwsh", "codex", "terminal-agent", "Codex"],
    ["gnome-terminal-server", "~/projects", "terminal", "the terminal"],
    ["C:\\Program Files\\cursor\\Cursor.exe", "app.tsx — shop", "editor", "Cursor"],
    ["Code", "index.ts - api - Visual Studio Code", "editor", "VS Code"],
    ["Zed", "Meta AI Hackathon - .env.example", "editor", "Zed"],
    ["idea64", "shop – Main.java", "editor", "JetBrains IDE"],
    ["Claude", "Claude", "chat", "Claude"],
    ["chrome", "ChatGPT - Google Chrome", "chat", "ChatGPT"],
    ["msedge", "Lovable - Build apps", "chat", "Lovable"],
    ["firefox", "MDN Web Docs", "browser", "the browser"],
    ["Slack", "general", "other", "Slack"],
  ])("%s / %s → %s", (process, title, kind, name) => {
    expect(classifyTarget(process, title)).toMatchObject({ kind, name });
  });

  it("pastes images where they are accepted and sends file paths elsewhere", () => {
    expect(imageDelivery(classifyTarget("WindowsTerminal", "claude"))).toBe("paste");
    expect(imageDelivery(classifyTarget("WindowsTerminal", "codex"))).toBe("paths");
    expect(imageDelivery(classifyTarget("Cursor", "x"))).toBe("paste");
    expect(imageDelivery(classifyTarget("Slack", "x"))).toBe("paths");
  });
});
