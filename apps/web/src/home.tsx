// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@astryxdesign/core/Link";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { ChevronRight } from "lucide-react";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import type { MascotState } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { REPO, detectPlatform } from "./release.ts";
import type { Download, Platform, Release } from "./release.ts";
import { Showcase } from "./demo/index.tsx";
import { scrollToDemo } from "./demo/scroll.ts";
import { say, WORD_MS } from "./demo/voice.ts";
import { ivibeTheme } from "./theme.ts";
import { heroMascotSize, Nav } from "./nav.tsx";
import { Features } from "./features.tsx";
import { Faq, QUESTIONS } from "./faq.tsx";
import { Roadmap } from "./roadmap.tsx";
import { SITE, usePageMeta } from "./seo.ts";
import type { PageMeta } from "./seo.ts";
import { Pricing } from "./pricing.tsx";
import { DemoFilm, DEMO_FILM_JSON_LD } from "./demo-film.tsx";
import { Finale } from "./finale.tsx";
import { Footer } from "./footer.tsx";
import { appleIcon, linuxIcon, useRelease, windowsIcon } from "./release-ui.tsx";
import { TopBar } from "./top-bar.tsx";

/** What the headline says iVibe does, one mode at a time. */
const LINES = [
  { mode: "Fix" as const, text: "captures bugs as precise prompts" },
  { mode: "Prompt" as const, text: "turns rambling into clear prompts" },
  { mode: "Dictate" as const, text: "tidies up everything you say" },
];
/** How long each line stays, and how long it takes to leave. */
const LINE_MS = 3800;
const LEAVE_MS = 260;

/** A phone on its side: the hero has to fit without its second line. */
const SHORT = "@media (max-height: 479px)";
/** A phone held upright: the rotating line always takes two lines, and the headline can be larger. */
const PHONE = "@media (max-width: 559px)";
/** Large screens: what's under the headline grows in step with it (60, then 72, then 84 px). */
const LARGE = "@media (min-width: 1800px) and (min-height: 900px)";
const LARGEST = "@media (min-width: 2400px) and (min-height: 1200px)";

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-primary)",
  },
  // Floats over the hero's desktop and the demo card.
  hero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: { default: 24, [SHORT]: 12 },
    paddingInline: 16,
    paddingBottom: { default: 72, [SHORT]: 8 },
    textAlign: "center",
  },
  headline: {
    // heroMascotSize (nav.tsx) follows this too.
    fontSize: {
      default: "clamp(30px, min(2.4vw + 26px, 9.5vh), 84px)",
      [PHONE]: "clamp(30px, min(10.5vw, 9.5vh), 44px)",
    },
    lineHeight: 1.08,
    letterSpacing: "-0.015em",
    margin: 0,
  },
  firstLine: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  // The canvas has room around the toy for it to move; it is pulled in to sit like a word.
  mascot: {
    display: "inline-flex",
    width: "1.05em",
    height: "1.1em",
    alignItems: "center",
    justifyContent: "center",
    marginInlineStart: "0.04em",
    marginInlineEnd: "-0.06em",
    overflow: "visible",
  },
  // Holds the tallest line, so the page under it never moves as lines change.
  rotating: {
    display: "block",
    minHeight: { default: "1.1em", [PHONE]: "2.2em" },
    maxWidth: { default: "none", [PHONE]: "8.6em" },
    marginInline: "auto",
    textWrap: "balance",
    fontStyle: "italic",
    color: "var(--color-text-secondary)",
  },
  lineIn: { display: "inline-block" },
  // Each word resolves as the pill says it, like a live transcription.
  word: {
    display: "inline-block",
    animationName: "ivibe-word-in",
    animationDuration: "420ms",
    animationTimingFunction: "var(--motion-ease)",
    animationFillMode: "both",
  },
  lineOut: {
    display: "inline-block",
    animationName: "ivibe-line-out",
    animationDuration: `${LEAVE_MS}ms`,
    animationTimingFunction: "var(--motion-ease)",
    animationFillMode: "both",
  },
  // Everything under the headline, sized as one.
  lower: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: { default: 24, [SHORT]: 12 },
    zoom: { default: 1, [LARGE]: 1.2, [LARGEST]: 1.4 },
  },
  sub: { maxWidth: 640, textWrap: "balance" },
  subMore: { display: { default: "block", [SHORT]: "none", [PHONE]: "none" } },
  // Every button as wide as the widest.
  buttons: {
    display: "grid",
    gridAutoFlow: "column",
    gridAutoColumns: "1fr",
    gap: 12,
    width: "fit-content",
  },
});

const PLATFORM_BUTTONS: Record<
  Platform,
  { label: string; short: string; icon: ReactNode; pick: (release: Release) => Download }
> = {
  mac: {
    label: "Download for Mac",
    short: "Mac",
    icon: appleIcon,
    pick: (release) => release.macArm,
  },
  windows: {
    label: "Download for Windows",
    short: "Windows",
    icon: windowsIcon,
    pick: (release) => release.windows,
  },
  linux: {
    label: "Download for Linux",
    short: "Linux",
    icon: linuxIcon,
    pick: (release) => release.linuxAppImage,
  },
};

/** Cycles through LINES; each line rises in, waits, then rises out. */
function useRotatingLine(): { index: number; leaving: boolean } {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setLeaving(true);
      leaveTimer = setTimeout(() => {
        setIndex((current) => (current + 1) % LINES.length);
        setLeaving(false);
      }, LEAVE_MS);
    }, LINE_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(leaveTimer);
    };
  }, []);
  return { index, leaving };
}

/** How long the mascot's first hello stays shy beyond the app's, in seconds. */
const SHY_HOLD = 3.4;

/**
 * The mascot's first hello on the site, one feeling after another: shy (turned away, blushing,
 * peeking back), a smile, then it listens as if you were talking, thinks, and is pleased with the
 * result. Times are when each starts, in ms; after the last it simply idles.
 */
const HELLO: { at: number; state: MascotState }[] = [
  { at: 0, state: "shy" },
  { at: 8_200 + 1_400, state: "recording" },
  { at: 8_200 + 4_600, state: "writing" },
  { at: 8_200 + 6_400, state: "done" },
  { at: 8_200 + 8_400, state: "idle" },
];

/** Plays the first hello, unless the visitor prefers less motion. */
function useHello(): MascotState {
  const [state, setState] = useState<MascotState>("shy");
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers = HELLO.slice(1).map(({ at, state }) => setTimeout(() => setState(state), at));
    return () => timers.forEach(clearTimeout);
  }, []);
  return state;
}

/** A voice for the mascot to listen to while it plays at recording: phrases with soft gaps. */
function pretendVoice(listener: (rms: number) => void): () => void {
  let frame = 0;
  const tick = (time: number) => {
    const s = time / 1000;
    const phrase = 0.5 + 0.5 * Math.sin(s * 1.7);
    listener(0.004 + 0.03 * phrase * (0.6 + 0.4 * Math.abs(Math.sin(s * 7.3))));
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

function usePhoneWidth(): boolean {
  const query = "(max-width: 559px)";
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setPhone(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return phone;
}

/** The downloads, in the hero and again at the end of the page. */
function DownloadButtons({ release }: { release: Release }) {
  const detected = detectPlatform();
  const phone = usePhoneWidth();
  // The visitor's own platform first; Mac and Windows always show, and two fit on a phone.
  const order: Platform[] =
    detected === "linux"
      ? ["linux", "mac", "windows"]
      : detected === "windows"
        ? ["windows", "mac"]
        : ["mac", "windows"];
  return (
    <VStack gap={3} hAlign="center" className="touch-area">
      <div {...stylex.props(styles.buttons)}>
        {(phone ? order.slice(0, 2) : order).map((platform, position) => {
          const button = PLATFORM_BUTTONS[platform];
          return (
            <Button
              key={platform}
              label={phone ? button.short : button.label}
              aria-label={button.label}
              size="lg"
              variant={position === 0 ? "primary" : "secondary"}
              icon={button.icon}
              href={button.pick(release).url}
            />
          );
        })}
      </div>
      <Link href="/download" size="sm" color="secondary">
        Other platforms and versions
        <ChevronRight
          size={13}
          strokeWidth={1.75}
          style={{ display: "inline", verticalAlign: "-2px", marginInlineStart: 4 }}
        />
      </Link>
    </VStack>
  );
}

function Hero({ release }: { release: Release }) {
  const mascot = useHello();
  const { index, leaving } = useRotatingLine();
  const line = LINES[index]!;
  // Each new line is said aloud by the pill behind the hero while its words type in.
  useEffect(() => say(line.text, line.mode), [line]);

  return (
    <section {...stylex.props(styles.hero)}>
      <Heading level={1} xstyle={styles.headline}>
        <span {...stylex.props(styles.firstLine)}>
          iVibe
          {/* The navbar borrows this mascot as you scroll (nav.tsx). */}
          <span id="hero-mascot" {...stylex.props(styles.mascot)} aria-hidden="true">
            {/* A first hello: it blushes and glances away, then smiles back (scene.ts). */}
            <Mascot
              size={heroMascotSize()}
              state={mascot}
              shyHold={SHY_HOLD}
              onLevel={pretendVoice}
            />
          </span>
          , AI that{" "}
        </span>
        <span {...stylex.props(styles.rotating)}>
          <span
            key={index}
            {...stylex.props(leaving ? styles.lineOut : styles.lineIn)}
            aria-live="polite"
          >
            {line.text.split(" ").map((word, position, words) => (
              <span key={position}>
                <span
                  {...stylex.props(styles.word)}
                  style={{ animationDelay: `${position * WORD_MS}ms` }}
                >
                  {word}
                </span>
                {position < words.length - 1 ? " " : null}
              </span>
            ))}
          </span>
        </span>
      </Heading>

      <div {...stylex.props(styles.lower)}>
        <VStack gap={1} hAlign="center" xstyle={styles.sub}>
          <Text size="base">Show the bug, say what&apos;s wrong, paste the prompt.</Text>
          <Text size="base" color="secondary" xstyle={styles.subMore}>
            Screenshots that prove the bug, in Muse Code, Claude Code, Cursor or any app.
          </Text>
        </VStack>
        <DownloadButtons release={release} />
      </div>
    </section>
  );
}

/** What search engines read about the product. Every fact here is also shown on the page. */
const HOME_META: PageMeta = {
  title: "iVibe: voice dictation and bug prompts for coding agents",
  description:
    "Show a bug and say what's wrong: iVibe writes the prompt for your coding agent, with marked-up screenshots as proof. It also cleans up dictation in any app.",
  path: "/",
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "iVibe",
      url: SITE,
      image: `${SITE}/og-light.png`,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Windows, macOS, Linux",
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        {
          "@type": "Offer",
          name: "Pro",
          price: "8",
          priceCurrency: "USD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: "8",
            priceCurrency: "USD",
            unitCode: "MON",
          },
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "iVibe",
      url: SITE,
      logo: `${SITE}/icon-512.png`,
      email: "business@ivibe.tech",
      sameAs: [`https://github.com/${REPO}`],
    },
    DEMO_FILM_JSON_LD,
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: QUESTIONS.map(({ ask, answer }) => ({
        "@type": "Question",
        name: ask,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
};

export function Home({
  mode,
  onModeChange,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  usePageMeta(HOME_META);
  const [heroDark, setHeroDark] = useState(true);
  const release = useRelease();
  // Arriving from another page's "How it works": glide to the demo once the page is laid out.
  useEffect(() => {
    const { hash } = window.location;
    if (!hash) return;
    const timer = setTimeout(() => {
      if (hash === "#how") scrollToDemo();
      else document.getElementById(hash.slice(1))?.scrollIntoView();
    }, 300);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode={heroDark ? "dark" : mode}>
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <Nav page="home" mode={mode} onModeChange={onModeChange} />
      <main>
        <Showcase theme={mode} hero={<Hero release={release} />} onHeroDark={setHeroDark} />
        <Features />
        <Pricing />
        <Faq />
        <Roadmap />
        <DemoFilm />
        <Finale>
          <DownloadButtons release={release} />
        </Finale>
      </main>
      <Footer mode={mode} onModeChange={onModeChange} home />
    </div>
  );
}
