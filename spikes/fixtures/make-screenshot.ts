// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Draws a synthetic bug screenshot (a form whose Save button fails, with DevTools open) for the
 * spikes that need an image. No real data, so it is safe to send with store:true.
 *
 * Run: node spikes/fixtures/make-screenshot.ts [out.png]
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";

const out = process.argv[2] ?? join(import.meta.dirname, "save-bug.png");
const canvas = createCanvas(1280, 720);
const c = canvas.getContext("2d");

// App pane.
c.fillStyle = "#f5f5f7";
c.fillRect(0, 0, 760, 720);
c.fillStyle = "#111";
c.font = "bold 28px sans-serif";
c.fillText("Edit profile", 48, 72);
c.font = "18px sans-serif";
for (const [i, [label, value]] of [
  ["Name", "Asha Rao"],
  ["Email", "asha@example.com"],
  ["Bio", "Building things on weekends"],
].entries()) {
  const y = 130 + i * 90;
  c.fillStyle = "#444";
  c.fillText(label!, 48, y);
  c.fillStyle = "#fff";
  c.fillRect(48, y + 12, 600, 44);
  c.strokeStyle = "#ccc";
  c.strokeRect(48, y + 12, 600, 44);
  c.fillStyle = "#111";
  c.fillText(value!, 60, y + 41);
}
c.fillStyle = "#4f46e5";
c.fillRect(48, 420, 140, 48);
c.fillStyle = "#fff";
c.font = "bold 18px sans-serif";
c.fillText("Save", 96, 451);
c.fillStyle = "#666";
c.font = "16px sans-serif";
c.fillText("(clicked 3 times, nothing happened)", 210, 450);

// DevTools pane.
c.fillStyle = "#1e1e1e";
c.fillRect(760, 0, 520, 720);
c.fillStyle = "#ccc";
c.font = "15px monospace";
c.fillText("Console", 780, 32);
c.fillStyle = "#f48771";
const lines = [
  "Uncaught (in promise) TypeError:",
  "  Cannot read properties of undefined",
  "  (reading 'map')",
  "    at saveProfile (ProfileForm.tsx:41:28)",
  "    at onClick (ProfileForm.tsx:67:9)",
];
lines.forEach((line, i) => c.fillText(line, 780, 80 + i * 24));
c.fillStyle = "#9cdcfe";
c.fillText("POST /api/profile  200  (48 ms)", 780, 230);
c.fillText('response: { "ok": true, "profile": {...} }', 780, 254);

writeFileSync(out, canvas.toBuffer("image/png"));
console.log(`Wrote ${out}`);
