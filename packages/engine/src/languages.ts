// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The languages Muse Voice Transcribe supports (Meta's Speech to text docs: "25 evaluated
 * languages with code-switching"), and what iVibe sends for each.
 *
 * - `name` goes in `languageBias` exactly as Meta's docs spell it. The API accepts any string
 *   without an error, so a misspelling would silently do nothing (Spike S21); only these are sent.
 * - `native` is shown next to the name in Settings.
 * - `writeAs` names the variant and script in the writing instruction: a bare "Arabic" came back
 *   as Urdu for Hinglish input, while the explicit form wrote all 25 correctly (Spike S22).
 */
export const LANGUAGES = [
  { name: "Arabic", native: "العربية", writeAs: "Arabic (Modern Standard Arabic, Arabic script)" },
  { name: "Bengali", native: "বাংলা", writeAs: "Bengali (Bengali script)" },
  { name: "Dutch", native: "Nederlands", writeAs: "Dutch" },
  { name: "English", native: "English", writeAs: "English" },
  { name: "French", native: "Français", writeAs: "French" },
  { name: "German", native: "Deutsch", writeAs: "German" },
  { name: "Hebrew", native: "עברית", writeAs: "Hebrew (Hebrew script)" },
  { name: "Hindi", native: "हिन्दी", writeAs: "Hindi (Devanagari script)" },
  { name: "Indonesian", native: "Bahasa Indonesia", writeAs: "Indonesian" },
  { name: "Italian", native: "Italiano", writeAs: "Italian" },
  { name: "Japanese", native: "日本語", writeAs: "Japanese" },
  { name: "Kannada", native: "ಕನ್ನಡ", writeAs: "Kannada (Kannada script)" },
  { name: "Korean", native: "한국어", writeAs: "Korean (Hangul)" },
  { name: "Malay", native: "Bahasa Melayu", writeAs: "Malay" },
  {
    name: "Mandarin Chinese",
    native: "中文",
    writeAs: "Mandarin Chinese (Simplified Chinese characters)",
  },
  { name: "Marathi", native: "मराठी", writeAs: "Marathi (Devanagari script)" },
  { name: "Polish", native: "Polski", writeAs: "Polish" },
  { name: "Portuguese", native: "Português", writeAs: "Portuguese" },
  { name: "Spanish", native: "Español", writeAs: "Spanish" },
  { name: "Tagalog", native: "Tagalog", writeAs: "Tagalog (Filipino)" },
  { name: "Tamil", native: "தமிழ்", writeAs: "Tamil (Tamil script)" },
  { name: "Telugu", native: "తెలుగు", writeAs: "Telugu (Telugu script)" },
  { name: "Thai", native: "ไทย", writeAs: "Thai (Thai script)" },
  { name: "Turkish", native: "Türkçe", writeAs: "Turkish" },
  { name: "Vietnamese", native: "Tiếng Việt", writeAs: "Vietnamese" },
] as const;

export type Language = (typeof LANGUAGES)[number]["name"];

/** Results in the language spoken, or always in one language. */
export type OutputLanguage = "auto" | Language;

/** At most this many spoken languages are biased toward; none means automatic detection. */
export const MAX_SPOKEN_LANGUAGES = 3;

/** Automatic detection, which recognized real Hindi and Spanish speech unaided (Spike S23). */
export const DEFAULT_SPOKEN_LANGUAGES: Language[] = [];

/** Where the list starts when someone turns detection off: Hindi and English, often mixed. */
export const SUGGESTED_SPOKEN_LANGUAGES: Language[] = ["English", "Hindi"];

export const DEFAULT_OUTPUT_LANGUAGE: OutputLanguage = "English";

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language.name === value);
}

export function isOutputLanguage(value: unknown): value is OutputLanguage {
  return value === "auto" || isLanguage(value);
}

/**
 * Keeps known languages, once each, up to the limit. Anything that isn't a list falls back to the
 * default; an empty list is a choice (automatic detection).
 */
export function normalizeSpokenLanguages(value: unknown): Language[] {
  if (!Array.isArray(value)) return [...DEFAULT_SPOKEN_LANGUAGES];
  return [...new Set(value.filter(isLanguage))].slice(0, MAX_SPOKEN_LANGUAGES);
}

/** The writing rule every mode ends with. */
export function languageRule(output: OutputLanguage): string {
  if (output === "auto") {
    return "Write in the language they spoke. If they mixed languages (such as Hindi and English), keep the mix as they said it. Do not translate.";
  }
  const language = LANGUAGES.find((candidate) => candidate.name === output)!;
  return `Write in ${language.writeAs}. Translate every part spoken in another language faithfully.`;
}
