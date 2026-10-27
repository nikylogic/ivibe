// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Minimal Meta Model API helpers for the Day-0 spikes. Deliberately dependency-free; the
 * production client lives in packages/engine.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiKey = process.env.META_API_KEY ?? "";
export const baseUrl = (process.env.META_API_BASE_URL || "https://api.meta.ai/v1").replace(
  /\/$/,
  "",
);

if (!apiKey) {
  console.error("META_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}
if (!apiKey.startsWith("LLM_")) {
  console.warn("Warning: Meta Model API keys normally start with LLM_.");
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, path: string) {
    super(`${path} failed with HTTP ${status}: ${body.slice(0, 2000)}`);
    this.status = status;
    this.body = body;
  }
}

export async function metaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

export async function metaJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await metaFetch(path, init);
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, text, path);
  return JSON.parse(text) as T;
}

export function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  return metaJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Uploads a local file to the Files API with a one-hour expiry. */
export async function uploadFile(filePath: string, mimeType: string): Promise<{ id: string }> {
  const form = new FormData();
  form.set("purpose", "user_data");
  form.set("expires_after[anchor]", "created_at");
  form.set("expires_after[seconds]", "3600");
  form.set("file", new Blob([readFileSync(filePath)], { type: mimeType }), basename(filePath));
  return metaJson<{ id: string }>("/files", { method: "POST", body: form });
}

export async function deleteFile(id: string): Promise<void> {
  const res = await metaFetch(`/files/${id}`, { method: "DELETE" });
  if (!res.ok) console.warn(`Could not delete file ${id}: HTTP ${res.status}`);
}

export function dataUrl(filePath: string, mimeType: string): string {
  return `data:${mimeType};base64,${readFileSync(filePath).toString("base64")}`;
}

export function mimeTypeOf(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop();
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    wav: "audio/wav",
  };
  const type = ext ? types[ext] : undefined;
  if (!type) throw new Error(`Unsupported file type: ${filePath}`);
  return type;
}

// Responses API shapes (only the fields the spikes read).
export interface ResponseItem {
  type: string;
  [key: string]: unknown;
}
export interface ResponsesResult {
  id: string;
  output: ResponseItem[];
  usage?: Record<string, unknown>;
}

/** Concatenates the text parts of every assistant message in a response. */
export function outputText(response: ResponsesResult): string {
  return response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => (item.content as { type: string; text?: string }[]) ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");
}

/** Reads a required CLI argument or exits with a usage line. */
export function requireArg(index: number, usage: string): string {
  const value = process.argv[2 + index];
  if (!value) {
    console.error(`Usage: ${usage}`);
    process.exit(1);
  }
  return value;
}

const resultsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "results");

/** Saves raw spike output under spikes/results/ (git-ignored) and returns the path. */
export function saveResult(spike: string, data: unknown): string {
  mkdirSync(resultsDir, { recursive: true });
  const file = join(resultsDir, `${spike}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
