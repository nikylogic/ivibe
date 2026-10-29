// SPDX-License-Identifier: AGPL-3.0-only

import { net } from "electron";
import { transcribeWav } from "@ivibe/engine";
import type { Language } from "@ivibe/engine";
import type { MetaAccess } from "./cloud.ts";
import { cloudTranscribe } from "./cloud.ts";

/**
 * Live captions (docs/architecture.md §4.6, Spike S5). Runs in main, where the BYOK key and the
 * Cloud session live; the renderer sees neither.
 */
export function transcribe(
  wav: Uint8Array,
  access: MetaAccess,
  languages: readonly Language[],
  signal?: AbortSignal,
): Promise<string> {
  if (access.kind === "cloud") return cloudTranscribe(wav, access.token, languages, signal);
  return transcribeWav(wav, languages, {
    apiKey: access.key,
    fetch: net.fetch as typeof fetch,
    signal,
  });
}
