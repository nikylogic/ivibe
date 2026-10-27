// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Secret detection rules (docs/architecture.md §4.9). Patterns describe the shape of a secret
 * rather than exact characters, because OCR misreads some of them (l as 1, O as 0, and `_` as a
 * space in some fonts).
 */

export type RuleId =
  | "meta-key"
  | "anthropic-key"
  | "openai-key"
  | "aws-key"
  | "github-token"
  | "google-key"
  | "stripe-key"
  | "slack-token"
  | "jwt"
  | "private-key"
  | "assignment"
  | "bearer"
  | "env-line"
  | "connection-string"
  | "high-entropy"
  | "sensitive-app";

export interface PatternRule {
  id: RuleId;
  pattern: RegExp;
  /** The capture group holding the secret; the whole match when absent. */
  group?: number;
}

/** Rules 1, 2 and 4: always applied, in this order. */
export const PATTERN_RULES: readonly PatternRule[] = [
  // 1. Provider tokens. Anthropic comes before OpenAI, whose `sk-` prefix it shares.
  { id: "meta-key", pattern: /\bLLM[_ ][A-Za-z0-9_|-]{16,}/g },
  { id: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { id: "openai-key", pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g },
  { id: "aws-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  {
    id: "github-token",
    pattern: /\b(?:gh[pousr][_ ][A-Za-z0-9]{30,}|github[_ ]pat[_ ][A-Za-z0-9_]{40,})/g,
  },
  { id: "google-key", pattern: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { id: "stripe-key", pattern: /\b(?:sk|rk|pk)[_ ](?:live|test)[_ ][0-9A-Za-z]{16,}/g },
  { id: "slack-token", pattern: /\bxox[abprs]-[0-9A-Za-z-]{10,}/g },
  { id: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g },
  { id: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  // Cloudflare and Dodo keys have no fixed prefix; the entropy rule catches them.

  // 2. Assignments: redact the value, keep the name so the report still makes sense.
  {
    id: "assignment",
    pattern:
      /(?:api[_-]?key|secret|token|passw(?:or)?d|pwd|auth|bearer|private[_-]?key|client[_-]?secret)["']?\s*[:=]\s*["'`]?([^\s"'`,;]{6,})/gi,
    group: 1,
  },
  { id: "bearer", pattern: /\bBearer\s+([A-Za-z0-9._~+/-]{12,}=*)/g, group: 1 },

  // 4. Connection strings with a password: redact only the password.
  { id: "connection-string", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:([^@\s]+)@/gi, group: 1 },
];

/** 3. `.env`-style lines, applied only when the frame shows a config file (see ENV_CONTEXT). */
export const ENV_LINE: PatternRule = {
  id: "env-line",
  pattern: /^\s*(?:export\s+)?[A-Z][A-Z0-9_]{2,}\s*=\s*["']?(\S{8,}?)["']?\s*$/g,
  group: 1,
};
export const ENV_CONTEXT = /\.env\b|\bconfig\b|\bsettings\b|\bcredentials\b/i;

/** 6. Password managers: the whole frame is blacked out. */
export const SENSITIVE_APP = /\b(1Password|Bitwarden|KeePassXC|Keychain Access)\b/i;

/** 5. High-entropy tokens. */
export const ENTROPY = {
  candidate: /[A-Za-z0-9+/_=-]{24,}/g,
  minBitsPerChar: 3.8,
  /** Git SHAs and other plain hex up to this length stay readable. */
  maxPlainHex: 40,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
} as const;

/** Shannon entropy in bits per character. */
export function shannonEntropy(text: string): number {
  if (text.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * Whether a token looks like a random secret. It needs letters and digits, which keeps
 * identifiers (`handleSaveDraftButtonClick`) and file paths readable.
 */
export function isHighEntropyToken(token: string): boolean {
  if (/^[0-9a-f]+$/i.test(token) && token.length <= ENTROPY.maxPlainHex) return false;
  if (ENTROPY.uuid.test(token)) return false;
  if (!/[0-9]/.test(token) || !/[A-Za-z]/.test(token)) return false;
  return shannonEntropy(token) >= ENTROPY.minBitsPerChar;
}
