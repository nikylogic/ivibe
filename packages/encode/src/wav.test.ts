// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { encodeWav, resample, rms, toDbfs } from "./wav.ts";

describe("encodeWav", () => {
  it("writes a valid 16 kHz mono 16-bit header", () => {
    const wav = encodeWav(new Float32Array(16_000));
    const view = new DataView(wav.buffer);
    const ascii = (offset: number) => String.fromCharCode(...wav.slice(offset, offset + 4));
    expect(ascii(0)).toBe("RIFF");
    expect(ascii(8)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(32_000);
    expect(wav.byteLength).toBe(44 + 32_000);
  });

  it("clamps samples to the 16-bit range", () => {
    const wav = encodeWav(new Float32Array([2, -2]));
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });
});

describe("resample", () => {
  it("downsamples 48 kHz to 16 kHz", () => {
    const input = new Float32Array(48_000).fill(0.5);
    const output = resample(input, 48_000);
    expect(output.length).toBe(16_000);
    expect(output[100]).toBeCloseTo(0.5);
  });

  it("refuses to upsample", () => {
    expect(() => resample(new Float32Array(10), 8_000)).toThrow(RangeError);
  });
});

describe("levels", () => {
  it("computes RMS and dBFS", () => {
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(toDbfs(1)).toBe(0);
    expect(toDbfs(0)).toBe(Number.NEGATIVE_INFINITY);
  });
});
