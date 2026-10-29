// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { maskSecrets, restoreSecrets } from "./text.ts";

describe("maskSecrets", () => {
  it("leaves ordinary text alone", () => {
    expect(maskSecrets("Please make this more formal.")).toEqual({
      text: "Please make this more formal.",
      secrets: [],
    });
  });

  it("hides each secret behind a numbered placeholder and puts it back", () => {
    const key = "sk-proj-abcdefghijklmnopqrstuvwx1234";
    const source = `const client = new OpenAI({ apiKey: "${key}" });\nconst token = "ghp_${"a1B2".repeat(9)}";`;
    const masked = maskSecrets(source);
    expect(masked.text).not.toContain(key);
    expect(masked.text).toContain("[[secret-1]]");
    expect(masked.secrets).toHaveLength(2);
    expect(restoreSecrets(masked.text, masked.secrets)).toBe(source);
  });

  it("keeps a placeholder it can't resolve", () => {
    expect(restoreSecrets("x [[secret-9]]", ["a"])).toBe("x [[secret-9]]");
  });
});
