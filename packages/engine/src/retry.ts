// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Retries for Meta Model API calls. Meta occasionally answers a valid request with a 404, 429 or
 * 5xx that succeeds when sent again moments later (seen on Oct 28 for a Dictate cleanup that
 * worked on four immediate replays), so a hiccup shouldn't cost the user their recording.
 * Requests use `store: false` and failed calls aren't billed, so resending is safe.
 */

const RETRYABLE = new Set([404, 408, 409, 429, 500, 502, 503, 504]);
const DELAYS_MS = [400, 1200];

const wait = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/** Sends the request, then up to twice more if Meta's answer or the network looks transient. */
export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt === DELAYS_MS.length;
    try {
      const response = await fetchImpl(url, init);
      if (last || !RETRYABLE.has(response.status)) return response;
      // Drain the failed body so the connection can be reused.
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (last || init.signal?.aborted) throw error;
    }
    await wait(DELAYS_MS[attempt]!, init.signal);
  }
}
