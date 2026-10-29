// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Muse Voice Transcribe returns each utterance without closing punctuation, so captions joined
 * as-is run together. Capitalizes the first letter and ends the sentence with a full stop.
 */
export function asSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const capitalized = trimmed[0]!.toUpperCase() + trimmed.slice(1);
  return /[.!?…]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}
