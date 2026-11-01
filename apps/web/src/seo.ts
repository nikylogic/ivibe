// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect } from "react";

/**
 * What each page tells search engines and link previews. Pages set it here while they run, and
 * scripts/prerender.mjs copies the result into each page's static HTML at build time, so one
 * description serves both.
 */

export const SITE = "https://ivibe.tech";
const IMAGE = `${SITE}/og-light.png`;

export type PageMeta = {
  title: string;
  description: string;
  /** The page's path, such as /docs/install. */
  path: string;
  type?: "website" | "article";
  noindex?: boolean;
  jsonLd?: object[];
};

function setTag(selector: string, tag: string, attributes: Record<string, string>) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement(tag);
    document.head.appendChild(element);
  }
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
}

const setMeta = (name: string, content: string) =>
  setTag(`meta[name="${name}"]`, "meta", { name, content });
const setProperty = (property: string, content: string) =>
  setTag(`meta[property="${property}"]`, "meta", { property, content });

function apply(meta: PageMeta) {
  const url = `${SITE}${meta.path}`;
  document.title = meta.title;
  setMeta("description", meta.description);
  setTag('link[rel="canonical"]', "link", { rel: "canonical", href: url });
  setProperty("og:site_name", "iVibe");
  setProperty("og:type", meta.type ?? "website");
  setProperty("og:title", meta.title);
  setProperty("og:description", meta.description);
  setProperty("og:url", url);
  setProperty("og:image", IMAGE);
  setMeta("twitter:card", "summary_large_image");
  setMeta("twitter:title", meta.title);
  setMeta("twitter:description", meta.description);
  setMeta("twitter:image", IMAGE);

  document.head.querySelector('meta[name="robots"]')?.remove();
  if (meta.noindex) setMeta("robots", "noindex");

  document.getElementById("seo-json-ld")?.remove();
  if (meta.jsonLd?.length) {
    const script = document.createElement("script");
    script.id = "seo-json-ld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c");
    document.head.appendChild(script);
  }
}

export function usePageMeta(meta: PageMeta) {
  const key = JSON.stringify(meta);
  useEffect(() => {
    apply(JSON.parse(key) as PageMeta);
  }, [key]);
}

/** The trail shown in search results, such as iVibe > Docs > Install. */
export function breadcrumbs(...items: { name: string; path: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE}${item.path}`,
    })),
  };
}
