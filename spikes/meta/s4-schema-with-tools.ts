// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S4: can a JSON Schema output format (text.format) be combined with function tools in
 * the same request? Decides between schema output and a submit_report tool.
 *
 * Run: pnpm spike spikes/meta/s4-schema-with-tools.ts
 */

import { ApiError, outputText, postJson, saveResult } from "./_client.ts";
import type { ResponsesResult } from "./_client.ts";

const schema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    root_cause: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidence_frame_ids: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "root_cause", "confidence", "evidence_frame_ids"],
  additionalProperties: false,
};

const request = {
  model: "muse-spark-1.3",
  store: false,
  tools: [
    {
      type: "function",
      name: "read_ocr",
      description: "Return the OCR lines of a frame.",
      parameters: {
        type: "object",
        properties: { frame_id: { type: "string" } },
        required: ["frame_id"],
        additionalProperties: false,
      },
    },
  ],
  text: { format: { type: "json_schema", name: "report", schema, strict: true } },
  input: [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            "Frame f0007 shows `TypeError: Cannot read properties of undefined (reading 'map')` " +
            "in the browser console right after clicking Save. Do not call any tool; write the report.",
        },
      ],
    },
  ],
};

try {
  const response = await postJson<ResponsesResult>("/responses", request);
  const text = outputText(response);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  console.log("Request with tools + text.format was ACCEPTED.");
  console.log(`Output item types: ${response.output.map((item) => item.type).join(", ")}`);
  console.log(`Output parses as JSON: ${parsed !== undefined ? "yes" : "no"}`);
  console.log(text);
  console.log(`\nSaved: ${saveResult("s4-schema-with-tools", response)}`);
} catch (error) {
  if (error instanceof ApiError) {
    console.log("Request with tools + text.format was REJECTED: use a submit_report tool instead.");
    console.log(error.message);
    saveResult("s4-schema-with-tools-rejected", { status: error.status, body: error.body });
  } else {
    throw error;
  }
}
