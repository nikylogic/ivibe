// SPDX-License-Identifier: AGPL-3.0-only

/* global document */

/**
 * Turns the built site into one real HTML file per page, for search engines and link previews.
 * It opens each page in Chrome, follows the site's own links to find them all, and saves:
 *
 *   - the page's own title, description, canonical and preview tags;
 *   - its text and links as plain HTML, hidden until the app replaces it a moment later, so visitors
 *     see no flash and the wrong theme never shows;
 *   - sitemap.xml, and 404.html for addresses that aren't pages.
 *
 * Each page is written as docs/install.html, because the host then serves it at /docs/install and
 * redirects any other spelling of that address. Stops the build if a page's tags are wrong.
 *
 * Run after `vite build`: node scripts/prerender.mjs
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { preview } from "vite";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(WEB, "dist");
const PORT = 4599;
const ORIGIN = `http://localhost:${PORT}`;
const SITE = "https://ivibe.tech";
const MISSING = "/__not-a-page__";
/** Pages nothing links to, but which still need their own file. */
const START = ["/", "/welcome", MISSING];
const MAX_DESCRIPTION = 165;

const HEAD_TAGS =
  /<(?:title>[^<]*<\/title>|meta\s[^>]*(?:name="(?:description|robots|twitter:[^"]*)"|property="og:[^"]*")[^>]*>)\s*/g;
const HIDE =
  "<style>[data-snapshot]{visibility:hidden}</style>" +
  "<noscript><style>[data-snapshot]{visibility:visible}</style></noscript>";

/** Runs in the page: its head tags, plus its content stripped down to plain semantic HTML. */
function capture() {
  const root = document.getElementById("root").cloneNode(true);
  root
    .querySelectorAll(
      'script, style, svg, canvas, noscript, iframe, input, select, textarea, [aria-hidden="true"], [role="radiogroup"]',
    )
    .forEach((element) => element.remove());
  // Wrappers go, with a space left behind so neighbouring words don't run together.
  root.querySelectorAll("div, span, button").forEach((element) => {
    element.replaceWith(" ", ...element.childNodes, " ");
  });
  root.querySelectorAll("*").forEach((element) => {
    for (const { name } of [...element.attributes]) {
      if (!["href", "alt", "datetime", "id", "aria-label"].includes(name))
        element.removeAttribute(name);
    }
  });
  const head = [
    ...document.head.querySelectorAll(
      'title, meta[name="description"], meta[name="robots"], meta[name^="twitter:"], meta[property^="og:"], link[rel="canonical"], script#seo-json-ld',
    ),
  ];
  return {
    head: head.map((element) => element.outerHTML).join("\n    "),
    body: root.innerHTML.replace(/\s+/g, " ").trim(),
    title: document.title,
    description: document.head.querySelector('meta[name="description"]')?.content ?? "",
    canonical: document.head.querySelector('link[rel="canonical"]')?.href ?? "",
    noindex: !!document.head.querySelector('meta[name="robots"]'),
    modified: JSON.parse(document.getElementById("seo-json-ld")?.textContent ?? "[]").find(
      (item) => item.dateModified,
    )?.dateModified,
    h1: root.querySelectorAll("h1").length,
    links: [...document.querySelectorAll("a[href]")].map((link) => link.href),
    // This page's own code, except the mascot's 3D scene, which comes in after the page shows.
    scripts: performance
      .getEntriesByType("resource")
      .map((entry) => new URL(entry.name).pathname)
      .filter((path) => path.endsWith(".js") && !path.includes("/scene-")),
  };
}

const template = await readFile(join(DIST, "index.html"), "utf8");
const server = await preview({
  root: WEB,
  configFile: false,
  appType: "spa",
  build: { outDir: "dist" },
  preview: { port: PORT, strictPort: true },
  logLevel: "error",
});
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ reducedMotion: "reduce" });
// Only the site itself: live data such as the latest version shouldn't be frozen into the HTML.
await context.route("**/*", (route) =>
  route.request().url().startsWith(ORIGIN) ? route.continue() : route.abort(),
);

const pages = new Map();
const queue = [...START];
const problems = [];
const browserPage = await context.newPage();
browserPage.on("pageerror", (error) => problems.push(`script error: ${error.message}`));

while (queue.length) {
  const path = queue.shift();
  if (pages.has(path)) continue;
  await browserPage.goto(`${ORIGIN}${path}`, { waitUntil: "load" });
  await browserPage.waitForSelector("h1");
  await browserPage.waitForTimeout(600);
  const page = await browserPage.evaluate(capture);
  pages.set(path, page);
  for (const href of page.links) {
    const url = new URL(href);
    if (url.origin === ORIGIN) queue.push(url.pathname.replace(/(.)\/+$/, "$1"));
  }
}
await browser.close();
await server.close();

// A wrong tag here costs search traffic silently, so it stops the build instead.
const seen = new Map();
for (const [path, page] of pages) {
  if (path === MISSING) {
    if (!page.noindex) problems.push("the not-found page isn't noindex");
    continue;
  }
  const want = `${SITE}${path}`;
  if (page.canonical !== want) problems.push(`${path}: canonical is ${page.canonical}`);
  if (page.h1 !== 1) problems.push(`${path}: ${page.h1} h1 tags`);
  if (!page.description) problems.push(`${path}: no description`);
  if (page.description.length > MAX_DESCRIPTION) {
    problems.push(`${path}: description is ${page.description.length} characters`);
  }
  for (const text of [page.title, page.description]) {
    if (seen.has(text)) problems.push(`${path} repeats "${text}" from ${seen.get(text)}`);
    seen.set(text, path);
  }
}
if (problems.length) {
  console.error(`Prerender found problems:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

/** Fetches a page's code alongside the HTML, not one layer of imports at a time. */
const preloads = (scripts) =>
  scripts
    .filter((script) => !template.includes(script))
    .map((script) => `<link rel="modulepreload" crossorigin href="${script}">\n    `)
    .join("");

for (const [path, page] of pages) {
  const html = template
    .replace(HEAD_TAGS, "")
    .replace("</head>", () => `  ${page.head}\n    ${preloads(page.scripts)}${HIDE}\n  </head>`)
    .replace(
      '<div id="root"></div>',
      () => `<div id="root"><div data-snapshot>${page.body}</div></div>`,
    );
  const file =
    path === "/" ? "index.html" : path === MISSING ? "404.html" : `${path.slice(1)}.html`;
  await mkdir(dirname(join(DIST, file)), { recursive: true });
  await writeFile(join(DIST, file), html);
}

// Only pages that know their real date say so: a build date on every page would teach search
// engines to ignore it.
const listed = [...pages]
  .filter(([, page]) => !page.noindex)
  .map(
    ([path, page]) =>
      `<loc>${SITE}${path}</loc>${page.modified ? `<lastmod>${page.modified}</lastmod>` : ""}`,
  );
await writeFile(
  join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${listed.map((entry) => `  <url>${entry}</url>`).join("\n")}
</urlset>
`,
);
console.log(`Prerendered ${pages.size} pages; ${listed.length} in the sitemap.`);
