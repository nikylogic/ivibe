// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { acceptGrowth, acceptRefinement, clampBox, parseSamBox } from "./proof.ts";
import { resolveProof } from "./writers.ts";
import type { FixFrame } from "./writers.ts";

const frame = (id: string, tMs: number): FixFrame => ({
  id,
  tMs,
  imageUrl: "data:image/jpeg;base64,",
  width: 1280,
  height: 720,
  lines: [
    { id: "l0", text: "Uncaught TypeError:", box: { x: 780, y: 66, width: 264, height: 18 } },
    { id: "l1", text: "Cannot read properties", box: { x: 796, y: 90, width: 290, height: 18 } },
  ],
});

describe("parseSamBox", () => {
  it("reads the first box record, with inclusive corners", () => {
    const output =
      "<0f>1<|box;x1=46;y1=418;x2=220;y2=469;w=1280;h=720;c=0.87|><|mask;x=0;y=0;data=!abc|>";
    expect(parseSamBox(output)).toEqual({ x: 46, y: 418, width: 175, height: 52 });
  });

  it("returns null for an empty answer", () => {
    expect(parseSamBox("")).toBeNull();
  });
});

describe("acceptRefinement", () => {
  const proposed = { x: 30, y: 400, width: 200, height: 90 };

  it("keeps a refinement inside the proposed box", () => {
    expect(acceptRefinement(proposed, { x: 46, y: 418, width: 175, height: 52 })).toBe(true);
  });

  it("rejects one that drifted to another element", () => {
    expect(acceptRefinement(proposed, { x: 600, y: 100, width: 200, height: 90 })).toBe(false);
  });

  it("rejects a speck", () => {
    expect(acceptRefinement(proposed, { x: 40, y: 410, width: 12, height: 12 })).toBe(false);
  });
});

describe("acceptGrowth", () => {
  const word = { x: 92, y: 430, width: 50, height: 30 };
  const size = { width: 1280, height: 720 };

  it("grows a label to its button", () => {
    expect(acceptGrowth(word, { x: 47, y: 418, width: 142, height: 59 }, size)).toBe(true);
  });

  it("refuses a box that lost the text or swallowed the panel", () => {
    expect(acceptGrowth(word, { x: 300, y: 418, width: 142, height: 59 }, size)).toBe(false);
    expect(acceptGrowth(word, { x: 0, y: 0, width: 760, height: 720 }, size)).toBe(false);
  });
});

describe("clampBox", () => {
  it("keeps boxes inside the frame and drops tiny ones", () => {
    const size = { width: 100, height: 100 };
    expect(clampBox({ x: -10, y: 90, width: 50, height: 30 }, size)).toBeNull();
    expect(clampBox({ x: -10, y: 50, width: 50, height: 30 }, size)).toEqual({
      x: 0,
      y: 50,
      width: 40,
      height: 30,
    });
  });
});

describe("resolveProof", () => {
  const frames = [frame("f0001", 1000), frame("f0002", 4000)];

  it("draws text marks from OCR boxes and element marks from the model's box", () => {
    const shots = resolveProof(
      [
        {
          frame_id: "f0002",
          title: "The console shows a TypeError",
          marks: [{ caption: "TypeError", line_ids: ["l0", "l1"], box: [0, 0, 0, 0] }],
        },
        {
          frame_id: "f0001",
          title: "Save is clicked",
          marks: [{ caption: "Clicked Save", line_ids: [], box: [30, 400, 230, 490] }],
        },
      ],
      frames,
    );
    expect(shots.map((shot) => shot.frameId)).toEqual(["f0001", "f0002"]);
    expect(shots[0]!.marks[0]).toMatchObject({ source: "element", box: { x: 30, width: 200 } });
    expect(shots[1]!.marks[0]).toEqual({
      caption: "TypeError",
      source: "text",
      box: { x: 774, y: 60, width: 318, height: 54 },
    });
  });

  it("drops unknown frames, repeats and empty marks", () => {
    const shots = resolveProof(
      [
        { frame_id: "f9999", title: "x", marks: [] },
        { frame_id: "f0001", title: "a", marks: [{ caption: "", line_ids: ["l0"], box: [] }] },
        { frame_id: "f0001", title: "again", marks: [] },
      ],
      frames,
    );
    expect(shots).toHaveLength(1);
    expect(shots[0]!.marks).toEqual([]);
  });
});
