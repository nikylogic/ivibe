// SPDX-License-Identifier: AGPL-3.0-only

import { toOcrLines } from "@ivibe/ocr";
import { describe, expect, it } from "vitest";
import { assertRedacted, redact } from "./redacted-frame.ts";
import type { Painter, ScannedFrame } from "./redacted-frame.ts";
import { isHighEntropyToken, shannonEntropy } from "./rules.ts";
import { scanFrame } from "./scan.ts";

// Fake secrets are assembled at run time so secret scanners don't flag this file.
const join = (...parts: string[]) => parts.join("");
const RANDOM = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";

const size = { width: 1920, height: 1080 };

function linesOf(...texts: string[]) {
  return toOcrLines(
    "f0003",
    texts.map((text, i) => ({
      text,
      bbox: { x: 100, y: 40 + i * 30, width: text.length * 10, height: 20 },
      conf: 0.99,
    })),
  );
}

function rulesFor(...texts: string[]) {
  return scanFrame(linesOf(...texts), size).boxes.map((b) => b.rule);
}

describe("provider tokens", () => {
  it.each([
    ["meta-key", join("LLM_", RANDOM)],
    ["anthropic-key", join("sk-ant-api03-", RANDOM)],
    ["openai-key", join("sk-proj-", RANDOM)],
    ["aws-key", join("AKIA", "IOSFODNN7EXAMPLE")],
    ["github-token", join("ghp_", RANDOM)],
    ["github-token", join("github_pat_", RANDOM, "_", RANDOM)],
    ["google-key", join("AIza", RANDOM)],
    ["stripe-key", join("sk_", "live_", RANDOM)],
    ["slack-token", join("xoxb-", "1234567890-abcdefghij")],
    ["jwt", join("eyJhbGciOiJIUzI1NiJ9", ".", "eyJzdWIiOiIxMjM0NSJ9", ".", "sig")],
    ["private-key", "-----BEGIN RSA PRIVATE KEY-----"],
  ])("finds a %s", (rule, secret) => {
    expect(rulesFor(`  value: ${secret}`)[0]).toBe(rule);
  });

  it("survives OCR misreads", () => {
    // OCR read l2 as 112 and O5 as 05 in Spike S12.
    expect(rulesFor(join("ghp_", "A1b2C3d4E5f6G7h8I9j0K112M3n405p6Q7r8"))).toEqual([
      "github-token",
    ]);
  });
});

describe("assignments, env lines and connection strings", () => {
  it("redacts only the value of an assignment", () => {
    const report = scanFrame(linesOf(`const password = "hunter2hunter2";`), size);
    expect(report.lines[0]!.text).toBe(`const password = "••••••••••••••";`);
  });

  it("redacts bearer tokens", () => {
    expect(rulesFor("Authorization: Bearer abcdefghijklmnop")).toContain("bearer");
  });

  it("redacts .env lines only when a config file is on screen", () => {
    expect(rulesFor("DATABASE_HOST=db.internal.example")).toEqual([]);
    expect(rulesFor(".env", "DATABASE_HOST=db.internal.example")).toEqual(["env-line"]);
  });

  it("redacts the password in a connection string", () => {
    const report = scanFrame(linesOf("postgres://app:s3cretpass@db:5432/main"), size);
    expect(report.lines[0]!.text).toBe("postgres://app:••••••••••@db:5432/main");
  });
});

describe("high-entropy tokens", () => {
  it("measures entropy", () => {
    expect(shannonEntropy("aaaa")).toBe(0);
    expect(shannonEntropy("abcd")).toBe(2);
  });

  it("flags random tokens with letters and digits", () => {
    expect(isHighEntropyToken("x9Qm2Lr7Vt4Kp8Wz3Hn6Bc1Fd5")).toBe(true);
  });

  it.each([
    ["a git SHA", "3f9a1c2e7b4d8f0a6c5e1b2d3f4a5c6e7b8d9f0a"],
    ["a UUID", "123e4567-e89b-12d3-a456-426614174000"],
    ["an identifier", "handleSaveDraftButtonClickEvent"],
    ["a stack frame", "at saveDraft (src/forms/draft-form.tsx:41:12)"],
    ["prose", "TypeError: Cannot read properties of undefined (reading 'id')"],
  ])("leaves %s readable", (_label, text) => {
    expect(rulesFor(text)).toEqual([]);
  });
});

describe("scanFrame", () => {
  it("blacks out password managers", () => {
    const report = scanFrame(linesOf("Bitwarden", "github.com"), size);
    expect(report.blackout).toBe(true);
    expect(report.boxes[0]!.rect).toEqual({ x: 0, y: 0, ...size });
    expect(report.lines).toEqual([]);
  });

  it("keeps the text length so word boxes stay aligned", () => {
    const secret = join("ghp_", RANDOM);
    const [line] = scanFrame(linesOf(`token ${secret} ok`), size).lines;
    expect(line!.text).toHaveLength(`token ${secret} ok`.length);
    expect(line!.words.map((w) => w.text)).toEqual(["token", "•".repeat(secret.length), "ok"]);
  });

  it("pads boxes and keeps them inside the frame", () => {
    const [box] = scanFrame(linesOf(join("LLM_", RANDOM)), size).boxes;
    expect(box!.rect.x).toBeLessThan(100);
    expect(box!.rect.x).toBeGreaterThanOrEqual(0);
    expect(box!.rect.height).toBeGreaterThan(20);
  });
});

describe("RedactedFrame", () => {
  const image = { width: 10, height: 10 } as ImageBitmap;
  const frame: ScannedFrame = { id: "f0003", tMs: 1200, image };
  const painted = { width: 10, height: 10 } as ImageBitmap;
  const paint: Painter = () => painted;

  it("paints boxes and is accepted by assertRedacted", () => {
    const report = scanFrame(linesOf(join("LLM_", RANDOM)), size);
    const result = redact(frame, report, paint);
    expect(result.image).toBe(painted);
    expect(() => assertRedacted(result)).not.toThrow();
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects a raw frame cast to RedactedFrame", () => {
    expect(() => assertRedacted({ ...frame, boxes: [] })).toThrow("unredacted frame");
  });
});
