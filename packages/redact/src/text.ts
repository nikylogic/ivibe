// SPDX-License-Identifier: AGPL-3.0-only

import { PATTERN_RULES } from "./rules.ts";
import { entropySpans, matchRule, merge } from "./scan.ts";

/**
 * Secrets in plain text (Dictate's selected text): the same rules as on screen, but each secret
 * becomes a numbered placeholder instead of dots, so the model can keep it in place and the
 * original is put back on this device afterwards. The secret itself never leaves the device.
 */

export interface MaskedText {
  text: string;
  /** The hidden values, in placeholder order: [[secret-1]] is secrets[0]. */
  secrets: string[];
}

const placeholder = (n: number) => `[[secret-${n}]]`;

export function maskSecrets(text: string): MaskedText {
  const found = PATTERN_RULES.flatMap((rule) => matchRule(text, rule));
  found.push(...entropySpans(text));
  if (found.length === 0) return { text, secrets: [] };
  const secrets: string[] = [];
  let masked = "";
  let at = 0;
  for (const span of merge(found)) {
    secrets.push(text.slice(span.start, span.end));
    masked += text.slice(at, span.start) + placeholder(secrets.length);
    at = span.end;
  }
  return { text: masked + text.slice(at), secrets };
}

/** Puts the hidden values back where the model kept their placeholders. */
export function restoreSecrets(text: string, secrets: readonly string[]): string {
  return text.replace(
    /\[\[secret-(\d+)\]\]/g,
    (match, n: string) => secrets[Number(n) - 1] ?? match,
  );
}
