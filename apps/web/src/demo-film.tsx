// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Play } from "lucide-react";
import { SITE } from "./seo.ts";

/**
 * The demo film. Only a still from the film loads with the page; YouTube is reached when someone
 * presses play, because the site promises no tracking until then.
 */

const VIDEO_ID = "BAL_gg1cgf8";
const WATCH_URL = `https://youtu.be/${VIDEO_ID}`;
const EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`;
const POSTER = "/demo-poster.webp";
const TITLE = "iVibe demo film";
const DESCRIPTION = "One bug, from broken to fixed.";

/** What search engines read about the film. */
export const DEMO_FILM_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  name: TITLE,
  description: DESCRIPTION,
  thumbnailUrl: `${SITE}${POSTER}`,
  uploadDate: "2026-11-04",
  duration: "PT2M16S",
  contentUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  embedUrl: EMBED_URL,
};

const styles = stylex.create({
  section: {
    backgroundColor:
      "color-mix(in srgb, var(--color-text-primary) 3%, var(--color-background-surface))",
    paddingBlock: { default: 120, "@media (max-width: 900px)": 72 },
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
  },
  inner: {
    maxWidth: 1040,
    marginInline: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 32,
  },
  words: { display: "flex", flexDirection: "column", gap: 12 },
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: "clamp(36px, 4vw, 52px)",
    fontWeight: 400,
    lineHeight: 1.04,
    letterSpacing: "-0.01em",
    margin: 0,
  },
  screen: {
    position: "relative",
    aspectRatio: "16 / 9",
    width: "100%",
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#0f0e0d",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "color-mix(in srgb, var(--color-text-primary) 12%, transparent)",
  },
  fill: {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    borderWidth: 0,
    padding: 0,
    objectFit: "cover",
  },
  press: { cursor: "pointer", backgroundColor: "transparent" },
  play: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: { default: 76, "@media (max-width: 640px)": 56 },
    height: { default: 76, "@media (max-width: 640px)": 56 },
    marginTop: { default: -38, "@media (max-width: 640px)": -28 },
    marginLeft: { default: -38, "@media (max-width: 640px)": -28 },
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    color: "#0f0e0d",
    backgroundColor: "#fff",
    boxShadow: "0 8px 28px rgba(15, 14, 13, 0.35)",
  },
});

export function DemoFilm() {
  const [playing, setPlaying] = useState(false);
  return (
    <section id="film" aria-label="Demo film" {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.inner)}>
        <div {...stylex.props(styles.words)}>
          <Heading level={2} xstyle={styles.title}>
            See it in two minutes.
          </Heading>
          <Text size="lg" color="secondary">
            {DESCRIPTION} Made for the Meta Global AI Developer Hackathon.
          </Text>
        </div>
        <div {...stylex.props(styles.screen)}>
          {playing ? (
            <iframe
              {...stylex.props(styles.fill)}
              src={`${EMBED_URL}?autoplay=1&rel=0`}
              title={TITLE}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button
              type="button"
              aria-label="Play the iVibe demo film"
              onClick={() => setPlaying(true)}
              {...stylex.props(styles.fill, styles.press)}
            >
              <img
                src={POSTER}
                alt=""
                width={1280}
                height={720}
                loading="lazy"
                {...stylex.props(styles.fill)}
              />
              <span {...stylex.props(styles.play)}>
                <Play size={28} fill="currentColor" strokeWidth={0} />
              </span>
            </button>
          )}
        </div>
        <div>
          <Link href={WATCH_URL} size="sm" color="secondary">
            Watch on YouTube
          </Link>
        </div>
      </div>
    </section>
  );
}
