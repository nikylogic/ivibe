// SPDX-License-Identifier: AGPL-3.0-only

import type { Context } from "hono";
import {
  MetaApiError,
  cleanUpDictation,
  normalizeSpokenLanguages,
  refineMark,
  transcribeWav,
  wavSeconds,
  writeFixPrompt,
  writePrompt,
} from "@ivibe/engine";
import type { ClientOptions, FixFrame, ProofShot } from "@ivibe/engine";
import type { AppEnv } from "./env.ts";
import { Meter } from "./meter.ts";
import { loadSettings } from "./settings.ts";
import type { Settings } from "./settings.ts";
import { networkOf, sha256, toCredits } from "./util.ts";
import { BadRequest, parseCompose } from "./validate.ts";
import {
  activateTrial,
  balanceOf,
  draw,
  hold,
  markUsed,
  settle,
  trialOnly,
  undraw,
} from "./wallet.ts";
import type { HoldOutcome, TrialOutcome } from "./wallet.ts";

/**
 * The metered endpoints. Each one reserves the most the call can cost, runs the same engine code
 * as the desktop's BYOK mode, then charges what Meta's usage says it cost.
 */

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 65;
/** SAM gets this long per highlight; a slow answer keeps the model's own box (as on desktop). */
const SAM_TIMEOUT_MS = 6000;

type Ctx = Context<AppEnv>;

/** What the user is told when Meta refuses a Cloud call. */
export function upstreamMessage(status: number): string {
  if (status === 401 || status === 402 || status === 403) {
    return "iVibe Cloud can't reach Meta right now. Try again later, or add your own Meta key in Settings.";
  }
  if (status === 429) return "iVibe Cloud is busy. Try again in a minute.";
  if (status >= 500) return "Meta's API is having trouble. Try again shortly.";
  return `Meta couldn't process this recording (HTTP ${status}).`;
}

export const apiError = (
  c: Ctx,
  status: 400 | 401 | 402 | 502 | 503,
  code: string,
  message: string,
) => c.json({ error: code, message }, status);

const MESSAGES = {
  insufficient_credits:
    "You're out of free credits. Add your own Meta API key in Settings to keep going for free.",
  capacity_paused:
    "Today's free Cloud usage is used up. It resets at 00:00 UTC, or add your own Meta API key in Settings.",
  device_limit:
    "This computer has already used its free trials. Add your own Meta API key in Settings to keep using iVibe for free.",
  network_limit:
    "Too many free trials were started from this network today. Try again tomorrow, or add your own Meta API key in Settings.",
  account_too_new:
    "Free credits need a GitHub account at least two weeks old. You can add your own Meta API key in Settings instead.",
} as const;

const PAID_OUT_OF_CREDITS =
  "You've used all your credits. iVibe Pro adds more with each monthly payment; until then, iVibe can use your own Meta API key (Settings).";

/**
 * Reserves credits, starting the free trial first if this is the account's first Cloud call and
 * it has none (D24). The device comes from the session (bound at sign-in) and the network from
 * Cloudflare's view of the caller, so neither can be chosen by the client.
 */
async function reserve(
  c: Ctx,
  settings: Settings,
  run: { id: string; userId: string; kind: string; amount: number },
): Promise<HoldOutcome | Exclude<TrialOutcome, "granted" | "already_claimed">> {
  const db = c.env.DB;
  const first = await hold(db, settings, run);
  if (first !== "insufficient_credits") return first;
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const trial = await activateTrial(db, settings, {
    userId: run.userId,
    deviceHash: c.get("session").deviceHash,
    networkHash: await sha256(`network:${c.env.HASH_SALT}:${networkOf(ip)}`),
  });
  if (trial === "granted") return hold(db, settings, run);
  return trial === "already_claimed" ? first : trial;
}

/** The reply when a reservation is refused. */
function refusal(
  c: Ctx,
  outcome: Exclude<Awaited<ReturnType<typeof reserve>>, "ok">,
  trial: boolean,
) {
  // A paying account never ran on free credits, so it isn't told to look for more of them.
  const message =
    outcome === "insufficient_credits" && !trial ? PAID_OUT_OF_CREDITS : MESSAGES[outcome];
  return apiError(c, outcome === "capacity_paused" ? 503 : 402, outcome, message);
}

/** The reply when Meta refuses or fails a call. */
function metaFailure(c: Ctx, kind: string, cause: MetaApiError) {
  console.error(`meta ${kind} failed: HTTP ${cause.status}`);
  // A refused or unfunded key is on our side (META_API_KEY): retrying won't help, but the
  // user's own key can, so it gets its own code that the desktop falls back on.
  const refused = [401, 402, 403, 429].includes(cause.status);
  return apiError(c, 502, refused ? "upstream_refused" : "upstream", upstreamMessage(cause.status));
}

/** Reserves `amount`, runs `work`, then settles with what the meter measured. */
async function metered<T extends object>(
  c: Ctx,
  settings: Settings,
  kind: string,
  amount: number,
  work: (meter: Meter) => Promise<T>,
  charge: (meter: Meter) => number,
): Promise<Response> {
  const db = c.env.DB;
  const { userId } = c.get("session");
  const runId = crypto.randomUUID();
  const started = Date.now();
  // Which model to use is looked up alongside the reservation, so it adds no round trip.
  const [outcome, trial] = await Promise.all([
    reserve(c, settings, { id: runId, userId, kind, amount }),
    trialOnly(db, userId),
  ]);
  if (outcome !== "ok") return refusal(c, outcome, trial);
  const reserved = Date.now();
  // Read the balance while Meta works, so the reply doesn't wait for it.
  const available = balanceOf(db, userId);

  const meter = new Meter(settings, c.env.META_API_KEY, trial);
  let result: T;
  try {
    result = await work(meter);
  } catch (cause) {
    // Calls that did complete still cost us; charge those and release the rest.
    if (meter.cost > 0) await markUsed(db, runId, meter.cost);
    c.executionCtx.waitUntil(settle(db, runId, meter.cost, meter.calls));
    if (cause instanceof MetaApiError) return metaFailure(c, kind, cause);
    throw cause;
  }
  const done = Date.now();
  // The cost is recorded before the user gets the result; the charge itself runs in the
  // background. If the Worker stops before it does, the cron charges what was recorded
  // (wallet.settleStale), so a run is never free and never charged more than it cost.
  const cost = Math.max(0, Math.min(Math.ceil(charge(meter)), amount));
  const [, balance] = await Promise.all([markUsed(db, runId, cost), available]);
  c.executionCtx.waitUntil(settle(db, runId, cost, meter.calls));
  const credits = toCredits(balance + amount - cost);
  console.log(
    `timing ${kind}${trial ? " (trial)" : ""}: reserve ${reserved - started} ms, meta ${done - reserved} ms`,
  );
  c.header("Server-Timing", `reserve;dur=${reserved - started}, meta;dur=${done - reserved}`);
  return c.json({ ...result, cost, credits });
}

async function enabledSettings(c: Ctx): Promise<Settings | Response> {
  const settings = await loadSettings(c.env.DB);
  if (!settings.cloudEnabled) {
    return apiError(
      c,
      503,
      "cloud_disabled",
      "iVibe Cloud is paused. Add your own Meta API key in Settings.",
    );
  }
  return settings;
}

/**
 * POST /v1/transcribe?languages=English,Hindi. Body: one 16 kHz WAV utterance (live captions).
 * `languages` is what the user speaks; empty means automatic detection. Without the parameter
 * (older desktops), the default applies: automatic detection.
 */
export async function transcribeRoute(c: Ctx): Promise<Response> {
  const settings = await enabledSettings(c);
  if (settings instanceof Response) return settings;
  if (Number(c.req.header("content-length") ?? 0) > MAX_AUDIO_BYTES) {
    return apiError(c, 400, "bad_request", "Audio is too long");
  }
  const languages = c.req.query("languages");
  const spoken = normalizeSpokenLanguages(
    languages === undefined ? undefined : languages.split(",").filter(Boolean),
  );
  const wav = new Uint8Array(await c.req.arrayBuffer());
  const seconds = wav.length <= MAX_AUDIO_BYTES ? wavSeconds(wav) : null;
  if (seconds === null || seconds > MAX_AUDIO_SECONDS) {
    return apiError(c, 400, "bad_request", "Expected a WAV of at most 65 seconds");
  }
  // Priced by length, so the reservation is the exact cost.
  const price = Math.ceil(Math.max(1, Math.ceil(seconds)) * settings.price.asrSecond);
  // Inside a recording: one small write takes the price from its reservation, instead of a
  // reservation and a settle of its own. A recording that is closed, expired, someone else's or
  // used up falls through to a reservation of this caption alone, which the balance must cover.
  const recording = c.req.query("recording");
  const { userId } = c.get("session");
  const started = Date.now();
  if (recording && (await draw(c.env.DB, recording, userId, price))) {
    const drawn = Date.now();
    const meter = new Meter(settings, c.env.META_API_KEY);
    try {
      const text = await transcribeWav(wav, spoken, meter.client("asr", c.req.raw.signal));
      console.log(
        `timing transcribe (recording): draw ${drawn - started} ms, meta ${Date.now() - drawn} ms`,
      );
      return c.json({ text, cost: price });
    } catch (cause) {
      // A caption Meta didn't transcribe isn't charged.
      await undraw(c.env.DB, recording, price);
      if (cause instanceof MetaApiError) return metaFailure(c, "transcribe", cause);
      throw cause;
    }
  }
  return metered(
    c,
    settings,
    "transcribe",
    price,
    async (meter) => ({
      text: await transcribeWav(wav, spoken, meter.client("asr", c.req.raw.signal)),
    }),
    () => price,
  );
}

/**
 * How long each mode records at most (apps/desktop/src/main/recording.ts), in seconds. A
 * recording reserves the captions for twice that, plus room for each sentence's rounding: a
 * caption that timed out may be sent again. What isn't used goes back when it closes.
 */
const RECORDING_SECONDS = { dictate: 300, prompt: 60, fix: 60 } as const;
const CAPTION_SLACK_SECONDS = 30;
/** The least a recording reserves: enough for its first sentences. */
const MIN_RECORDING_SECONDS = 10;

/**
 * POST /v1/recordings {mode}. Reserves the live captions of one recording up front, so a balance
 * that can't cover them is refused before the user speaks. Returns the recording's id, which
 * each caption sends (POST /v1/transcribe?recording=…).
 */
export async function openRecordingRoute(c: Ctx): Promise<Response> {
  const settings = await enabledSettings(c);
  if (settings instanceof Response) return settings;
  const body = (await c.req.json().catch(() => null)) as { mode?: unknown } | null;
  const mode = body?.mode;
  if (mode !== "dictate" && mode !== "prompt" && mode !== "fix") {
    return apiError(c, 400, "bad_request", "Expected a mode");
  }
  const db = c.env.DB;
  const { userId } = c.get("session");
  const perSecond = settings.price.asrSecond;
  const budget = Math.ceil((RECORDING_SECONDS[mode] * 2 + CAPTION_SLACK_SECONDS) * perSecond);
  const least = Math.ceil(MIN_RECORDING_SECONDS * perSecond);
  const id = crypto.randomUUID();
  // A low balance reserves what it has: captions past it are refused one by one.
  let [available, trial] = await Promise.all([balanceOf(db, userId), trialOnly(db, userId)]);
  let outcome = await reserve(c, settings, {
    id,
    userId,
    kind: "recording",
    amount: Math.max(least, Math.min(budget, available)),
  });
  if (outcome === "insufficient_credits" && available > least) {
    // The balance changed in between (another run, or the free trial just started): once more.
    available = await balanceOf(db, userId);
    trial = await trialOnly(db, userId);
    outcome = await reserve(c, settings, {
      id,
      userId,
      kind: "recording",
      amount: Math.max(least, Math.min(budget, available)),
    });
  }
  if (outcome !== "ok") return refusal(c, outcome, trial);
  return c.json({ id });
}

/** POST /v1/recordings/:id/close. Charges what the recording's captions used; the rest goes back. */
export async function closeRecordingRoute(c: Ctx): Promise<Response> {
  const id = c.req.param("id") ?? "";
  const { userId } = c.get("session");
  const owned = await c.env.DB.prepare(
    "SELECT 1 FROM runs WHERE id = ? AND user_id = ? AND kind = 'recording'",
  )
    .bind(id, userId)
    .first();
  if (!owned) return c.json({ error: "not_found", message: "No such recording" }, 404);
  const cost = await settle(c.env.DB, id);
  return c.json({ cost, credits: toCredits(await balanceOf(c.env.DB, userId)) });
}

/** Fits highlights with SAM 3.1, all in parallel; a failure or timeout keeps the model's box. */
async function refineShots(
  shots: ProofShot[],
  frames: FixFrame[],
  client: ClientOptions,
): Promise<ProofShot[]> {
  const timeout = <T>(promise: Promise<T>) =>
    Promise.race([
      promise.catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SAM_TIMEOUT_MS)),
    ]);
  return Promise.all(
    shots.map(async (shot) => {
      const frame = frames.find((candidate) => candidate.id === shot.frameId)!;
      const marks = await Promise.all(
        shot.marks.map(async (mark) => {
          const refined = await timeout(refineMark(frame.imageUrl, mark, frame, client));
          return refined ? { ...mark, box: refined } : mark;
        }),
      );
      return { ...shot, marks };
    }),
  );
}

/** POST /v1/compose. A recording's transcript (and for Fix, redacted keyframes) → the result. */
export async function composeRoute(c: Ctx): Promise<Response> {
  const settings = await enabledSettings(c);
  if (settings instanceof Response) return settings;
  let body;
  try {
    body = parseCompose(await c.req.json());
  } catch (cause) {
    return apiError(
      c,
      400,
      "bad_request",
      cause instanceof BadRequest ? cause.message : "Expected JSON",
    );
  }
  const signal = c.req.raw.signal;
  const { mode, transcript, context, frames, selection } = body;

  if (mode !== "fix") {
    // Editing a selection can write as much as it reads, so it reserves like a Fix.
    const hold = selection ? settings.hold.fix : settings.hold.write;
    return metered(
      c,
      settings,
      mode,
      hold,
      async (meter) => {
        const client = meter.client("spark", signal);
        const text =
          mode === "dictate"
            ? await cleanUpDictation(transcript, context, client, selection)
            : await writePrompt(transcript, context, client);
        return { text, shots: [] };
      },
      (meter) => meter.charge(hold),
    );
  }

  return metered(
    c,
    settings,
    "fix",
    settings.hold.fix,
    async (meter) => {
      const proof = body.proof && frames.length > 0;
      const fix = await writeFixPrompt(
        { transcript, context, frames, proof },
        meter.client("spark", signal),
      );
      const shots = proof ? await refineShots(fix.shots, frames, meter.client("sam", signal)) : [];
      return { text: fix.prompt, shots };
    },
    (meter) => meter.charge(settings.hold.fix),
  );
}
