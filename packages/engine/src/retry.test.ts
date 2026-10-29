// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./retry.ts";

const reply = (status: number) => new Response(status === 200 ? "{}" : "nope", { status });

function fakeFetch(statuses: (number | Error)[]) {
  const calls: number[] = [];
  const impl = vi.fn(async () => {
    const next = statuses[calls.length] ?? 200;
    calls.push(1);
    if (next instanceof Error) throw next;
    return reply(next);
  });
  return impl as unknown as typeof fetch & { mock: { calls: unknown[] } };
}

describe("fetchWithRetry", () => {
  it("retries a transient 404 and returns the success", async () => {
    const impl = fakeFetch([404, 200]);
    const response = await fetchWithRetry(impl, "https://x", {});
    expect(response.status).toBe(200);
    expect(impl.mock.calls).toHaveLength(2);
  });

  it("retries a network error", async () => {
    const impl = fakeFetch([new TypeError("fetch failed"), 200]);
    expect((await fetchWithRetry(impl, "https://x", {})).status).toBe(200);
  });

  it("gives up after three attempts and returns the last answer", async () => {
    const impl = fakeFetch([503, 503, 503, 200]);
    expect((await fetchWithRetry(impl, "https://x", {})).status).toBe(503);
    expect(impl.mock.calls).toHaveLength(3);
  });

  it("doesn't retry a bad key or a bad request", async () => {
    for (const status of [400, 401, 403]) {
      const impl = fakeFetch([status]);
      expect((await fetchWithRetry(impl, "https://x", {})).status).toBe(status);
      expect(impl.mock.calls).toHaveLength(1);
    }
  });

  it("stops waiting when the request is cancelled", async () => {
    const controller = new AbortController();
    const impl = fakeFetch([503, 200]);
    const pending = fetchWithRetry(impl, "https://x", { signal: controller.signal });
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
    expect(impl.mock.calls).toHaveLength(1);
  });
});
