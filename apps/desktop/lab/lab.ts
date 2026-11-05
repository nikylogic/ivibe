// SPDX-License-Identifier: AGPL-3.0-only

import { SCENARIOS, scenarioById } from "./scenarios.ts";

/** The Lab's own page: a list of everything, and one frame running the real screen. */

const UI_SIZES: Record<string, [number, number]> = {
  Usual: [1080, 720],
  Smallest: [820, 560],
  Large: [1440, 900],
};
const HUD_SIZE: [number, number] = [480, 200];
const HUD_EXPANDED: [number, number] = [560, 640];

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const nav = element("nav");
const frame = element<HTMLIFrameElement>("frame");
const stage = element("stage");
const title = element("title");
const log = element("log");
const search = element<HTMLInputElement>("search");
const count = element("count");

const remembered = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Only a convenience.
  }
};

let current =
  new URLSearchParams(location.search).get("s") ?? remembered("lab.s", SCENARIOS[0]!.id);
let theme = remembered("lab.theme", "light");
let size = remembered("lab.size", "Usual");
let expanded = false;

function fit(): void {
  const scenario = scenarioById(current);
  const [width, height] =
    scenario.window === "hud" ? (expanded ? HUD_EXPANDED : HUD_SIZE) : UI_SIZES[size]!;
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  stage.dataset.window = scenario.window;
  const room = stage.getBoundingClientRect();
  const scale = Math.min(1, (room.width - 40) / width, (room.height - 40) / height);
  frame.style.transform = `scale(${scale})`;
  element("size-note").textContent =
    `${width} × ${height}${scale < 1 ? `, shown at ${Math.round(scale * 100)}%` : ""}`;
}

function open(): void {
  const scenario = scenarioById(current);
  current = scenario.id;
  expanded = false;
  remember("lab.s", current);
  history.replaceState(null, "", `?s=${current}`);
  title.textContent = `${scenario.group}: ${scenario.label}`;
  log.textContent = "";
  frame.src = `/${scenario.window}.html?scenario=${scenario.id}&theme=${theme}`;
  fit();
  for (const link of nav.querySelectorAll("button")) {
    link.toggleAttribute("data-on", link.dataset.id === current);
  }
  nav.querySelector("[data-on]")?.scrollIntoView({ block: "nearest" });
}

function list(filter = ""): void {
  nav.textContent = "";
  const words = filter.toLowerCase();
  const shown = SCENARIOS.filter((scenario) =>
    `${scenario.group} ${scenario.label}`.toLowerCase().includes(words),
  );
  count.textContent = `${shown.length} states`;
  let group = "";
  for (const scenario of shown) {
    if (scenario.group !== group) {
      group = scenario.group;
      const heading = document.createElement("h2");
      heading.textContent = group;
      nav.append(heading);
    }
    const button = document.createElement("button");
    button.textContent = scenario.label;
    button.dataset.id = scenario.id;
    button.toggleAttribute("data-on", scenario.id === current);
    button.onclick = () => {
      current = scenario.id;
      open();
    };
    nav.append(button);
  }
}

function pick(id: string, choices: string[], value: string, change: (next: string) => void): void {
  const box = element(id);
  box.textContent = "";
  for (const choice of choices) {
    const button = document.createElement("button");
    button.textContent = choice;
    button.toggleAttribute("data-on", choice === value);
    button.onclick = () => {
      change(choice);
      pick(id, choices, choice, change);
    };
    box.append(button);
  }
}

const note = (text: string) => {
  const line = document.createElement("div");
  line.textContent = text;
  log.prepend(line);
};

window.addEventListener("message", ({ data }: MessageEvent) => {
  const message = data as {
    type?: string;
    name?: string;
    args?: unknown[];
    expanded?: boolean;
    step?: string;
    text?: string;
  };
  if (message.type === "call") {
    note(`${message.name}(${(message.args ?? []).map((arg) => JSON.stringify(arg)).join(", ")})`);
  } else if (message.type === "hud-expand") {
    expanded = !!message.expanded;
    fit();
  } else if (message.type === "stuck") {
    note(`Couldn't reach this screen: no "${message.step}" to press`);
  } else if (message.type === "note") {
    note(message.text ?? "");
  }
});

window.addEventListener("resize", fit);
window.addEventListener("keydown", (event) => {
  if (event.target === search || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
  event.preventDefault();
  const buttons = [...nav.querySelectorAll("button")];
  const index = buttons.findIndex((button) => button.dataset.id === current);
  const next = buttons[index + (event.key === "ArrowDown" ? 1 : -1)];
  if (next?.dataset.id) {
    current = next.dataset.id;
    open();
  }
});

search.oninput = () => list(search.value);
element("reload").onclick = open;
pick("theme", ["light", "dark"], theme, (next) => {
  theme = next;
  remember("lab.theme", next);
  document.documentElement.dataset.theme = next;
  open();
});
pick("size", Object.keys(UI_SIZES), size, (next) => {
  size = next;
  remember("lab.size", next);
  fit();
});
document.documentElement.dataset.theme = theme;

list();
open();
