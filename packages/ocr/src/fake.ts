// SPDX-License-Identifier: AGPL-3.0-only

import { toOcrLines } from "./lines.ts";
import type { TextRun } from "./lines.ts";
import type { OcrEngine, OcrLine, RecognizeOptions } from "./types.ts";

/** Returns fixed text runs for every frame. For unit tests. */
export class FakeOcr implements OcrEngine {
  readonly name = "fake";
  readonly #runs: readonly TextRun[];

  constructor(runs: readonly TextRun[]) {
    this.#runs = runs;
  }

  recognize(_image: unknown, { frame }: RecognizeOptions): Promise<OcrLine[]> {
    return Promise.resolve(toOcrLines(frame, this.#runs));
  }
}
