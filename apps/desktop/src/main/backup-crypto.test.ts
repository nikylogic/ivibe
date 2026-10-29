// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import {
  decryptObject,
  encryptObject,
  formatRecoveryKey,
  generateBackupKey,
  keyCheck,
  objectName,
  parseRecoveryKey,
} from "./backup-crypto.ts";

describe("recovery key", () => {
  it("shows 64 characters in groups of four and reads them back however they're typed", () => {
    const key = generateBackupKey();
    const shown = formatRecoveryKey(key);
    expect(shown.replace(/ /g, "")).toHaveLength(64);
    expect(shown.split(" ")).toHaveLength(16);
    expect(parseRecoveryKey(shown)!.equals(key)).toBe(true);
    expect(parseRecoveryKey(shown.toLowerCase().replace(/ /g, "-"))!.equals(key)).toBe(true);
    expect(parseRecoveryKey(shown.slice(0, -1))).toBeNull();
    expect(parseRecoveryKey("not a key")).toBeNull();
  });

  it("has a check value that tells keys apart and is stable", () => {
    const key = generateBackupKey();
    expect(keyCheck(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(keyCheck(key)).toBe(keyCheck(Buffer.from(key)));
    expect(keyCheck(key)).not.toBe(keyCheck(generateBackupKey()));
  });
});

describe("objects", () => {
  const key = generateBackupKey();
  const text = new TextEncoder().encode("History stays mine.");

  it("round-trips, and never repeats ciphertext for the same input", () => {
    const name = objectName("s");
    const first = encryptObject(key, name, text);
    expect(decryptObject(key, name, first).toString()).toBe("History stays mine.");
    expect(encryptObject(key, name, text).equals(first)).toBe(false);
    expect(first.includes(Buffer.from("History"))).toBe(false);
  });

  it("fails with the wrong key, a changed byte, or another object's name", () => {
    const name = objectName("b");
    const sealed = encryptObject(key, name, text);
    expect(() => decryptObject(generateBackupKey(), name, sealed)).toThrow();
    const changed = Buffer.from(sealed);
    changed[20]! ^= 1;
    expect(() => decryptObject(key, name, changed)).toThrow();
    expect(() => decryptObject(key, objectName("b"), sealed)).toThrow();
  });

  it("names objects the way the server accepts", () => {
    expect(objectName("s")).toMatch(/^s-[a-z0-9-]{8,80}$/);
    expect(objectName("b")).toMatch(/^b-[a-z0-9-]{8,80}$/);
  });
});
