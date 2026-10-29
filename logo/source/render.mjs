// SPDX-License-Identifier: AGPL-3.0-only
// Renders the logo PNGs for build.py: `electron render.mjs jobs.json`. Each job is either an SVG
// drawn at an exact pixel size, or a card (mascot, wordmark and tagline) drawn on a canvas with
// the app's Instrument Serif. Canvas output is exact, whatever the screen's scale.
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow } from "electron";

const { jobs, fonts } = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], "utf8"));
const dataUrl = (file) => `data:image/svg+xml;base64,${fs.readFileSync(file).toString("base64")}`;
const font = (name) => fs.readFileSync(path.join(fonts, name)).toString("base64");

// Runs in the page: draws one job and returns it as a PNG data URL.
const page = `
const image = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});
window.draw = async (job) => {
  const canvas = document.createElement("canvas");
  canvas.width = job.w;
  canvas.height = job.h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  if (!job.card) {
    ctx.drawImage(await image(job.svg), 0, 0, job.w, job.h);
    return canvas.toDataURL("image/png");
  }
  if (job.bg) {
    ctx.fillStyle = job.bg;
    ctx.fillRect(0, 0, job.w, job.h);
  }
  // Stacked: the mascot over "iVibe Pro", the group centred in the square.
  if (job.stack) {
    const m = job.w * 0.5;
    const word = Math.round(job.w * 0.15);
    ctx.font = word + 'px "Instrument Serif"';
    const name = ctx.measureText("iVibe ").width;
    ctx.font = "italic " + word + 'px "Instrument Serif"';
    const width = name + ctx.measureText("Pro").width;
    const gap = m * 0.08;
    const top = (job.h - (m + gap + word * 0.8)) / 2;
    ctx.drawImage(await image(job.mascot), (job.w - m) / 2, top, m, m);
    const x = (job.w - width) / 2;
    const y = top + m + gap + word * 0.8;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = job.text;
    ctx.font = word + 'px "Instrument Serif"';
    ctx.fillText("iVibe ", x, y);
    ctx.fillStyle = job.secondary;
    ctx.font = "italic " + word + 'px "Instrument Serif"';
    ctx.fillText("Pro", x + name, y);
    return canvas.toDataURL("image/png");
  }
  // The mascot, then the wordmark and tagline beside it, the group centred in the card.
  const m = Math.min(job.h * 0.74, job.w * 0.42);
  const word = Math.round(m * 0.36);
  const line = Math.round(word * 0.42);
  ctx.font = word + 'px "Instrument Serif"';
  let textWidth = ctx.measureText("iVibe").width;
  if (job.tagline) {
    ctx.font = line + 'px "Instrument Serif"';
    textWidth = Math.max(textWidth, ctx.measureText("Show the bug.").width);
    ctx.font = "italic " + line + 'px "Instrument Serif"';
    textWidth = Math.max(textWidth, ctx.measureText("We\\u2019ll write the prompt.").width);
  }
  const gap = m * 0.06;
  const left = (job.w - (m + gap + textWidth)) / 2;
  ctx.drawImage(await image(job.mascot), left, (job.h - m) / 2, m, m);
  const x = left + m + gap;
  const block = job.tagline ? word * 0.9 + line * 2.5 : word * 0.8;
  let y = (job.h - block) / 2 + word * 0.8;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = job.text;
  ctx.font = word + 'px "Instrument Serif"';
  ctx.fillText("iVibe", x, y);
  if (job.tagline) {
    y += line * 1.35;
    ctx.font = line + 'px "Instrument Serif"';
    ctx.fillText("Show the bug.", x, y);
    y += line * 1.15;
    ctx.fillStyle = job.secondary;
    ctx.font = "italic " + line + 'px "Instrument Serif"';
    ctx.fillText("We\\u2019ll write the prompt.", x, y);
  }
  return canvas.toDataURL("image/png");
};
// Nothing to hand back: a function can't be sent to the main process.
undefined;
`;

async function main() {
  const window = new BrowserWindow({ show: false });
  await window.loadURL("about:blank");
  await window.webContents.executeJavaScript(`
    (async () => {
      const faces = [
        new FontFace("Instrument Serif", "url(data:font/woff2;base64,${font("instrument-serif-latin-400-normal.woff2")})"),
        new FontFace("Instrument Serif", "url(data:font/woff2;base64,${font("instrument-serif-latin-400-italic.woff2")})", { style: "italic" }),
      ];
      for (const face of faces) document.fonts.add(await face.load());
    })()
  `);
  await window.webContents.executeJavaScript(page);
  for (const job of jobs) {
    const spec = { ...job };
    if (job.svg) spec.svg = dataUrl(job.svg);
    if (job.mascot) spec.mascot = dataUrl(job.mascot);
    const url = await window.webContents.executeJavaScript(`draw(${JSON.stringify(spec)})`);
    fs.mkdirSync(path.dirname(job.out), { recursive: true });
    fs.writeFileSync(job.out, Buffer.from(url.split(",")[1], "base64"));
  }
}

app
  .whenReady()
  .then(main)
  .then(
    () => app.quit(),
    (error) => {
      console.error(error);
      app.exit(1);
    },
  );
