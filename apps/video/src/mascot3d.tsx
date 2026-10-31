// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef, useState } from "react";
import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { MascotScene } from "../../desktop/src/renderer/shared/mascot/scene.ts";
import type { MascotState } from "../../desktop/src/renderer/shared/mascot/scene.ts";

export interface MascotCue {
  state: MascotState;
  /** Where it looks, -1 to 1 across the frame. */
  look?: { x: number; y: number };
  /** Blink on this frame. */
  blink?: boolean;
}

/**
 * The app's real 3D mascot (desktop/src/renderer/shared/mascot/scene.ts), driven frame by frame:
 * `cue` says what it does on each frame of this sequence. Its springs carry over from frame to
 * frame, so the video renders with one browser tab, in order (remotion.config.ts).
 */
export function Mascot3D({ size, cue }: { size: number; cue: (frame: number) => MascotCue }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<MascotScene | null>(null);
  const lastState = useRef<MascotState | null>(null);
  const [handle] = useState(() => delayRender("3D mascot"));

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const made = new MascotScene(element, false);
    made.driveManually();
    // Drawn at twice the size it shows, so it stays crisp.
    made.setSize(size * 2);
    scene.current = made;
    continueRender(handle);
    return () => {
      made.dispose();
      scene.current = null;
      lastState.current = null;
    };
  }, [handle, size]);

  useLayoutEffect(() => {
    const made = scene.current;
    if (!made) return;
    const now = cue(frame);
    if (now.state !== lastState.current) {
      made.setState(now.state);
      lastState.current = now.state;
    }
    made.lookAt(now.look?.x ?? 0, now.look?.y ?? 0);
    if (now.blink) made.blink();
    made.renderAt((frame * 1000) / fps);
  }, [frame, fps, cue]);

  return <canvas ref={canvas} style={{ width: size, height: size, display: "block" }} />;
}
