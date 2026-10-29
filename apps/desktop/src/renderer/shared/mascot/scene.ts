// SPDX-License-Identifier: AGPL-3.0-only

import {
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

/**
 * The iVibe mascot: a little wind-up toy, built in code so there is no model file to load. A soft,
 * wide block in iVibe's headline colours with a wind-up key on its head. It is clay-shaded
 * with a painted matcap (no lights, no shadow maps) and renders only while something moves: idle,
 * it blinks now and then and otherwise draws nothing, so it costs nothing to keep on screen.
 * Recording winds its key and squashes with your voice; writing spins the key fast; done shows a
 * happy face; shy (for a first hello) blushes, glances away, then smiles. Everything
 * moves on springs, so a change of mind mid-move curves smoothly instead of jerking.
 */

export type MascotState = "idle" | "recording" | "writing" | "done" | "shy";

/**
 * iVibe's colours: light cream on top (the dark theme's headline, "Show the bug."), a warm cream
 * brown on the base and key, and a chocolate face with a little dark grey in it.
 */
const TOP = "#f2efe8";
const BASE = "#574d42";
const INK = "#3f2a21";
/** The smile, as in the drawing: as wide as an eye, a shallow curve, round ends. */
const SMILE = { radius: 0.128, tube: 0.021, arc: 1.79 };

/** Half the body's width and height. */
const WIDTH = 1;
const HEIGHT = 0.76;
/** The body is a little shallower front to back than it is wide. */
const DEPTH = 0.82;
/** Where the light top meets the base. */
const SEAM = -0.2;

/**
 * The body's outline, bottom to top: a superellipse, squarer at the base (so it sits flat) and
 * rounder on top, narrowing slightly towards the head.
 */
function outline(): Vector2[] {
  const points: Vector2[] = [];
  const steps = 48;
  for (let index = 0; index <= steps; index++) {
    const t = -Math.PI / 2 + (index / steps) * Math.PI;
    const sin = Math.sin(t);
    const cos = Math.max(0, Math.cos(t));
    const power = sin < 0 ? 2 / 4.5 : 2 / 2.1;
    const y = HEIGHT * Math.sign(sin) * Math.abs(sin) ** power;
    const taper = 1 - 0.08 * ((y / HEIGHT + 1) / 2);
    points.push(new Vector2(Math.max(0.0001, WIDTH * cos ** power * taper), y));
  }
  points[0]!.x = 0;
  points[steps]!.x = 0;
  // A ring exactly on the seam, where the light top and the dark base meet.
  const at = points.findIndex((point) => point.y > SEAM);
  points.splice(at, 0, new Vector2(radiusAt(points, SEAM), SEAM));
  return points;
}

/** The body's radius at height `y`, read off the outline, to sit the face on its surface. */
function radiusAt(points: Vector2[], y: number): number {
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!;
    const b = points[index]!;
    if (y >= a.y && y <= b.y && b.y > a.y) return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
  }
  return WIDTH;
}

/**
 * The key's head: two round lobes joined by a broad, shallow waist, each with a hole. Traced
 * around its centre from a smooth union of two circles, so it reads as one moulded piece.
 * `bevel` is the rounding the extrusion adds outside the outline (and inside the holes).
 */
function keyHead(bevel: number): Shape {
  const lobe = 0.185;
  const apart = 0.19;
  const blend = 0.26;
  const field = (x: number, y: number) => {
    const a = Math.hypot(x + apart, y) - lobe;
    const b = Math.hypot(x - apart, y) - lobe;
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / blend));
    return b + (a - b) * h - blend * h * (1 - h);
  };
  const shape = new Shape();
  const steps = 96;
  for (let index = 0; index <= steps; index++) {
    const angle = (index / steps) * Math.PI * 2;
    let near = 0;
    let far = apart + lobe + 0.1;
    for (let step = 0; step < 24; step++) {
      const mid = (near + far) / 2;
      if (field(Math.cos(angle) * mid, Math.sin(angle) * mid) < 0) near = mid;
      else far = mid;
    }
    const x = Math.cos(angle) * near;
    const y = Math.sin(angle) * near;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (const side of [-1, 1]) {
    const hole = new Path();
    hole.absarc(side * apart, 0, 0.088 + bevel, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return shape;
}

/** A soft matte clay matcap: white, with a gentle warm-grey falloff at the edges. */
function clayMatcap(): CanvasTexture {
  return matcap((paint, size) => {
    const base = paint.createRadialGradient(
      size * 0.38,
      size * 0.3,
      2,
      size / 2,
      size / 2,
      size / 2,
    );
    base.addColorStop(0, "#ffffff");
    base.addColorStop(0.6, "#fdfcf9");
    base.addColorStop(0.88, "#f1ede5");
    base.addColorStop(1, "#e0dacd");
    paint.fillStyle = base;
    paint.fillRect(0, 0, size, size);
  });
}

/**
 * The base and key's matcap: the cream brown, with a soft highlight from the top left and a faint
 * rim light, so they read as shaded shapes on light and dark pages alike.
 */
function darkMatcap(): CanvasTexture {
  return matcap((paint, size) => {
    paint.fillStyle = BASE;
    paint.fillRect(0, 0, size, size);
    const highlight = paint.createRadialGradient(
      size * 0.36,
      size * 0.3,
      0,
      size * 0.36,
      size * 0.3,
      size * 0.55,
    );
    highlight.addColorStop(0, "rgba(242, 239, 232, 0.22)");
    highlight.addColorStop(1, "rgba(242, 239, 232, 0)");
    paint.fillStyle = highlight;
    paint.fillRect(0, 0, size, size);
    const rim = paint.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.34,
      size / 2,
      size / 2,
      size / 2,
    );
    rim.addColorStop(0, "rgba(242, 239, 232, 0)");
    rim.addColorStop(0.75, "rgba(242, 239, 232, 0.05)");
    rim.addColorStop(1, "rgba(242, 239, 232, 0.2)");
    paint.fillStyle = rim;
    paint.fillRect(0, 0, size, size);
    const under = paint.createLinearGradient(0, size * 0.6, 0, size);
    under.addColorStop(0, "rgba(0, 0, 0, 0)");
    under.addColorStop(1, "rgba(0, 0, 0, 0.25)");
    paint.fillStyle = under;
    paint.fillRect(0, 0, size, size);
  });
}

function matcap(draw: (paint: CanvasRenderingContext2D, size: number) => void): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d")!, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A soft round shadow for under the toy. */
function shadowTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const paint = canvas.getContext("2d")!;
  const gradient = paint.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(60, 30, 10, 0.22)");
  gradient.addColorStop(1, "rgba(40, 22, 8, 0)");
  paint.fillStyle = gradient;
  paint.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/** A soft pink glow for the cheeks. */
function blushTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const paint = canvas.getContext("2d")!;
  const gradient = paint.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 120, 135, 1)");
  gradient.addColorStop(0.55, "rgba(255, 135, 148, 0.55)");
  gradient.addColorStop(1, "rgba(255, 150, 160, 0)");
  paint.fillStyle = gradient;
  paint.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const FORWARD = new Vector3(0, 0, 1);
/** How long an idle smile lasts, in seconds. */
const IDLE_SMILE_S = 2;
/** How long a blink takes, in seconds. */
const BLINK_S = 0.2;

const ease = (value: number, goal: number, rate: number, dt: number) =>
  value + (goal - value) * (1 - Math.exp(-rate * dt));

/** 0 before `from`, 1 after `to`, and a smooth S-curve between. */
const smooth = (from: number, to: number, value: number) => {
  const x = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return x * x * (3 - 2 * x);
};

interface Spring {
  value: number;
  velocity: number;
}

const spring = (value = 0): Spring => ({ value, velocity: 0 });

/**
 * Moves a spring towards `goal`. Springs carry their speed from frame to frame, so a change of
 * mind mid-move curves smoothly. `bounce` 0 settles without overshoot; a little makes it lively.
 */
function step(spring: Spring, goal: number, dt: number, stiffness = 140, bounce = 0.15): void {
  const damping = 2 * Math.sqrt(stiffness) * (1 - bounce);
  // In small steps, so a slow frame keeps time instead of lagging or overshooting.
  const steps = Math.ceil(dt / (1 / 120));
  const h = dt / steps;
  for (let index = 0; index < steps; index++) {
    spring.velocity += (stiffness * (goal - spring.value) - damping * spring.velocity) * h;
    spring.value += spring.velocity * h;
  }
}

interface FacePart {
  part: Mesh;
  /** Where it sits on the front when the face is centred. */
  x: number;
  y: number;
  /** How far it stands off the surface. */
  lift: number;
  /** A turn in its own plane after facing outwards. */
  spin: number;
}

export class MascotScene {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(30, 1, 0.1, 20);
  readonly #toy = new Group();
  readonly #body = new Group();
  readonly #key = new Group();
  readonly #face: FacePart[] = [];
  readonly #eyes: Mesh[] = [];
  readonly #happy: Mesh[] = [];
  readonly #blush: MeshBasicMaterial[] = [];
  readonly #smile: Mesh;
  readonly #points = outline();
  readonly #shadow: Mesh;
  readonly #still: boolean;
  /** Frames drawn so far: idle, this should barely move. */
  frames = 0;
  readonly #disposables: { dispose(): void }[] = [];
  readonly #springs = {
    yaw: spring(-0.1),
    pitch: spring(),
    squash: spring(),
    talk: spring(),
    happy: spring(),
    grin: spring(),
    key: spring(),
    squint: spring(),
    blush: spring(),
  };

  #state: MascotState = "idle";
  #level = 0;
  #keySpeed = 0;
  #turn = 0;
  #look = new Vector2();
  #doneAt = 0;
  #shyAt = 0;
  #blinkAt = -10_000;
  #doubleBlink = false;
  #frame = 0;
  #awakeUntil = 0;
  #last = 0;
  #visible = true;
  #blinkTimer: ReturnType<typeof setTimeout> | undefined;
  #smiledAt = -10_000;
  #smileTimer: ReturnType<typeof setTimeout> | undefined;
  /** Where the key settles when it stops: facing front again. Unset while it turns. */
  #keyRest: number | null = 0;

  constructor(
    canvas: HTMLCanvasElement,
    still = window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  ) {
    this.#still = still;
    this.#renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.setClearColor(0x000000, 0);
    this.#camera.position.set(0, 0.75, 6.2);
    this.#camera.lookAt(0, 0.3, 0);
    [this.#shadow, this.#smile] = this.#build();
    this.#scene.add(this.#toy);
    this.#scheduleBlink();
    this.#scheduleSmile();
  }

  #build(): [shadow: Mesh, smile: Mesh] {
    const light = clayMatcap();
    const dark = darkMatcap();
    const shadowMap = shadowTexture();
    const blushMap = blushTexture();
    this.#disposables.push(light, dark, shadowMap, blushMap);
    const clay = (matcap: CanvasTexture, color = "#ffffff") => {
      const material = new MeshMatcapMaterial({ matcap, color });
      this.#disposables.push(material);
      return material;
    };
    const baseClay = clay(dark);
    const mesh = <T extends { dispose(): void }>(
      geometry: T,
      material: MeshMatcapMaterial | MeshBasicMaterial,
    ) => {
      this.#disposables.push(geometry);
      return new Mesh(geometry as never, material);
    };

    // Body: a soft block in two moulded parts, meeting at the seam.
    const points = this.#points;
    for (const [part, material] of [
      [points.filter((point) => point.y >= SEAM), clay(light, TOP)],
      [points.filter((point) => point.y <= SEAM), baseClay],
    ] as const) {
      const shell = mesh(new LatheGeometry(part, 64), material);
      shell.scale.z = DEPTH;
      this.#body.add(shell);
    }

    // The face is painted on: flat colour, no shading, sat on the front of the body.
    const ink = new MeshBasicMaterial({ color: INK });
    this.#disposables.push(ink);
    /** A painted line along an arc, with rounded ends like a brush stroke. */
    const stroke = (radius: number, tube: number, arc: number) => {
      const line = mesh(new TorusGeometry(radius, tube, 10, 32, arc), ink);
      for (const angle of [0, arc]) {
        const end = mesh(new SphereGeometry(tube, 12, 8), ink);
        end.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
        line.add(end);
      }
      return line;
    };
    for (const side of [-1, 1]) {
      // Shy: a soft pink glow on each cheek, below and outside the eye.
      const blush = new MeshBasicMaterial({
        map: blushMap,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
      });
      this.#disposables.push(blush);
      this.#blush.push(blush);
      this.#addFace(mesh(new PlaneGeometry(0.34, 0.2), blush), side * 0.5, -0.06, 0.014);
      const eye = this.#addFace(
        mesh(new SphereGeometry(0.125, 32, 16), ink),
        side * 0.37,
        0.08,
        0.008,
      );
      eye.scale.set(1, 1.02, 0.12);
      this.#eyes.push(eye);
      // Happy eyes: little arches, for done and the end of shy.
      const arch = this.#addFace(stroke(0.085, 0.022, Math.PI), side * 0.37, 0.06, 0.005);
      arch.visible = false;
      this.#happy.push(arch);
    }
    // Placed by the arc's centre, which sits above the curve: the ends land a little below the
    // middle of the eyes. The arc is drawn from angle 0; the spin centres it at the bottom.
    const smile = this.#addFace(
      stroke(SMILE.radius, SMILE.tube, SMILE.arc),
      -0.02,
      0.06,
      0.008,
      -Math.PI / 2 - SMILE.arc / 2,
    );
    this.#placeFace();

    // The wind-up key on its head: a short stem and a two-lobed head that turns around it.
    // About half the body's width, with a thick, short stem running up behind it.
    const bevel = 0.035;
    // The stem is centred in the head's thickness, so the key looks the same from behind.
    const stem = mesh(new CylinderGeometry(0.105, 0.12, 0.32, 24), baseClay);
    stem.position.set(0, 0.14, 0);
    this.#key.add(stem);
    const headGeometry = new ExtrudeGeometry(keyHead(bevel), {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 24,
    });
    headGeometry.center();
    const head = mesh(headGeometry, baseClay);
    head.position.set(0, 0.4, 0);
    head.scale.setScalar(1.18);
    this.#key.add(head);
    this.#key.position.set(0.2, HEIGHT - 0.1, -0.02);
    this.#body.add(this.#key);

    this.#toy.add(this.#body);

    const shadow = mesh(
      new PlaneGeometry(2.8, 1.4),
      new MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }),
    );
    this.#disposables.push(shadow.material as MeshBasicMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -HEIGHT - 0.01;
    this.#scene.add(shadow);
    return [shadow, smile];
  }

  setSize(pixels: number): void {
    this.#renderer.setSize(pixels, pixels, false);
    this.#wake(0);
  }

  /** Changes what the toy is doing. "shy" plays once (again each time it is set), then idles. */
  setState(state: MascotState): void {
    if (state === this.#state && state !== "shy") return;
    this.#state = state;
    if (state === "done") this.#doneAt = performance.now();
    if (state === "shy") this.#shyAt = performance.now();
    this.#wake(1200);
  }

  /** Turns the toy round by `radians`, to see it from any side (the test bench uses it). */
  setTurn(radians: number): void {
    this.#turn = radians;
    this.#wake(300);
  }

  /** The voice level (RMS, 0–1) while recording. */
  setLevel(rms: number): void {
    this.#level = Math.min(1, Math.sqrt(rms) * 3);
  }

  /** Where the pointer is, from -1 to 1 across the window: the toy turns to look at it. */
  lookAt(x: number, y: number): void {
    if (this.#still) return;
    this.#look.set(x, y);
    this.#wake(300);
  }

  /** Off screen or the app hidden: draws nothing until shown again. */
  setVisible(visible: boolean): void {
    this.#visible = visible;
    if (visible) this.#wake(0);
    else this.#stop();
  }

  dispose(): void {
    this.#stop();
    clearTimeout(this.#blinkTimer);
    clearTimeout(this.#smileTimer);
    for (const item of this.#disposables) item.dispose();
    this.#renderer.dispose();
  }

  #addFace(part: Mesh, x: number, y: number, lift: number, spin = 0): Mesh {
    this.#face.push({ part, x, y, lift, spin });
    this.#body.add(part);
    return part;
  }

  /** Sits the face on the body's surface, facing mostly forwards. */
  #placeFace(): void {
    const points = this.#points;
    for (const { part, x: px, y: py, lift, spin } of this.#face) {
      const radius = radiusAt(points, py);
      const at = new Vector3(px, py, DEPTH * Math.sqrt(Math.max(0, radius * radius - px * px)));
      // The surface's normal: outwards around the body, tipped up where it narrows to the top.
      const slope = (radiusAt(points, py + 0.01) - radiusAt(points, py - 0.01)) / 0.02;
      const outward = new Vector3(at.x / DEPTH ** 2, 0, at.z / DEPTH ** 2)
        .normalize()
        .setY(-slope)
        .normalize();
      part.position.copy(at).addScaledVector(outward, lift);
      // Mostly facing forwards, so round eyes stay round on the curved front.
      part.lookAt(part.position.clone().add(outward.lerp(FORWARD, 0.35).normalize()));
      if (spin) part.rotateZ(spin);
    }
  }

  #busy(): boolean {
    return this.#state === "recording" || this.#state === "writing" || this.#state === "shy";
  }

  #scheduleBlink(): void {
    if (this.#still) return;
    this.#blinkTimer = setTimeout(
      () => {
        this.#blinkAt = performance.now();
        // Now and then a quick double blink, as people do.
        this.#doubleBlink = Math.random() < 0.25;
        this.#wake(this.#doubleBlink ? 520 : 260);
        this.#scheduleBlink();
      },
      2600 + Math.random() * 3600,
    );
  }

  /** While idle, a small warm smile every so often, so it never looks blank. */
  #scheduleSmile(): void {
    if (this.#still) return;
    this.#smileTimer = setTimeout(
      () => {
        if (this.#state === "idle") {
          this.#smiledAt = performance.now();
          this.#wake(IDLE_SMILE_S * 1000 + 600);
        }
        this.#scheduleSmile();
      },
      7000 + Math.random() * 7000,
    );
  }

  /** Draws for at least `ms` more, then stops once everything has settled. */
  #wake(ms: number): void {
    this.#awakeUntil = Math.max(this.#awakeUntil, performance.now() + ms);
    if (!this.#visible || this.#frame) return;
    this.#last = performance.now();
    this.#frame = requestAnimationFrame(this.#tick);
  }

  #stop(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  /** How shut the eyes are from a blink: 0 open, 1 shut. Closes quickly, opens a little slower. */
  #blink(now: number): number {
    const lid = (since: number) => {
      const p = since / BLINK_S;
      if (p <= 0 || p >= 1) return 0;
      const shaped = p < 0.4 ? (p / 0.4) * 0.5 : 0.5 + ((p - 0.4) / 0.6) * 0.5;
      return Math.sin(Math.PI * shaped) ** 0.7;
    };
    const since = (now - this.#blinkAt) / 1000;
    return Math.max(lid(since), this.#doubleBlink ? lid(since - 0.26) : 0);
  }

  #tick = (now: number): void => {
    this.#frame = 0;
    const dt = Math.min(0.1, (now - this.#last) / 1000);
    this.#last = now;
    const t = now / 1000;
    const still = this.#still;
    const springs = this.#springs;
    let moving = false;
    /** Moves a spring towards its goal (at once with reduced motion), noting if it still moves. */
    const go = (spring: Spring, goal: number, stiffness?: number, bounce?: number) => {
      if (still) {
        spring.value = goal;
        spring.velocity = 0;
      } else step(spring, goal, dt, stiffness, bounce);
      if (Math.abs(spring.value - goal) > 0.0005 || Math.abs(spring.velocity) > 0.005) {
        moving = true;
      }
      return spring.value;
    };

    // This frame's goals: look towards the pointer, then whatever the state adds.
    // Everything is kept small and slow: a calm toy, never a cartoon. Springs settle without
    // overshoot.
    let yaw = -0.1 + this.#turn + this.#look.x * 0.16;
    let pitch = this.#look.y * 0.06;
    let tuck = 0;
    let blush = 0;
    let squint = 0;
    let happy = 0;
    let hop = 0;
    // An idle smile: the smile widens and the eyes soften, then it relaxes.
    const sinceSmile = (now - this.#smiledAt) / 1000;
    const smiling =
      this.#state === "idle"
        ? smooth(0, 0.5, sinceSmile) * (1 - smooth(IDLE_SMILE_S - 0.6, IDLE_SMILE_S, sinceSmile))
        : 0;

    const sinceDone = (now - this.#doneAt) / 1000;
    if (this.#state === "done" && sinceDone < 1.8) {
      happy = 1;
      hop = still ? 0 : Math.sin(smooth(0, 0.7, sinceDone) * Math.PI) * 0.04;
    }

    if (this.#state === "shy") {
      // A first hello: a soft blush, a small glance down and away, then a smile back at you.
      const s = (now - this.#shyAt) / 1000;
      const away = smooth(0.1, 0.9, s) * (1 - smooth(2.0, 2.8, s));
      yaw -= 0.16 * away;
      pitch += 0.06 * away;
      tuck = 0.015 * away;
      squint = 0.12 * away;
      blush = smooth(0.2, 1.0, s) * (1 - smooth(3.6, 4.6, s));
      happy = smooth(2.4, 2.8, s) * (1 - smooth(3.8, 4.3, s));
      if (s > 4.8) this.#state = "idle";
    }

    // Key: turns slowly while recording, clearly faster while writing, eases to a stop.
    const keyGoal = still
      ? 0
      : this.#state === "recording"
        ? 1.6
        : this.#state === "writing"
          ? 7
          : 0;
    const key = springs.key;
    if (keyGoal > 0) {
      this.#keySpeed = ease(this.#keySpeed, keyGoal, 3, dt);
      key.value += this.#keySpeed * dt;
      key.velocity = this.#keySpeed;
      this.#keyRest = null;
      moving = true;
    } else {
      // Done turning: carry on in the same direction to the next half turn, where it faces
      // front again (the key looks the same from both sides), and settle there.
      this.#keyRest ??= Math.ceil((key.value + key.velocity * 0.25) / Math.PI) * Math.PI;
      this.#keySpeed = 0;
      go(key, this.#keyRest, 30, 0);
    }
    this.#key.rotation.y = key.value;

    // A gentle squash with the voice, a slow breath while busy, tucked in a touch when shy.
    const talk = go(springs.talk, this.#state === "recording" && !still ? this.#level : 0, 120, 0);
    const breath = this.#busy() && !still ? Math.sin(t * 1.6) * 0.006 : 0;
    const squash = go(springs.squash, talk * 0.04 + tuck, 120, 0) + breath;
    this.#body.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
    this.#body.position.y = -squash * HEIGHT;

    // The whole toy turns a little to look, and lifts softly when done.
    this.#toy.rotation.y = go(springs.yaw, yaw, 40, 0);
    this.#toy.rotation.x = go(springs.pitch, pitch, 40, 0);
    this.#toy.rotation.z = -0.06;
    this.#toy.position.y = hop;
    const lift = 1 - hop * 2;
    this.#shadow.scale.set(lift, lift, lift);

    // Eyes: blink, soften a little when shy, and close into happy arches: the eyes shut over
    // the first half of the change and the arches open over the second, so they never overlap.
    const glad = go(springs.happy, happy, 90, 0);
    const shut = still ? 0 : this.#blink(now);
    if (shut > 0) moving = true;
    const open =
      (1 - 0.94 * shut) *
      (1 - go(springs.squint, squint + 0.15 * smiling, 60, 0)) *
      (1 - Math.min(1, glad * 2));
    for (const eye of this.#eyes) {
      eye.scale.y = 1.02 * Math.max(0.001, open);
      eye.visible = glad < 0.5;
    }
    for (const arch of this.#happy) {
      arch.scale.setScalar(Math.max(0.001, glad * 2 - 1));
      arch.visible = glad > 0.5;
    }

    // Mouth: a wider smile when happy, or for a moment now and then while idle.
    const smile = 1 + 0.12 * go(springs.grin, Math.max(happy, smiling), 60, 0);
    this.#smile.scale.set(smile, smile, 1);

    const pink = go(springs.blush, blush, 50, 0);
    for (const cheek of this.#blush) cheek.opacity = pink * 0.65;

    this.#renderer.render(this.#scene, this.#camera);
    this.frames++;

    if (this.#visible && (this.#busy() || moving || now < this.#awakeUntil)) {
      this.#frame = requestAnimationFrame(this.#tick);
    }
  };
}
