// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S3: do store:false, encrypted reasoning replay, function tools and an image in a
 * follow-up user message work together? And is previous_response_id cheaper?
 *
 * Run: pnpm spike spikes/meta/s3-tool-loop.ts path/to/screenshot.png [stateless|previous]
 *
 * "previous" uses store:true, so only use a screenshot without private content.
 */

import { dataUrl, mimeTypeOf, outputText, postJson, requireArg, saveResult } from "./_client.ts";
import type { ResponseItem, ResponsesResult } from "./_client.ts";

const screenshot = requireArg(
  0,
  "pnpm spike spikes/meta/s3-tool-loop.ts <screenshot.png> [stateless|previous]",
);
const mode = process.argv[3] === "previous" ? "previous" : "stateless";

const tools = [
  {
    type: "function",
    name: "view_frames",
    description:
      "Attach up to 4 frames at full resolution. The images arrive in the next user message.",
    parameters: {
      type: "object",
      properties: {
        frame_ids: { type: "array", items: { type: "string" }, maxItems: 4 },
      },
      required: ["frame_ids"],
      additionalProperties: false,
    },
  },
];

const base = {
  model: "muse-spark-1.3",
  tools,
  reasoning: { effort: "low" },
  ...(mode === "stateless"
    ? { store: false, include: ["reasoning.encrypted_content"] }
    : { store: true }),
};

const turns: { turn: number; usage: unknown; outputTypes: string[]; ms: number }[] = [];
const transcript: ResponseItem[] = [
  {
    type: "message",
    role: "user",
    content: [
      {
        type: "input_text",
        text:
          "A user recorded a bug. Frame f0001 is the moment it happened. You can't see it yet: " +
          "call view_frames to look at f0001, then explain what is on screen in two sentences.",
      },
    ],
  },
];

async function turn(
  n: number,
  input: ResponseItem[],
  previousId?: string,
): Promise<ResponsesResult> {
  const t0 = Date.now();
  const response = await postJson<ResponsesResult>("/responses", {
    ...base,
    input,
    ...(previousId ? { previous_response_id: previousId } : {}),
  });
  turns.push({
    turn: n,
    usage: response.usage,
    outputTypes: response.output.map((item) => item.type),
    ms: Date.now() - t0,
  });
  console.log(
    `Turn ${n}: ${response.output.map((item) => item.type).join(", ")} (${Date.now() - t0} ms)`,
  );
  return response;
}

// Turn 1: the model should call view_frames.
const first = await turn(1, transcript);
const call = first.output.find((item) => item.type === "function_call");
if (!call) {
  console.log("No tool call. Answer:", outputText(first));
  process.exit(1);
}
console.log(`  called ${String(call.name)}(${String(call.arguments)})`);

// Turn 2: acknowledge the tool, then send the image in a user message (images are only
// allowed in user messages).
const followUp: ResponseItem[] = [
  {
    type: "function_call_output",
    call_id: call.call_id,
    output: "Frames attached in the next message.",
  },
  {
    type: "message",
    role: "user",
    content: [
      { type: "input_text", text: "Frame f0001:" },
      { type: "input_image", image_url: dataUrl(screenshot, mimeTypeOf(screenshot)) },
    ],
  },
];

const second =
  mode === "stateless"
    ? await turn(2, [...transcript, ...first.output, ...followUp])
    : await turn(2, followUp, first.id);

console.log(`\nFinal answer:\n${outputText(second)}`);
console.log("\nUsage per turn:", JSON.stringify(turns, null, 2));
console.log(`\nSaved: ${saveResult(`s3-tool-loop-${mode}`, { mode, turns, first, second })}`);
