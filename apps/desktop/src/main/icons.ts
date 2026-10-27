// SPDX-License-Identifier: AGPL-3.0-only

import { deflateSync } from "node:zlib";
import { nativeImage } from "electron";
import type { NativeImage } from "electron";

/**
 * Tray icons drawn in code (a filled circle), so the tray needs no image assets.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encodes RGBA pixels as a PNG. */
function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // no filter
    Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)).copy(
      raw,
      y * (width * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ]);
}

function circle(
  size: number,
  color: [number, number, number],
  ring?: [number, number, number],
): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - center, y - center);
      const alpha = Math.max(0, Math.min(1, radius - distance + 0.5));
      if (alpha === 0) continue;
      const inner = ring && distance < radius * 0.45;
      const [r, g, b] = inner ? ring : color;
      rgba.set([r, g, b, Math.round(alpha * 255)], (y * size + x) * 4);
    }
  }
  return encodePng(size, size, rgba);
}

function icon(color: [number, number, number], ring?: [number, number, number]): NativeImage {
  const image = nativeImage.createFromBuffer(circle(16, color, ring));
  image.addRepresentation({ scaleFactor: 2, buffer: circle(32, color, ring) });
  return image;
}

export const trayIcons = {
  idle: () => icon([124, 92, 255], [255, 255, 255]),
  recording: () => icon([239, 68, 68], [255, 255, 255]),
};
