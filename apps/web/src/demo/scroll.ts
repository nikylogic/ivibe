// SPDX-License-Identifier: AGPL-3.0-only

/** How many screens of scrolling the demo runs for. */
export const RUN = 1.6;

/** Here so the navbar and footer can reach the demo without loading it on every other page. */
export function scrollToDemo(): void {
  const section = document.getElementById("modes");
  if (!section) return;
  const top = section.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + window.innerHeight * RUN, behavior: "smooth" });
}
