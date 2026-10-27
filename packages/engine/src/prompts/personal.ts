// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Layer 4 of the prompt stack (docs/vibes-and-prompts.md §4.2): what the user told iVibe about
 * themselves in Settings → Personal. It refines the writing; it can't override the core rules.
 */

export interface Personal {
  /** "Nikhil" */
  name: string;
  /** "Full-stack developer at a fintech startup; we use Next.js and Postgres." */
  about: string;
  /** Dictation keeps the language spoken, or always writes English. */
  dictationLanguage: "keep" | "english";
  /** Words to spell exactly this way: product names, teammates, libraries. */
  dictionary: string[];
  /** Standing instructions, such as "We use pnpm, not npm" or "No emoji". */
  instructions: string;
}

export const EMPTY_PERSONAL: Personal = {
  name: "",
  about: "",
  dictationLanguage: "keep",
  dictionary: [],
  instructions: "",
};

export const PERSONAL_LIMITS = { name: 60, about: 300, instructions: 500, word: 60, words: 200 };

/** Cleans settings from disk or the renderer so they always fit the limits. */
export function normalizePersonal(value: unknown): Personal {
  const input = (value && typeof value === "object" ? value : {}) as Partial<Personal>;
  const text = (field: unknown, max: number) =>
    typeof field === "string" ? field.trim().slice(0, max) : "";
  const words = Array.isArray(input.dictionary) ? input.dictionary : [];
  return {
    name: text(input.name, PERSONAL_LIMITS.name),
    about: text(input.about, PERSONAL_LIMITS.about),
    dictationLanguage: input.dictationLanguage === "english" ? "english" : "keep",
    dictionary: [
      ...new Set(words.map((word) => text(word, PERSONAL_LIMITS.word)).filter(Boolean)),
    ].slice(0, PERSONAL_LIMITS.words),
    instructions: text(input.instructions, PERSONAL_LIMITS.instructions),
  };
}

export function personalLayer(personal: Personal | undefined): string {
  if (!personal) return "";
  const lines: string[] = [];
  if (personal.name) lines.push(`- The user's name is ${personal.name}.`);
  if (personal.about) lines.push(`- About them: ${personal.about}`);
  if (personal.dictionary.length > 0) {
    lines.push(
      `- Spell these words exactly like this when they come up (speech recognition often gets them wrong): ${personal.dictionary.join(", ")}.`,
    );
  }
  if (personal.instructions) {
    lines.push(
      `- Their standing instructions, unless they conflict with the rules above: ${personal.instructions}`,
    );
  }
  return lines.length > 0 ? `About the user:\n${lines.join("\n")}` : "";
}
