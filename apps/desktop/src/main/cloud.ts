// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { app, net, safeStorage, shell } from "electron";
import type {
  FixFrame,
  Language,
  OutputMode,
  ProofShot,
  TranscriptLine,
  WriterContext,
} from "@ivibe/engine";
import type { CloudPlan, CloudStatus, CloudUsage } from "../shared/ipc.ts";

/**
 * iVibe Cloud (apps/api): sign in with GitHub, get free trial credits, and run Meta calls on
 * iVibe's key instead of the user's own. Recordings are redacted on the device before anything
 * is sent, exactly as in BYOK mode. The session token lives in the OS keychain (safeStorage) and
 * never reaches a renderer.
 */

export const API_URL = process.env.IVIBE_API_URL ?? "https://api.ivibe.tech";
export const AUTH_URL = process.env.IVIBE_AUTH_URL ?? "https://auth.ivibe.tech";
export const APP_SCHEME = "tech.ivibe.app";

/** Where a recording's Meta calls go: the user's own key, or iVibe Cloud. */
export type MetaAccess = { kind: "byok"; key: string } | { kind: "cloud"; token: string };

interface StoredSession {
  token: string;
  login: string;
}

const sessionFile = () => join(app.getPath("userData"), "cloud.bin");
const run = promisify(execFile);

let session: StoredSession | null | undefined;
let status: CloudStatus = { signedIn: false };
let pending: { verifier: string; at: number } | null = null;
let listener: (status: CloudStatus) => void = () => undefined;

export function onCloudChange(callback: (status: CloudStatus) => void): void {
  listener = callback;
}

function update(change: Partial<CloudStatus>): CloudStatus {
  status = { ...status, ...change };
  listener(status);
  return status;
}

function readSession(): StoredSession | null {
  if (session !== undefined) return session;
  session = null;
  const file = sessionFile();
  if (existsSync(file) && safeStorage.isEncryptionAvailable()) {
    try {
      session = JSON.parse(safeStorage.decryptString(readFileSync(file))) as StoredSession;
    } catch {
      session = null;
    }
  }
  return session;
}

function writeSession(next: StoredSession | null): void {
  session = next;
  if (next && safeStorage.isEncryptionAvailable()) {
    writeFileSync(sessionFile(), safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 });
  } else {
    rmSync(sessionFile(), { force: true });
  }
}

/** Main-process only: the session token, or null when signed out. */
export function cloudToken(): string | null {
  return readSession()?.token ?? null;
}

/**
 * A stable ID for this computer, hashed so the hardware ID itself never leaves the device. The
 * server only uses it to count free trials per computer.
 */
async function deviceId(): Promise<string> {
  let raw = "";
  try {
    if (process.platform === "win32") {
      const { stdout } = await run("reg", [
        "query",
        "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
        "/v",
        "MachineGuid",
      ]);
      raw = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(stdout)?.[1] ?? "";
    } else if (process.platform === "darwin") {
      const { stdout } = await run("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);
      raw = /"IOPlatformUUID" = "([^"]+)"/.exec(stdout)?.[1] ?? "";
    } else {
      for (const file of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
        if (existsSync(file)) raw = readFileSync(file, "utf8").trim();
        if (raw) break;
      }
    }
  } catch {
    raw = "";
  }
  if (!raw) {
    // No hardware ID readable: fall back to one kept in the profile.
    const file = join(app.getPath("userData"), "device-id");
    if (!existsSync(file)) writeFileSync(file, randomUUID());
    raw = `profile:${readFileSync(file, "utf8").trim()}`;
  }
  return createHash("sha256").update(`ivibe-device-v1:${raw}`).digest("hex");
}

export class CloudError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api<T>(
  path: string,
  init: {
    method?: string;
    body?: BodyInit;
    type?: string;
    token?: string | null;
    signal?: AbortSignal;
    /** Sign-in calls go to auth.ivibe.tech. */
    base?: string;
  },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.type) headers["Content-Type"] = init.type;
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let response: Response;
  try {
    response = await net.fetch(`${init.base ?? API_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body,
      signal: init.signal,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new CloudError(0, "offline", "Couldn't reach iVibe Cloud. Check your connection.");
  }
  // How the Worker spent its time (reserve credits, Meta call), for the timing log.
  const timing = response.headers.get("server-timing");
  if (timing) console.log(`[iVibe timing] cloud ${path}: ${timing}`);
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    if (response.status === 401 && init.token) signOutLocally();
    // The first Cloud call is where a free trial can be refused (device, network, account age).
    if (body.error && TRIAL_REFUSALS.has(body.error)) update({ trial: body.error });
    throw new CloudError(
      response.status,
      body.error ?? "error",
      body.message ?? `iVibe Cloud failed (HTTP ${response.status}).`,
    );
  }
  return body;
}

interface Account {
  user: { login: string; name?: string | null };
  credits: number;
  trial: string;
  trialCredits: number;
  plan: CloudPlan | null;
  planOffer: CloudStatus["planOffer"];
  tier: CloudStatus["tier"];
}

const fromAccount = (account: Account): Partial<CloudStatus> => ({
  login: account.user.login,
  name: account.user.name ?? undefined,
  tier: account.tier,
  credits: account.credits,
  trial: account.trial,
  trialCredits: account.trialCredits,
  plan: account.plan,
  planOffer: account.planOffer,
});

const TRIAL_REFUSALS = new Set(["device_limit", "network_limit", "account_too_new"]);

/**
 * Credits come back with every metered call; keep the sidebar in step. A successful call means
 * the free trial, if it was waiting, has now started.
 */
function noteCredits(credits: unknown): void {
  if (typeof credits !== "number") return;
  const trial = status.trial === "available" ? "granted" : status.trial;
  // A trial that just ran out is Free now; the server says the same on the next refresh.
  const tier = status.tier === "trial" && credits <= 0 ? "free" : status.tier;
  if (credits !== status.credits || trial !== status.trial || tier !== status.tier) {
    update({ credits, trial, tier });
  }
}

export function cloudStatus(): CloudStatus {
  return status;
}

/** Loads the stored session and the current balance; called once at startup. */
export async function refreshCloud(): Promise<CloudStatus> {
  const stored = readSession();
  if (!stored) return update({ signedIn: false, login: undefined, credits: undefined });
  update({ signedIn: true, login: stored.login });
  try {
    const me = await api<Account>("/v1/me", { token: stored.token });
    return update(fromAccount(me));
  } catch {
    return status;
  }
}

/** Opens GitHub sign-in in the browser; the result comes back through handleAuthLink. */
export async function signIn(): Promise<void> {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  pending = { verifier, at: Date.now() };
  update({ pending: true, message: undefined });
  await shell.openExternal(`${AUTH_URL}/github?challenge=${challenge}`);
}

/**
 * Handles links back from the browser: tech.ivibe.app://auth?code=… after GitHub sign-in, and
 * tech.ivibe.app://billing after Pro checkout or the subscription portal.
 */
export async function handleAppLink(link: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return;
  }
  if (url.hostname === "billing") return awaitBilling();
  const code = url.searchParams.get("code");
  if (url.hostname !== "auth" || !code) return;
  if (!pending || Date.now() - pending.at > 10 * 60_000) {
    update({ pending: false, message: "That sign-in link has expired. Sign in again." });
    return;
  }
  const { verifier } = pending;
  pending = null;
  try {
    const result = await api<Account & { token: string }>("/token", {
      base: AUTH_URL,
      method: "POST",
      type: "application/json",
      body: JSON.stringify({ code, verifier, device: await deviceId() }),
    });
    writeSession({ token: result.token, login: result.user.login });
    update({
      signedIn: true,
      pending: false,
      login: result.user.login,
      ...fromAccount(result),
      message: undefined,
    });
  } catch (error) {
    update({ pending: false, message: error instanceof Error ? error.message : String(error) });
  }
}

function signOutLocally(): void {
  writeSession(null);
  update({
    signedIn: false,
    login: undefined,
    credits: undefined,
    trial: undefined,
    trialCredits: undefined,
    plan: undefined,
    name: undefined,
    tier: undefined,
    message: undefined,
  });
}

export async function signOut(): Promise<CloudStatus> {
  const token = cloudToken();
  signOutLocally();
  if (token)
    await api("/sign-out", { base: AUTH_URL, method: "POST", token }).catch(() => undefined);
  return status;
}

/** Billing → Usage, read fresh each time the page opens. */
export async function cloudUsage(): Promise<CloudUsage | null> {
  const token = cloudToken();
  if (!token) return null;
  return api<CloudUsage>("/v1/usage", { token }).catch(() => null);
}

/** Opens Pro checkout (or, when already subscribed, the portal) in the browser. */
export async function openBilling(page: "checkout" | "portal"): Promise<void> {
  const token = cloudToken();
  if (!token) return;
  update({ message: undefined });
  try {
    const { url } = await api<{ url: string }>(`/v1/billing/${page}`, { method: "POST", token });
    await shell.openExternal(url);
  } catch (error) {
    update({ message: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Back from checkout: Dodo's webhook adds the credits a few seconds after the browser returns,
 * so check the account until they show up (or a minute passes).
 */
async function awaitBilling(): Promise<void> {
  const before = status.credits;
  for (let attempt = 0; attempt < 12; attempt++) {
    await refreshCloud();
    if (status.credits !== before) return;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

/** Backups (main/backup.ts): a JSON call with the session; throws when signed out. */
export function backupCall<T>(
  path: string,
  init: { method?: string; body?: BodyInit; type?: string } = {},
): Promise<T> {
  const token = cloudToken();
  if (!token) throw new CloudError(401, "signed_out", "Sign in to iVibe Cloud first.");
  return api<T>(path, { ...init, token });
}

/** Backups: downloads one encrypted object as bytes. */
export async function backupDownload(path: string): Promise<Uint8Array> {
  const token = cloudToken();
  if (!token) throw new CloudError(401, "signed_out", "Sign in to iVibe Cloud first.");
  let response: Response;
  try {
    response = await net.fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new CloudError(0, "offline", "Couldn't reach iVibe Cloud. Check your connection.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new CloudError(
      response.status,
      body.error ?? "error",
      body.message ?? `Download failed (HTTP ${response.status}).`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Reserves the live captions of one recording up front (apps/api runs.ts), so a balance that
 * can't cover them is refused before the user speaks. Returns the id each caption sends.
 */
export async function cloudOpenRecording(mode: OutputMode, token: string): Promise<string> {
  const result = await api<{ id: string }>("/v1/recordings", {
    method: "POST",
    type: "application/json",
    body: JSON.stringify({ mode }),
    token,
  });
  return result.id;
}

/** Charges what a recording's captions used and gives the rest of its reservation back. */
export async function cloudCloseRecording(id: string, token: string): Promise<void> {
  const result = await api<{ credits: number }>(`/v1/recordings/${encodeURIComponent(id)}/close`, {
    method: "POST",
    token,
  });
  noteCredits(result.credits);
}

/** Live captions through iVibe Cloud, drawn from the recording's reservation when there is one. */
export async function cloudTranscribe(
  wav: Uint8Array,
  token: string,
  languages: readonly Language[],
  signal?: AbortSignal,
  recording?: string | null,
): Promise<string> {
  // Empty asks the Worker for automatic detection.
  const query =
    `?languages=${encodeURIComponent(languages.join(","))}` +
    (recording ? `&recording=${encodeURIComponent(recording)}` : "");
  const result = await api<{ text: string; credits: number }>(`/v1/transcribe${query}`, {
    method: "POST",
    type: "audio/wav",
    body: wav.slice(),
    token,
    signal,
  });
  noteCredits(result.credits);
  return result.text;
}

export interface CloudComposeRequest {
  mode: OutputMode;
  transcript: TranscriptLine[];
  context: WriterContext;
  frames: FixFrame[];
  proof: boolean;
  /** Dictate: the selected text to edit, secrets already masked. */
  selection?: string;
}

/** One Fix, Prompt or Dictate result through iVibe Cloud; Fix highlights come back SAM-refined. */
export async function cloudCompose(
  request: CloudComposeRequest,
  token: string,
  signal?: AbortSignal,
): Promise<{ text: string; shots: ProofShot[] }> {
  const result = await api<{ text: string; shots: ProofShot[]; credits: number }>("/v1/compose", {
    method: "POST",
    type: "application/json",
    body: JSON.stringify(request),
    token,
    signal,
  });
  noteCredits(result.credits);
  return { text: result.text, shots: result.shots ?? [] };
}
