// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import {
  ALLOWED_MODELS,
  ModelNotAllowedError,
  assertAllowedBasetenModel,
  assertAllowedModel,
  isAllowedModel,
} from "./models.ts";

describe("model allowlist", () => {
  it("is exactly the reviewed list (update this test only after a review)", () => {
    expect(ALLOWED_MODELS).toEqual([
      "muse-spark-1.3",
      "muse-wonder-1.0",
      "muse-voice-transcribe-1.0",
      "sam-3.1",
    ]);
  });

  it("accepts every allowed model", () => {
    for (const model of ALLOWED_MODELS) expect(() => assertAllowedModel(model)).not.toThrow();
  });

  it("refuses contributor variants", () => {
    expect(isAllowedModel("muse-spark-1.3-contributor")).toBe(false);
    expect(() => assertAllowedModel("muse-spark-1.3-contributor")).toThrow(ModelNotAllowedError);
  });

  it("refuses unknown models", () => {
    expect(() => assertAllowedModel("gpt-4o")).toThrow(ModelNotAllowedError);
    expect(() => assertAllowedModel("")).toThrow(ModelNotAllowedError);
  });

  it("accepts only Muse Spark Open slugs on Baseten", () => {
    expect(() => assertAllowedBasetenModel("meta-models/muse-spark-open-1026")).not.toThrow();
    expect(() => assertAllowedBasetenModel("meta-models/muse-spark-open")).not.toThrow();
    expect(() => assertAllowedBasetenModel("meta-models/muse-spark-open-contributor")).toThrow();
    expect(() => assertAllowedBasetenModel("other/model")).toThrow();
  });
});
