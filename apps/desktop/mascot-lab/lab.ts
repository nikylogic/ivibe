// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A test bench for the mascot, outside the app: every state, a fake or real voice level, a few
 * sizes side by side and both themes, with a frame counter to check it sleeps when idle.
 * Run with `pnpm mascot`.
 */

import { MascotScene, type MascotState } from "../src/renderer/shared/mascot/scene.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let state: MascotState = "idle";
let still = false;
let scenes: { scene: MascotScene; canvas: HTMLCanvasElement; size: number }[] = [];

function mount(parent: HTMLElement, size: number, caption?: string) {
  const canvas = document.createElement("canvas");
  canvas.style.width = canvas.style.height = `${size}px`;
  if (caption) {
    const figure = document.createElement("figure");
    figure.append(
      canvas,
      Object.assign(document.createElement("figcaption"), { textContent: caption }),
    );
    parent.append(figure);
  } else parent.append(canvas);
  const scene = new MascotScene(canvas, still);
  scene.setSize(size);
  scene.setState(state);
  scenes.push({ scene, canvas, size });
}

function build() {
  for (const { scene } of scenes) scene.dispose();
  scenes = [];
  $("hero").replaceChildren();
  $("sizes").replaceChildren();
  mount($("hero"), Number($<HTMLInputElement>("size").value));
  if ($("small").getAttribute("aria-pressed") === "true") {
    for (const size of [128, 64, 32]) mount($("sizes"), size, `${size}px`);
  }
}

// States.
for (const name of ["idle", "recording", "writing", "done", "shy"] as MascotState[]) {
  const button = Object.assign(document.createElement("button"), { textContent: name });
  button.setAttribute("aria-pressed", String(name === state));
  button.onclick = () => {
    state = name;
    for (const other of $("states").children)
      other.setAttribute("aria-pressed", String(other === button));
    for (const { scene } of scenes) scene.setState(state);
  };
  $("states").append(button);
}

// Voice level: the slider, a fake talker, or the real microphone.
let level = Number($<HTMLInputElement>("level").value);
$<HTMLInputElement>("level").oninput = (event) => {
  level = Number((event.target as HTMLInputElement).value);
};
const toggle = (id: string) => {
  const on = $(id).getAttribute("aria-pressed") !== "true";
  $(id).setAttribute("aria-pressed", String(on));
  return on;
};
let talking = false;
$("talk").onclick = () => (talking = toggle("talk"));

let analyser: AnalyserNode | null = null;
let stream: MediaStream | null = null;
$("mic").onclick = async () => {
  if (!toggle("mic")) {
    stream?.getTracks().forEach((track) => track.stop());
    analyser = null;
    return;
  }
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audio = new AudioContext();
  analyser = audio.createAnalyser();
  analyser.fftSize = 1024;
  audio.createMediaStreamSource(stream).connect(analyser);
};

// Levels arrive every 100 ms in the app, so the bench sends them at the same pace.
const samples = new Float32Array(1024);
setInterval(() => {
  let rms = level;
  if (analyser) {
    analyser.getFloatTimeDomainData(samples);
    rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  } else if (talking) {
    const t = performance.now() / 1000;
    const syllables = Math.max(0, Math.sin(t * 9) * Math.sin(t * 2.3 + 1));
    rms = syllables * 0.16 * (Math.sin(t * 0.7) > -0.6 ? 1 : 0);
  }
  for (const { scene } of scenes) scene.setLevel(rms);
}, 100);

// Pointer: the toys look at it, as in the app.
window.addEventListener("pointermove", (event) => {
  for (const { scene, canvas } of scenes) {
    const box = canvas.getBoundingClientRect();
    const x = (event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2);
    const y = (event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2);
    scene.lookAt(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
  }
});

// Turn every toy round, to check it from the sides and back.
$<HTMLInputElement>("turn").oninput = (event) => {
  const degrees = Number((event.target as HTMLInputElement).value);
  for (const { scene } of scenes) scene.setTurn((degrees * Math.PI) / 180);
};

$<HTMLInputElement>("size").oninput = (event) => {
  const size = Number((event.target as HTMLInputElement).value);
  const hero = scenes[0];
  if (!hero) return;
  hero.canvas.style.width = hero.canvas.style.height = `${size}px`;
  hero.scene.setSize(size);
};
$("theme").onclick = () => (document.body.dataset.theme = toggle("theme") ? "dark" : "light");
$("still").onclick = () => {
  still = toggle("still");
  build();
};
$("small").onclick = () => {
  toggle("small");
  build();
};

// Frames drawn by the big preview, per second.
let lastFrames = 0;
setInterval(() => {
  const hero = scenes[0]?.scene;
  if (!hero) return;
  $("stats").textContent = `${hero.frames - lastFrames} fps · ${hero.frames} frames total`;
  lastFrames = hero.frames;
}, 1000);

build();
