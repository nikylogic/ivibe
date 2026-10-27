// SPDX-License-Identifier: AGPL-3.0-only

import { assertAllowedModel } from "./models.ts";
import type { AllowedModel } from "./models.ts";

/**
 * A minimal client for the Meta Model API Responses endpoint (docs/architecture.md §5.3).
 * Requests always use `store: false`, so Meta keeps no conversation state (Spike S3).
 */

export const META_API_BASE = "https://api.meta.ai/v1";

export type InputContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail?: "low" | "high" | "auto" };

export interface InputMessage {
  role: "system" | "developer" | "user" | "assistant";
  content: string | InputContent[];
}

export interface ResponsesRequest {
  model: AllowedModel;
  input: InputMessage[];
  reasoning?: { effort: "minimal" | "low" | "medium" | "high" };
  text?: { format: Record<string, unknown> };
  max_output_tokens?: number;
}

interface ResponseItem {
  type: string;
  content?: { type: string; text?: string }[];
}

export interface ResponsesResult {
  id: string;
  output: ResponseItem[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class MetaApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
  }
}

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Injected so main-process code can use Electron's net.fetch and tests a fake. */
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

/** Turns an HTTP failure into a message a user can act on, without echoing the response body. */
function describeFailure(status: number): string {
  if (status === 401 || status === 403) return "Meta rejected the API key. Check it in Settings.";
  if (status === 429) return "Meta's rate limit was hit. Try again in a minute.";
  if (status >= 500) return "Meta's API is having trouble. Try again shortly.";
  return `The Meta API request failed (HTTP ${status}).`;
}

export async function createResponse(
  request: ResponsesRequest,
  { apiKey, baseUrl = META_API_BASE, fetch: fetchImpl = fetch, signal }: ClientOptions,
): Promise<ResponsesResult> {
  assertAllowedModel(request.model);
  const response = await fetchImpl(`${baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, store: false }),
    signal,
  });
  if (!response.ok) throw new MetaApiError(response.status, describeFailure(response.status));
  return (await response.json()) as ResponsesResult;
}

/** The text of every assistant message in a response. */
export function outputText(result: ResponsesResult): string {
  return result.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}
