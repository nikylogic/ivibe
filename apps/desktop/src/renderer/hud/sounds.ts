// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef } from "react";
import type { RecordingPhase } from "../../shared/ipc.ts";

/**
 * Two soft notes when recording starts (rising) and stops (falling), so the quiet compact pill
 * can be trusted without looking at it. Made with Web Audio: no sound files, and quiet enough to
 * sit under whatever else is playing. Off in Settings → General.
 */

let context: AudioContext | null = null;

function chime(kind: "start" | "stop"): void {
  context ??= new AudioContext();
  const audio = context;
  const notes = kind === "start" ? [659.25, 987.77] : [783.99, 523.25];
  notes.forEach((frequency, index) => {
    const at = audio.currentTime + index * 0.075;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.05, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    tone.connect(gain).connect(audio.destination);
    tone.start(at);
    tone.stop(at + 0.17);
  });
}

/** Plays the start note as the shortcut is pressed (before the mic opens) and the stop note. */
export function useChimes(phase: RecordingPhase | undefined, enabled: boolean): void {
  const previous = useRef<RecordingPhase | undefined>(undefined);
  useEffect(() => {
    const before = previous.current;
    previous.current = phase;
    if (!enabled || phase === before) return;
    if (phase === "starting") chime("start");
    else if (phase === "finalizing" && before === "recording") chime("stop");
  }, [phase, enabled]);
}
