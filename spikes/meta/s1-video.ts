// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Spike S1 (and S2): how does muse-spark-1.3 read an MP4, and what does it cost?
 * Use a 30–60 s screen recording with a visible clock or burned-in timestamps (S2).
 *
 * Run: pnpm spike spikes/meta/s1-video.ts path/to/clip.mp4
 */

import { deleteFile, outputText, postJson, requireArg, saveResult, uploadFile } from "./_client.ts";
import type { ResponsesResult } from "./_client.ts";

const clip = requireArg(0, "pnpm spike spikes/meta/s1-video.ts <clip.mp4>");

const started = Date.now();
const file = await uploadFile(clip, "video/mp4");
console.log(`Uploaded ${clip} as ${file.id} in ${Date.now() - started} ms`);

try {
  const t0 = Date.now();
  const response = await postJson<ResponsesResult>("/responses", {
    model: "muse-spark-1.3",
    store: false,
    input: [
      {
        role: "user",
        content: [
          { type: "input_video", file_id: file.id },
          {
            type: "input_text",
            text:
              "List every visible change in this screen recording as `mm:ss.s — what changed`. " +
              "Then state: how many distinct frames you could see, the video's length as you " +
              "perceived it, and any on-screen text that looks like an error, copied exactly.",
          },
        ],
      },
    ],
  });

  console.log(`\nModel answer (${Date.now() - t0} ms):\n${outputText(response)}`);
  console.log("\nUsage:", JSON.stringify(response.usage, null, 2));
  console.log(`\nSaved: ${saveResult("s1-video", response)}`);
} finally {
  await deleteFile(file.id);
}
