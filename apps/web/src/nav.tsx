// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { siGithub } from "simple-icons";
import { Download as DownloadIcon } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { Theme } from "@astryxdesign/core/theme";
import { Mascot } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import type { MascotState } from "../../desktop/src/renderer/shared/mascot/mascot.tsx";
import { scrollToDemo } from "./demo/index.tsx";
import { currentTone, onTone, TONES } from "./demo/voice.ts";
import type { Tone } from "./demo/voice.ts";
import { REPO } from "./release.ts";
import { ivibeTheme } from "./theme.ts";

/**
 * How far down the page the navbar opens: once the headline has mostly faded, so the mascot
 * lifts out of a dissolving title rather than leaving a gap in a sharp one.
 */
const openAt = () => window.innerHeight * 0.22;
/** The bar's height and the mascot's size in it. */
const BAR = 42;
const SLOT = 30;
/** The Download button's corner plus its gap to the edge, so the bar's corners follow the button's. */
const RADIUS = 17;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** The bar's own colour: the app's pill, the same in light and dark. */
const PILL = "rgba(15, 14, 13, 0.92)";

/** The headline mascot's size; the navbar's mascot renders at it, so the handoff stays crisp. */
export function heroMascotSize(): number {
  return Math.round(Math.min(98, Math.max(60, window.innerWidth * 0.068)));
}

type Phase = "away" | "landing" | "open" | "leaving";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const heroMascot = () => document.getElementById("hero-mascot");
const showHeroMascot = (shown: boolean) => {
  const element = heroMascot();
  if (element) element.style.visibility = shown ? "" : "hidden";
};

/** The move from the headline mascot's place to the navbar's, as a transform on the navbar's. */
function fromHero(slot: HTMLElement): string | null {
  const canvas = heroMascot()?.querySelector("canvas");
  const from = canvas?.getBoundingClientRect();
  const to = slot.getBoundingClientRect();
  if (!from || from.width === 0 || to.width === 0) return null;
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
}

function useNarrow(): boolean {
  const query = "(max-width: 640px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}

/**
 * The site's navbar is iVibe's pill. At the top of the page there is none: the mascot sits in
 * the headline. Scroll a little and the mascot leaves the headline and glides up into a small
 * dark capsule, which then opens sideways to show the links, the way the app's pill grows.
 * Scrolling back to the top sends the mascot home and folds the capsule away.
 *
 * The mascot is the logo and it is alive: it looks at the link under the pointer, peeks shyly
 * as the bar opens, and hops when clicked, back to the top. A short glowing line marks the
 * section you are in, in the colour of the mode on show.
 */
/** GitHub's official mark (Simple Icons), in the bar's text colour. */
export const githubMark = (
  <svg viewBox="0 0 24 24" width={17} height={17} fill="currentColor" aria-hidden="true">
    <path d={siGithub.path} />
  </svg>
);

/** Marks where you are: a short glowing line in the colour of the mode on show. */
function Here({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "30%",
        right: "30%",
        bottom: -3,
        height: 2,
        borderRadius: 999,
        background: `rgb(${TONES[tone]})`,
        boxShadow: `0 0 10px 1px rgba(${TONES[tone]}, 0.7)`,
        transition: "background 1.2s ease, box-shadow 1.2s ease",
      }}
    />
  );
}

export function Nav({ page }: { page: "home" | "download" | "legal" | "docs" }) {
  // Away from the home page there is no headline mascot to borrow: the bar is simply open.
  const pinned = page !== "home";
  const [want, setWant] = useState(() => pinned || window.scrollY > openAt());
  const [phase, setPhase] = useState<Phase>(want ? "open" : "away");
  const [mood, setMood] = useState<MascotState>("idle");
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  const [tone, setTone] = useState<Tone>(currentTone);
  // "How it works" is marked only until the features below the demo take over the screen.
  const [inDemo, setInDemo] = useState(true);
  const [size] = useState(heroMascotSize);
  const narrow = useNarrow();
  const slot = useRef<HTMLDivElement>(null);
  /** The open state the bar last moved to, so the handoff runs only on a real change. */
  const settled = useRef<boolean | null>(null);

  useEffect(() => onTone(setTone), []);

  // Open once the page has scrolled a little, close back at the top.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      setWant(pinned || window.scrollY > openAt());
      const next = document.getElementById("features");
      setInDemo(!next || next.getBoundingClientRect().top > window.innerHeight * 0.5);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // The handoff between the headline and the bar.
  useEffect(() => {
    const element = slot.current;
    if (!element) return;
    if (settled.current === null) {
      // On load: part way down the page, the mascot is simply in the bar already.
      settled.current = want;
      if (want) showHeroMascot(false);
      return;
    }
    if (settled.current === want) return;
    settled.current = want;
    const still = reduced();
    const timers: ReturnType<typeof setTimeout>[] = [];
    let flight: Animation | null = null;

    if (want) {
      setPhase("landing");
      const path = still ? null : fromHero(element);
      showHeroMascot(false);
      if (path) {
        flight = element.animate([{ transform: path }, { transform: "none" }], {
          duration: 640,
          easing: EASE,
        });
        // The capsule starts to open as the mascot lands.
        timers.push(setTimeout(() => setPhase("open"), 400));
      } else setPhase("open");
      // A shy little peek as it arrives, then back to idle.
      timers.push(setTimeout(() => setMood("shy"), still ? 0 : 520));
      timers.push(setTimeout(() => setMood("idle"), 5400));
    } else {
      setPhase("leaving");
      setGaze(null);
      // The capsule folds first, then the mascot flies home.
      timers.push(
        setTimeout(
          () => {
            const path = still ? null : fromHero(element);
            if (!path) {
              showHeroMascot(true);
              setPhase("away");
              return;
            }
            flight = element.animate([{ transform: "none" }, { transform: path }], {
              duration: 540,
              easing: EASE,
              fill: "forwards",
            });
            flight.finished.then(
              () => {
                showHeroMascot(true);
                element.style.visibility = "hidden";
                setPhase("away");
                flight?.cancel();
              },
              () => undefined,
            );
          },
          still ? 0 : 260,
        ),
      );
    }
    return () => {
      timers.forEach(clearTimeout);
      flight?.cancel();
    };
  }, [want]);

  // After a flight home the slot was hidden by hand; it shows again on the next landing.
  useEffect(() => {
    if (phase === "landing" && slot.current) slot.current.style.visibility = "";
  }, [phase]);

  const open = phase === "open";
  const shown = phase !== "away";

  /** Turns the mascot towards the link under the pointer. */
  const lookAt = (event: ReactPointerEvent<HTMLElement>) => {
    const mascot = slot.current?.getBoundingClientRect();
    if (!mascot) return;
    const box = event.currentTarget.getBoundingClientRect();
    const dx = box.left + box.width / 2 - (mascot.left + mascot.width / 2);
    setGaze({ x: Math.max(-3, Math.min(3, dx / 110)), y: 0.4 });
  };
  const lookAhead = () => setGaze(null);

  // The features below ask it to look at the tile under the pointer.
  useEffect(() => {
    const onLook = (event: Event) => {
      const at = (event as CustomEvent<{ x: number; y: number } | null>).detail;
      const mascot = slot.current?.getBoundingClientRect();
      if (!at || !mascot) return setGaze(null);
      const dx = at.x - (mascot.left + mascot.width / 2);
      const dy = at.y - (mascot.top + mascot.height / 2);
      setGaze({
        x: Math.max(-3, Math.min(3, dx / 160)),
        y: Math.max(-1.5, Math.min(1.5, dy / 260)),
      });
    };
    window.addEventListener("ivibe:look", onLook);
    return () => window.removeEventListener("ivibe:look", onLook);
  }, []);

  const hop = () => {
    setMood("done");
    window.setTimeout(() => setMood("idle"), 1900);
    if (pinned) window.location.href = "/";
    else window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
  };

  const links: {
    label: string;
    href?: string;
    onClick?: () => void;
    active?: boolean;
    icon?: ReactNode;
  }[] = [
    pinned
      ? { label: "How it works", href: "/#how" }
      : { label: "How it works", onClick: scrollToDemo, active: inDemo },
    pinned
      ? { label: "Pricing", href: "/#pricing" }
      : {
          label: "Pricing",
          onClick: () =>
            document
              .getElementById("pricing")
              ?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" }),
        },
    { label: "Docs", href: "/docs" },
    // Until the site has its own blog, the release notes are where the news is.
    { label: "Blog", href: `https://github.com/${REPO}/releases` },
    { label: "iVibe on GitHub", href: `https://github.com/${REPO}`, icon: githubMark },
  ];

  return (
    <nav
      aria-label="iVibe"
      style={{
        position: "fixed",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        height: BAR,
        pointerEvents: shown ? "auto" : "none",
      }}
    >
      <Theme theme={ivibeTheme} mode="dark">
        {/* The capsule: drawn behind the contents, opening out of the mascot's circle. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            filter: "drop-shadow(0 10px 24px rgba(0, 0, 0, 0.28))",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: RADIUS,
              background: `radial-gradient(60% 120% at 22% 120%, rgba(${TONES[tone]}, 0.16), transparent 70%), ${PILL}`,
              boxShadow:
                "inset 0 0 0 1px rgba(255, 255, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              clipPath: open
                ? `inset(0 0 0 0 round ${RADIUS}px)`
                : `inset(0 calc(100% - ${BAR}px) 0 0 round ${RADIUS}px)`,
              opacity: phase === "landing" || open ? 1 : 0,
              transition: `clip-path 520ms ${EASE}, opacity 280ms ease ${
                phase === "landing" ? "240ms" : phase === "leaving" ? "260ms" : "0ms"
              }, background 1.2s ease`,
            }}
          />
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 4,
            height: BAR,
            paddingLeft: (BAR - SLOT) / 2,
            paddingRight: 7,
          }}
        >
          {/* The mascot: the logo. Click it to go back to the top. */}
          <Link label="Back to the top" onClick={hop}>
            <div
              ref={slot}
              style={{
                position: "relative",
                width: SLOT,
                height: SLOT,
                transformOrigin: "0 0",
                visibility: shown ? "visible" : "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  transform: `scale(${SLOT / size})`,
                  transformOrigin: "0 0",
                }}
              >
                <Mascot size={size} state={mood} gaze={gaze} />
              </div>
            </div>
          </Link>

          {/* The links slide out of the mascot as the capsule opens. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              marginLeft: 6,
              opacity: open ? 1 : 0,
              transform: open ? "none" : "translateX(-14px)",
              transition: `opacity 300ms ease ${open ? "180ms" : "0ms"}, transform 420ms ${EASE} ${
                open ? "140ms" : "0ms"
              }`,
              pointerEvents: open ? "auto" : "none",
            }}
          >
            {!narrow &&
              links.map((link) => (
                <span
                  key={link.label}
                  style={{ position: "relative" }}
                  onPointerEnter={lookAt}
                  onPointerLeave={lookAhead}
                >
                  <Button
                    label={link.label}
                    variant="ghost"
                    size="sm"
                    href={link.href}
                    target={link.href?.startsWith("http") ? "_blank" : undefined}
                    rel={link.href?.startsWith("http") ? "noreferrer" : undefined}
                    onClick={link.onClick}
                    icon={link.icon}
                    isIconOnly={link.icon !== undefined}
                  />
                  {link.active && <Here tone={tone} />}
                </span>
              ))}
            {/* On the download page itself, the page is the download: no button. */}
            {page !== "download" && (
              <span
                style={{ marginLeft: narrow ? 0 : 6 }}
                onPointerEnter={lookAt}
                onPointerLeave={lookAhead}
              >
                <Button
                  label="Download"
                  variant="primary"
                  size="sm"
                  icon={<DownloadIcon size={15} strokeWidth={2} aria-hidden="true" />}
                  href="/download"
                />
              </span>
            )}
          </div>
        </div>
      </Theme>
    </nav>
  );
}
