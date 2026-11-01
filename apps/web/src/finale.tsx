// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import type { MascotState } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { AsciiWave } from "./demo/ascii-wave.tsx";
import type { Camera } from "./demo/ascii-wave.tsx";
import { scrollToDemo } from "./demo/index.tsx";
import { Awake } from "./pricing.tsx";
import { REPO } from "./release.ts";
import { ivibeTheme } from "./theme.ts";
import { ThemeSwitch } from "./theme-switch.tsx";

/**
 * The page began inside the pill, and it ends by going back in. A small pill, listening, opens as
 * you scroll until it nearly fills the screen: the hero's waveform, and one invitation. With
 * reduced motion it is simply open.
 */

const PILL = { width: 132, height: 48 };
const MARGIN = 12;
const RADIUS = 28;
/** The waveform's size in pill units, as the hero's camera frames it. */
const WAVE = { width: 62.5, height: 36 };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
const smooth = (value: number, from: number, to: number) => {
  const amount = clamp01((value - from) / (to - from));
  return amount * amount * (3 - 2 * amount);
};

const styles = stylex.create({
  section: { position: "relative", height: "190svh" },
  sectionStill: { height: "100svh" },
  sticky: { position: "sticky", top: 0, height: "100svh", overflow: "hidden" },
  stage: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#0f0e0d",
    willChange: "clip-path",
  },
  // The eye goes to the buttons; the waveform stays around them.
  quiet: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    backgroundImage:
      "radial-gradient(ellipse 40% 44% at 50% 50%, rgba(15, 14, 13, 0.9) 0%, rgba(15, 14, 13, 0.7) 55%, transparent 100%)",
  },
  listening: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  words: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingInline: 24,
    textAlign: "center",
  },
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: "clamp(40px, 5vw, 68px)",
    fontWeight: 400,
    lineHeight: 1.04,
    letterSpacing: "-0.015em",
    margin: 0,
  },
  footer: {
    backgroundColor: "var(--color-background-surface)",
    paddingTop: { default: 56, "@media (max-width: 720px)": 40 },
    paddingBottom: 28,
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
  },
  footerInner: {
    maxWidth: 1040,
    marginInline: "auto",
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) auto auto auto",
      "@media (max-width: 720px)": "minmax(0, 1fr) minmax(0, 1fr)",
    },
    columnGap: 64,
    rowGap: 32,
    alignItems: "start",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    gridColumn: { default: "auto", "@media (max-width: 720px)": "1 / -1" },
  },
  links: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 },
  fine: {
    maxWidth: 1040,
    marginInline: "auto",
    marginTop: 40,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  fineLinks: { display: "flex", flexWrap: "wrap", gap: 16 },
});

export function Finale({ children }: { children: ReactNode }) {
  const [still] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const section = useRef<HTMLElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const listening = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, k: 1, p: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  // The waveform and the mascot only exist once the section is close.
  const [near, setNear] = useState(false);
  const [mood, setMood] = useState<MascotState>("idle");
  const greeted = useRef(false);

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const watch = new IntersectionObserver(([entry]) => setNear(!!entry?.isIntersecting), {
      rootMargin: "100% 0px",
    });
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    const element = sticky.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      camera.current = {
        x: width / 2,
        y: height / 2,
        k: Math.max((width * 0.92) / WAVE.width, (height * 1.08) / WAVE.height),
        p: 0,
      };
      setSize({ width, height });
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let shown = still ? 1 : 0;
    let last = 0;
    let timer = 0;

    const draw = (p: number) => {
      const box = sticky.current;
      if (!box || !stage.current || !words.current || !listening.current) return;
      const open = smooth(p, 0, 0.8);
      const top = mix((box.clientHeight - PILL.height) / 2, MARGIN, open);
      const left = mix((box.clientWidth - PILL.width) / 2, MARGIN, open);
      const radius = mix(PILL.height / 2, RADIUS, open);
      stage.current.style.clipPath = `inset(${top}px ${left}px round ${radius}px)`;
      listening.current.style.opacity = String(1 - smooth(p, 0.04, 0.26));
      const reveal = smooth(p, 0.5, 0.86);
      words.current.style.opacity = String(reveal);
      words.current.style.transform = `translateY(${(1 - reveal) * 14}px)`;
      words.current.style.visibility = reveal <= 0 ? "hidden" : "visible";
      if (reveal > 0.6 && !greeted.current) {
        // It notices you, and is pleased.
        greeted.current = true;
        setMood("done");
        timer = window.setTimeout(() => setMood("idle"), 2400);
      }
    };

    const target = () => {
      const element = section.current;
      if (!element) return 0;
      const box = element.getBoundingClientRect();
      const run = box.height - window.innerHeight;
      return run > 0 ? clamp01(-box.top / run) : 1;
    };
    const tick = (time: number) => {
      const dt = last ? Math.min(100, time - last) / 1000 : 0.016;
      last = time;
      const want = target();
      shown += (want - shown) * (1 - Math.exp(-dt * 11));
      if (Math.abs(want - shown) < 0.0005) shown = want;
      draw(shown);
      raf = shown === want ? 0 : requestAnimationFrame(tick);
      if (!raf) last = 0;
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    draw(shown);
    if (still) {
      const again = () => draw(1);
      window.addEventListener("resize", again);
      return () => {
        window.removeEventListener("resize", again);
        window.clearTimeout(timer);
      };
    }
    wake();
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    return () => {
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [still, size]);

  return (
    <section
      ref={section}
      id="get"
      aria-label="Download iVibe"
      {...stylex.props(styles.section, still && styles.sectionStill)}
    >
      <div ref={sticky} {...stylex.props(styles.sticky)}>
        <div ref={stage} {...stylex.props(styles.stage)}>
          {near && size.width > 0 && (
            <AsciiWave camera={camera} width={size.width} height={size.height} />
          )}
          <div {...stylex.props(styles.quiet)} />
          <div ref={listening} aria-hidden="true" {...stylex.props(styles.listening)}>
            <Awake />
          </div>
          <Theme theme={ivibeTheme} mode="dark">
            <div ref={words} {...stylex.props(styles.words)}>
              {near && <Mascot size={92} state={mood} />}
              <Heading level={2} xstyle={styles.title}>
                Now say something.
              </Heading>
              {children}
            </div>
          </Theme>
        </div>
      </div>
    </section>
  );
}

export function Footer({
  mode,
  onModeChange,
  home = false,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
  /** Only the home page's switch has left the top of the screen by the time you get here. */
  home?: boolean;
}) {
  const github = `https://github.com/${REPO}`;
  return (
    <footer {...stylex.props(styles.footer)}>
      <div {...stylex.props(styles.footerInner)}>
        <div {...stylex.props(styles.brand)}>
          <Mascot size={40} state="idle" />
          <div>
            <Text weight="medium">iVibe</Text>
            <br />
            <Text size="sm" color="secondary">
              Made in the open.
            </Text>
          </div>
        </div>
        <nav aria-label="Product" {...stylex.props(styles.links)}>
          {home ? (
            <Link size="sm" onClick={scrollToDemo}>
              How it works
            </Link>
          ) : (
            <Link href="/#how" size="sm">
              How it works
            </Link>
          )}
          <Link href={home ? "#pricing" : "/#pricing"} size="sm">
            Pricing
          </Link>
          <Link href="/docs" size="sm">
            Docs
          </Link>
          <Link href="/blog" size="sm">
            Blog
          </Link>
          <Link href={`${github}/releases`} size="sm">
            Changelog
          </Link>
          <Link href="/download" size="sm">
            Download
          </Link>
        </nav>
        <nav aria-label="Community" {...stylex.props(styles.links)}>
          <Link href={github} size="sm">
            GitHub
          </Link>
          <Link href={`${github}/discussions`} size="sm">
            Suggest a feature
          </Link>
          <Link href="mailto:business@ivibe.tech" size="sm">
            business@ivibe.tech
          </Link>
        </nav>
        {home && <ThemeSwitch mode={mode} onModeChange={onModeChange} />}
      </div>
      <div {...stylex.props(styles.fine)}>
        <Text size="sm" color="secondary">
          © 2026 iVibe. Open source under AGPL-3.0.
        </Text>
        <nav aria-label="Legal" {...stylex.props(styles.fineLinks)}>
          <Link href="/privacy" size="sm">
            Privacy
          </Link>
          <Link href="/terms" size="sm">
            Terms
          </Link>
          <Link href="/refunds" size="sm">
            Refunds
          </Link>
        </nav>
      </div>
    </footer>
  );
}
