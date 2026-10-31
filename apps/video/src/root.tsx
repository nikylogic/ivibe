// SPDX-License-Identifier: AGPL-3.0-only

import { Audio, Composition, Series, getStaticFiles, interpolate, staticFile } from "remotion";
import { Dictate, Fix, Intro, Outro, Prompt } from "./scenes.tsx";
import { FPS, sec } from "./theme.ts";

/** Scene lengths, in frames: about 37 seconds in all. */
const SCENES = [
  { name: "Intro", frames: sec(4), Scene: Intro },
  { name: "Fix", frames: sec(11), Scene: Fix },
  { name: "Prompt", frames: sec(8), Scene: Prompt },
  { name: "Dictate", frames: sec(8), Scene: Dictate },
  { name: "Outro", frames: sec(6), Scene: Outro },
];
const TOTAL = SCENES.reduce((sum, scene) => sum + scene.frames, 0);

/** public/music.mp3 (Pixabay, "Product - Product Launch"), when it has been added. */
const hasMusic = () => getStaticFiles().some((file) => file.name === "music.mp3");

function Demo() {
  return (
    <>
      <Series>
        {SCENES.map(({ name, frames, Scene }) => (
          <Series.Sequence key={name} name={name} durationInFrames={frames}>
            <Scene />
          </Series.Sequence>
        ))}
      </Series>
      {hasMusic() && (
        <Audio
          src={staticFile("music.mp3")}
          volume={(frame) =>
            interpolate(frame, [0, 15, TOTAL - 45, TOTAL], [0, 0.8, 0.8, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      )}
    </>
  );
}

export function Root() {
  return (
    <Composition
      id="Demo"
      component={Demo}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
}
