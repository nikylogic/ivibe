// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Interface languages. Only English ships for now; adding one means a code and label here, a
 * catalog for iVibe's own text, and Astryx's generated catalog for its components
 * (@astryxdesign/core/locales/<code>.generated.js) passed to the provider in ui/main.tsx.
 */
export const LANGUAGES = [{ code: "en", label: "English" }] as const;

export type AppLanguage = (typeof LANGUAGES)[number]["code"];

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  LANGUAGES.some((language) => language.code === value);
