// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import {
  ALLOWED_MODELS,
  TRIAL_TEXT_MODEL,
  ModelNotAllowedError,
  assertAllowedBasetenModel,
  assertAllowedModel,
  isAllowedModel,
  textModel,
} from "./models.ts";
import { createResponse } from "./responses.ts";
import type { ResponsesRequest } from "./responses.ts";
import { cleanUpDictation } from "./writers.ts";

const reply = {
  id: "r",
  output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
};

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

  it("uses the contributor model only for opted-in trial runs", async () => {
    expect(textModel(undefined)).toBe("muse-spark-1.3");
    expect(textModel(true)).toBe(TRIAL_TEXT_MODEL);
    const sent: string[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)).model);
      return Response.json(reply);
    }) as typeof globalThis.fetch;
    const context = { target: { kind: "chat", name: "Slack" } } as never;
    await cleanUpDictation([{ startMs: 0, text: "hi" }], context, { apiKey: "k", fetch });
    await cleanUpDictation([{ startMs: 0, text: "hi" }], context, {
      apiKey: "k",
      fetch,
      trial: true,
    });
    expect(sent).toEqual(["muse-spark-1.3", TRIAL_TEXT_MODEL]);
  });

  it("refuses the trial model without the trial flag", async () => {
    const fetch = (async () => Response.json(reply)) as unknown as typeof globalThis.fetch;
    const request: ResponsesRequest = { model: TRIAL_TEXT_MODEL, input: [] };
    await expect(createResponse(request, { apiKey: "k", fetch })).rejects.toThrow(
      ModelNotAllowedError,
    );
    await expect(
      createResponse(request, { apiKey: "k", fetch, trial: true }),
    ).resolves.toBeTruthy();
  });
});
