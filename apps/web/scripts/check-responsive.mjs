// SPDX-License-Identifier: AGPL-3.0-only

/* global document, DOMMatrix, innerHeight, innerWidth, getComputedStyle, scrollTo */

/**
 * Checks the built site at the screen sizes people really use, because the demo and the navbar
 * lay themselves out in code, where no stylesheet review would catch a break. Fails if:
 *
 *   - a page scrolls sideways, or the navbar overlaps the theme switch;
 *   - the demo's modes or its Play button aren't fully on screen;
 *   - the desktop demo's scale makes its 12px window text smaller than 9px;
 *   - a control can't be tapped across 44px of height on a touch screen.
 *
 * Screenshots go to dist-responsive/, for looking at by eye.
 *
 * Run after `vite build` and scripts/prerender.mjs: node scripts/check-responsive.mjs
 */

import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { preview } from "vite";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(WEB, "dist-responsive");
const PORT = 4598;
const ORIGIN = `http://localhost:${PORT}`;
const RUN = 1.6;

const SIZES = [
  [320, 568],
  [360, 640],
  [390, 844],
  [430, 932],
  [568, 320],
  [844, 390],
  [768, 1024],
  [900, 600],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
];
const PAGES = [
  "/docs",
  "/docs/install",
  "/download",
  "/blog",
  "/blog/from-its-broken-to-proof",
  "/privacy",
  "/voice-to-prompt",
  "/compare/wispr-flow",
];
/** The smallest window text the desktop demo may show, and the size it's drawn at. */
const MIN_TEXT = 9;
const STAGE_TEXT = 12;
const MIN_STORY_TEXT = 14;
const HEADLINE_LINES = [
  "captures bugs as precise prompts",
  "turns rambling into clear prompts",
  "tidies up everything you say",
];

/** Runs in the page: whether a control's middle can be tapped 22px above and below. */
function tapProblems(selector) {
  const problems = [];
  for (const element of document.querySelectorAll(selector)) {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height || getComputedStyle(element).visibility === "hidden") continue;
    if (box.top < 30 || box.bottom > innerHeight - 30) continue;
    if (box.left < 0 || box.right > innerWidth) continue;
    const x = box.left + box.width / 2;
    const middle = box.top + box.height / 2;
    const hit = (y) => {
      const found = document.elementFromPoint(x, y);
      return !!found && (found === element || element.contains(found) || found.contains(element));
    };
    if (!hit(middle - 21) || !hit(middle + 21)) {
      problems.push(
        `${element.tagName} "${(element.innerText || element.getAttribute("aria-label") || "").slice(0, 24)}"`,
      );
    }
  }
  return problems;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const server = await preview({
  root: WEB,
  configFile: false,
  appType: "mpa",
  build: { outDir: "dist" },
  preview: { port: PORT, strictPort: true },
  logLevel: "error",
});
const browser = await chromium.launch({ channel: "chrome" });
const problems = [];

for (const [width, height] of SIZES) {
  const label = `${width}x${height}`;
  const touch = width < 1100;
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: "reduce",
  });
  // Only the site: GitHub's answer would change the buttons between runs.
  await context.route("**/*", (route) =>
    route.request().url().startsWith(ORIGIN) ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  const fail = (message) => problems.push(`${label}: ${message}`);

  for (const path of PAGES) {
    await page.goto(`${ORIGIN}${path}`);
    await page.waitForSelector("h1");
    await page.waitForTimeout(150);
    const extra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (extra > 0) fail(`${path} scrolls sideways by ${extra}px`);
    if (touch) {
      await page.waitForTimeout(150);
      const taps = await page.evaluate(tapProblems, "nav a, nav button, aside a");
      for (const tap of taps) fail(`${path}: ${tap} is too small to tap`);
    }
  }

  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector("h1");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${label}-hero.png`) });
  // The hero's buttons match, and each rotating line takes the same room, so nothing jumps.
  const uneven = await page.evaluate((lines) => {
    const hero = document.querySelector("h1").closest("section");
    const sizes = [
      ...hero.querySelectorAll(
        'a[href*="github"], a[href*="releases"], a[aria-label^="Download for"]',
      ),
    ]
      .map((button) => button.getBoundingClientRect())
      .map((box) => `${Math.round(box.width)}x${Math.round(box.height)}`);
    const problems = [];
    if (sizes.length < 2 || new Set(sizes).size > 1) problems.push(`buttons ${sizes.join(", ")}`);
    const rotating = document.querySelector("h1").lastElementChild;
    const line = rotating.firstElementChild;
    const before = line.innerHTML;
    const heights = lines.map((text) => {
      line.textContent = text;
      return Math.round(rotating.getBoundingClientRect().height);
    });
    line.innerHTML = before;
    if (new Set(heights).size > 1) problems.push(`rotating line heights ${heights.join(", ")}`);
    return problems;
  }, HEADLINE_LINES);
  for (const problem of uneven) fail(`hero: ${problem}`);
  // On an upright phone the letters part around the text.
  const behindText = await page.evaluate(() => {
    if (innerWidth >= 700 || innerHeight <= innerWidth) return 0;
    const hero = document.querySelector("h1").closest("section");
    const top = hero.firstElementChild.getBoundingClientRect().top;
    const bottom = hero.lastElementChild.getBoundingClientRect().bottom;
    const canvas = document.querySelector("#modes canvas");
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    const pixels = canvas
      .getContext("2d")
      .getImageData(
        0,
        Math.round(top * ratio),
        canvas.width,
        Math.round((bottom - top) * ratio),
      ).data;
    let inked = 0;
    for (let at = 3; at < pixels.length; at += 4) if (pixels[at] > 0) inked += 1;
    return inked;
  });
  if (behindText) fail(`hero: letters behind the text (${behindText} pixels)`);
  const clipped = await page.evaluate(() => {
    const hero = document.querySelector("h1").closest("section");
    const box = hero.getBoundingClientRect();
    return box.top < 0 || box.bottom > innerHeight;
  });
  if (clipped) fail("the hero doesn't fit on screen");
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
    fail("the home page scrolls sideways");
  }

  await page.evaluate((run) => {
    const section = document.getElementById("modes");
    scrollTo(0, section.getBoundingClientRect().top + innerHeight * run);
  }, RUN);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${label}-card.png`) });

  const overlap = await page.evaluate(() => {
    const bar = document.querySelector('nav[aria-label="iVibe"]')?.getBoundingClientRect();
    const theme = document.querySelector('header [role="radiogroup"]')?.getBoundingClientRect();
    return !!bar && !!theme && theme.width > 0 && theme.left < bar.right && theme.right > bar.left;
  });
  if (overlap) fail("the theme switch overlaps the navbar");

  const play = page.getByRole("button", { name: /Play demo/ });
  const offScreen = (box) =>
    !box || box.x < 0 || box.y < 0 || box.x + box.width > width || box.y + box.height > height;
  if (offScreen(await play.boundingBox())) fail("Play isn't fully on screen");
  await play.click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `${label}-playing.png`) });

  const modes = page.getByRole("radiogroup", { name: "Mode" });
  if (offScreen(await modes.boundingBox())) fail("the modes aren't fully on screen");

  const scale = await page.evaluate(() => {
    // A story's desktop is only a backdrop.
    if (document.querySelector('#modes [aria-current="step"]')) return null;
    const world = document.querySelector('#modes [data-world="desktop"]');
    return world ? new DOMMatrix(getComputedStyle(world).transform).a : null;
  });
  if (scale !== null && scale * STAGE_TEXT < MIN_TEXT) {
    fail(`the desktop demo's window text is ${(scale * STAGE_TEXT).toFixed(1)}px`);
  }
  if (touch) {
    const taps = await page.evaluate(tapProblems, '#modes [role="radio"], nav a, nav button');
    for (const tap of taps) fail(`demo: ${tap} is too small to tap`);
  }

  // Every step of every mode, if this size tells the story.
  const dots = page.locator('#modes button[aria-label^="Step "]');
  if (await dots.count()) {
    for (const mode of ["Fix", "Prompt", "Dictate"]) {
      await modes.getByRole("radio", { name: mode }).click();
      for (const step of [0, 1, 2]) {
        await dots.nth(step).click();
        await page.waitForTimeout(150);
        await page.screenshot({ path: join(OUT, `${label}-${mode}-${step + 1}.png`) });
        if (offScreen(await dots.nth(step).boundingBox()))
          fail(`${mode} ${step + 1}: dots off screen`);
        const faint = await page.evaluate(() => {
          let opacity = 1;
          for (let at = document.querySelector("#modes [aria-live]"); at; at = at.parentElement) {
            opacity *= parseFloat(getComputedStyle(at).opacity);
          }
          return opacity < 0.9;
        });
        if (faint) fail(`${mode} ${step + 1}: the step isn't showing`);
        const small = await page.evaluate((least) => {
          const box = document.querySelector("#modes [aria-live]").parentElement;
          return [...box.querySelectorAll("div")]
            .filter((element) => element.childElementCount === 0 && element.textContent.trim())
            .filter((element) => parseFloat(getComputedStyle(element).fontSize) < least)
            .map((element) => element.textContent.slice(0, 24));
        }, MIN_STORY_TEXT);
        for (const text of small) fail(`${mode} ${step + 1}: "${text}" is too small`);
      }
    }
  }
  await context.close();
}

await browser.close();
await server.close();

if (problems.length) {
  console.error(`${problems.length} problems:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`All ${SIZES.length} screen sizes pass. Screenshots are in dist-responsive/.`);
process.exit(0);
