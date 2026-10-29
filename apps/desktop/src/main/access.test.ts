// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { accessOrder, shouldFallBack } from "./access.ts";

const pro = { token: "ivs_t", status: { signedIn: true, tier: "pro" as const } };
const trial = { token: "ivs_t", status: { signedIn: true, tier: "trial" as const } };
const signedOut = { token: null, status: { signedIn: false } };
const kinds = (order: { kind: string }[]) => order.map((access) => access.kind);

describe("accessOrder", () => {
  const auto = { runOn: "auto" as const, runFallback: true };

  it("uses whichever one there is", () => {
    expect(kinds(accessOrder(auto, "LLM_k", signedOut))).toEqual(["byok"]);
    expect(kinds(accessOrder(auto, null, pro))).toEqual(["cloud"]);
    expect(accessOrder(auto, null, signedOut)).toEqual([]);
  });

  it("puts Pro first and the key first otherwise", () => {
    expect(kinds(accessOrder(auto, "LLM_k", pro))).toEqual(["cloud", "byok"]);
    expect(kinds(accessOrder(auto, "LLM_k", trial))).toEqual(["byok", "cloud"]);
  });

  it("follows an explicit choice", () => {
    expect(kinds(accessOrder({ ...auto, runOn: "key" }, "LLM_k", pro))).toEqual(["byok", "cloud"]);
    expect(kinds(accessOrder({ ...auto, runOn: "cloud" }, "LLM_k", trial))).toEqual([
      "cloud",
      "byok",
    ]);
  });

  it("drops the fallback when it is turned off", () => {
    expect(kinds(accessOrder({ ...auto, runFallback: false }, "LLM_k", pro))).toEqual(["cloud"]);
  });
});

describe("shouldFallBack", () => {
  const cloud = { kind: "cloud" as const, token: "t" };
  const byok = { kind: "byok" as const, key: "k" };
  const metaError = (status: number) =>
    Object.assign(new Error("x"), { name: "MetaApiError", status });

  it("falls back from Cloud when it refuses, not when the network is down", () => {
    expect(shouldFallBack(cloud, { code: "insufficient_credits" })).toBe(true);
    expect(shouldFallBack(cloud, { code: "offline" })).toBe(false);
    expect(shouldFallBack(cloud, { code: "upstream" })).toBe(false);
  });

  it("falls back from a key Meta refuses, not from a bad request", () => {
    expect(shouldFallBack(byok, metaError(401))).toBe(true);
    expect(shouldFallBack(byok, metaError(429))).toBe(true);
    expect(shouldFallBack(byok, metaError(400))).toBe(false);
    expect(shouldFallBack(byok, new Error("boom"))).toBe(false);
  });
});
