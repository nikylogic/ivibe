// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef } from "react";
import type { MascotScene, MascotState } from "./scene.ts";

/** How long it keeps watching the pointer after you hover off it or click it, in ms. */
const FOLLOW_MS = 4000;

/**
 * The 3D mascot. three.js is loaded only when this first mounts, so it never slows the app's
 * start; until then (or without WebGL) the space is simply kept empty.
 */
export function Mascot({
  size,
  state = "idle",
  onLevel,
}: {
  size: number;
  state?: MascotState;
  /** Voice levels, while recording. */
  onLevel?: (listener: (rms: number) => void) => () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<MascotScene | null>(null);
  const latest = useRef({ size, state });
  latest.current = { size, state };

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import("./scene.ts").then(({ MascotScene }) => {
      const element = canvas.current;
      if (disposed || !element) return;
      let made: MascotScene;
      try {
        made = new MascotScene(element);
      } catch {
        return; // No WebGL: the space stays empty.
      }
      scene.current = made;
      made.setSize(latest.current.size);
      made.setState(latest.current.state);

      // It watches the pointer only while you hover it, and for a little while after you hover
      // off or click it; then it looks ahead again on its own.
      let hovering = false;
      let followUntil = 0;
      let release: ReturnType<typeof setTimeout> | undefined;
      const follow = () => {
        followUntil = performance.now() + FOLLOW_MS;
        clearTimeout(release);
        release = setTimeout(() => {
          if (!hovering) made.lookAt(0, 0);
        }, FOLLOW_MS);
      };
      const onEnter = () => {
        hovering = true;
      };
      const onLeave = () => {
        hovering = false;
        follow();
      };
      const onMove = (event: PointerEvent) => {
        if (!hovering && performance.now() > followUntil) return;
        const box = element.getBoundingClientRect();
        const x = (event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2);
        const y = (event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2);
        made.lookAt(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
      };
      let onScreen = true;
      const update = () => made.setVisible(onScreen && document.visibilityState === "visible");
      const observer = new IntersectionObserver(([entry]) => {
        onScreen = entry?.isIntersecting ?? true;
        update();
      });
      observer.observe(element);
      document.addEventListener("visibilitychange", update);
      window.addEventListener("pointermove", onMove);
      element.addEventListener("pointerenter", onEnter);
      element.addEventListener("pointerleave", onLeave);
      element.addEventListener("pointerdown", follow);
      cleanup = () => {
        clearTimeout(release);
        element.removeEventListener("pointerenter", onEnter);
        element.removeEventListener("pointerleave", onLeave);
        element.removeEventListener("pointerdown", follow);
        observer.disconnect();
        document.removeEventListener("visibilitychange", update);
        window.removeEventListener("pointermove", onMove);
        made.dispose();
        scene.current = null;
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => scene.current?.setSize(size), [size]);
  useEffect(() => scene.current?.setState(state), [state]);
  useEffect(() => {
    if (!onLevel || state !== "recording") return;
    return onLevel((rms) => scene.current?.setLevel(rms));
  }, [onLevel, state]);

  return (
    <canvas ref={canvas} aria-hidden style={{ width: size, height: size, display: "block" }} />
  );
}

export type { MascotState };
