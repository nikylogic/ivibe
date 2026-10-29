// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { wavSeconds } from "./transcribe.ts";

function wav(seconds: number, sampleRate = 16000): Uint8Array {
  const dataBytes = Math.round(seconds * sampleRate) * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) =>
    [...text].forEach((c, i) => (bytes[offset + i] = c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}

describe("wavSeconds", () => {
  it("reads the length of a 16 kHz mono WAV", () => {
    expect(wavSeconds(wav(2.5))).toBeCloseTo(2.5);
  });

  it("uses the bytes actually sent when the header claims more", () => {
    expect(wavSeconds(wav(4).subarray(0, 44 + 32000))).toBeCloseTo(1);
  });

  it("rejects anything that isn't a WAV", () => {
    expect(
      wavSeconds(new TextEncoder().encode("not a wav file at all, just some text here...")),
    ).toBeNull();
    expect(wavSeconds(new Uint8Array(10))).toBeNull();
  });
});
