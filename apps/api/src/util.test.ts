// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sparkCost } from "./meter.ts";
import { networkOf, pkceChallenge, toCredits } from "./util.ts";

const price = {
  sparkInput: 1.25,
  sparkCached: 0.15,
  sparkOutput: 4.25,
  trialInput: 0.1,
  trialOutput: 0.2,
  samImage: 2500,
  asrSecond: 50,
};

describe("networkOf", () => {
  it("keeps an IPv4 address whole", () => {
    expect(networkOf("49.36.10.200")).toBe("49.36.10.200");
  });

  it("groups IPv6 by its /64", () => {
    expect(networkOf("2409:40c0:1013:abcd:1:2:3:4")).toBe("2409:40c0:1013:abcd::/64");
    expect(networkOf("2409:40C0:1013:ABCD::9")).toBe("2409:40c0:1013:abcd::/64");
    expect(networkOf("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });
});

describe("sparkCost", () => {
  it("prices tokens in micro-dollars, cached input at the lower rate", () => {
    // 10k input (4k cached) and 2k output: 6000×1.25 + 4000×0.15 + 2000×4.25
    expect(
      sparkCost(
        {
          input_tokens: 10_000,
          output_tokens: 2000,
          input_tokens_details: { cached_tokens: 4000 },
        },
        price,
      ),
    ).toBe(7500 + 600 + 8500);
  });

  it("prices free-trial runs at the contributor rate", () => {
    expect(sparkCost({ input_tokens: 10_000, output_tokens: 2000 }, price, true)).toBe(1000 + 400);
  });
});

describe("credits", () => {
  it("shows 1 credit per cent, rounded down", () => {
    expect(toCredits(500_000)).toBe(50);
    expect(toCredits(9_999)).toBe(0);
  });
});

describe("pkceChallenge", () => {
  it("is base64url(sha256(verifier)), as RFC 7636 S256 defines", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(await pkceChallenge(verifier)).toBe(expected);
    expect(expected).toHaveLength(43);
  });
});
