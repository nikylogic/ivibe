// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Meta Model API models iVibe may call. Anything else is refused, which keeps every
 * `-contributor` model (whose inputs may be used to train Meta models) away from recordings.
 *
 * Design: docs/architecture.md §5.3.
 */
export const ALLOWED_MODELS = [
  "muse-spark-1.3",
  "muse-wonder-1.0",
  "muse-voice-transcribe-1.0",
  "sam-3.1",
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

/**
 * The one exception: iVibe Cloud's free trial writes text with the contributor variant of Spark,
 * which costs a fraction of the standard model, and Meta may use those requests to improve its
 * models. Only the Worker opts in (ClientOptions.trial), and only for accounts that have never
 * paid; BYOK and paid runs never reach it. Disclosed on the welcome screen (D25).
 */
export const TRIAL_TEXT_MODEL = "muse-spark-1.3-contributor";

/** The Spark model a writer uses: the trial one only when the caller opted in. */
export function textModel(trial: boolean | undefined): AllowedModel | typeof TRIAL_TEXT_MODEL {
  return trial ? TRIAL_TEXT_MODEL : "muse-spark-1.3";
}

/** Baseten model slugs come from config and must name Muse Spark Open. */
export const BASETEN_MODEL_PREFIX = "meta-models/muse-spark-open";

export class ModelNotAllowedError extends Error {
  readonly model: string;

  constructor(model: string) {
    super(`Model "${model}" is not on the iVibe allowlist.`);
    this.name = "ModelNotAllowedError";
    this.model = model;
  }
}

export function isAllowedModel(model: string): model is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(model);
}

export function isAllowedBasetenModel(slug: string): boolean {
  return slug.startsWith(BASETEN_MODEL_PREFIX) && !slug.includes("contributor");
}

/** Throws unless `model` is an allowed Meta model ID. */
export function assertAllowedModel(model: string): asserts model is AllowedModel {
  if (!isAllowedModel(model)) throw new ModelNotAllowedError(model);
}

/** Throws unless `slug` is an allowed Baseten Muse Spark Open slug. */
export function assertAllowedBasetenModel(slug: string): void {
  if (!isAllowedBasetenModel(slug)) throw new ModelNotAllowedError(slug);
}
