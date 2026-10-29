// SPDX-License-Identifier: AGPL-3.0-only

const encoder = new TextEncoder();

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** PKCE S256: base64url(sha256(verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function randomToken(prefix = ""): string {
  return prefix + base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export const now = () => Date.now();

/** The UTC day, which is when the daily pool and the per-network trial limit reset. */
export const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

/**
 * The network a request came from: the IPv4 address, or the /64 prefix for IPv6, since one home
 * or phone usually gets a whole /64.
 */
export function networkOf(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/** Credits shown to users: 1 credit = 1 cent of Meta usage, rounded down. */
export const toCredits = (micro: number) => Math.floor(micro / 10_000);
