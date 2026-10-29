// SPDX-License-Identifier: AGPL-3.0-only

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * The cryptography of end-to-end encrypted backups (D28, docs/architecture.md §6.10). Everything
 * runs on the device; iVibe Cloud only ever sees the output of `encryptObject` and `keyCheck`.
 *
 * - The backup key is 32 random bytes, shown to the user once as a 64-character recovery key.
 * - Each object is AES-256-GCM with a fresh 12-byte nonce, and its name as associated data, so
 *   the server can't swap one object for another without decryption failing.
 * - The key check is an HMAC of a fixed label: it tells a mistyped recovery key apart from the
 *   right one without revealing anything about the key.
 */

const MAGIC = Buffer.from("IVB1");
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const CHECK_LABEL = "ivibe-backup-key-check-v1";

export function generateBackupKey(): Buffer {
  return randomBytes(32);
}

/** "A1B2 C3D4 …": 64 hex characters in 16 groups of four. */
export function formatRecoveryKey(key: Buffer): string {
  return key.toString("hex").toUpperCase().match(/.{4}/g)!.join(" ");
}

/** Accepts the key as typed or pasted: spaces, dashes, line breaks and case don't matter. */
export function parseRecoveryKey(text: string): Buffer | null {
  const hex = text.replace(/[\s-]/g, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? Buffer.from(hex, "hex") : null;
}

export function keyCheck(key: Buffer): string {
  return createHmac("sha256", key).update(CHECK_LABEL).digest("hex");
}

/** A random object name the server accepts: "s-…" for snapshots, "b-…" for screenshots. */
export function objectName(kind: "s" | "b"): string {
  return `${kind}-${randomBytes(16).toString("hex")}`;
}

export function encryptObject(key: Buffer, name: string, plaintext: Uint8Array): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(name));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, body, cipher.getAuthTag()]);
}

/** Throws if the key is wrong, the object was changed, or it belongs under another name. */
export function decryptObject(key: Buffer, name: string, data: Uint8Array): Buffer {
  const bytes = Buffer.from(data);
  if (
    bytes.length < MAGIC.length + NONCE_BYTES + TAG_BYTES ||
    !bytes.subarray(0, 4).equals(MAGIC)
  ) {
    throw new Error("Not an iVibe backup object.");
  }
  const nonce = bytes.subarray(4, 4 + NONCE_BYTES);
  const tag = bytes.subarray(bytes.length - TAG_BYTES);
  const body = bytes.subarray(4 + NONCE_BYTES, bytes.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(name));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
