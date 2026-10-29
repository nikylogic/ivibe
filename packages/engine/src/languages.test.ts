// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { LANGUAGES, languageRule } from "./languages.ts";
import { dictateTask, fixTask, promptTask } from "./prompts/tasks.ts";
import { transcribeRequest } from "./transcribe.ts";

describe("languages", () => {
  it("lists Voice Transcribe's 25 languages, spelled as Meta documents them", () => {
    expect(LANGUAGES).toHaveLength(25);
    const names = LANGUAGES.map((language) => language.name);
    expect(names).toContain("Mandarin Chinese");
    expect(names).toContain("Tagalog");
    expect(names).not.toContain("Chinese");
  });

  it("biases transcription toward the chosen languages, or leaves it to detection", () => {
    expect(JSON.parse(transcribeRequest(["English", "Hindi"]))).toEqual({
      model: "muse-voice-transcribe-1.0",
      mode: "ENDPOINTING",
      audioEncoding: "WAV",
      languageBias: ["English", "Hindi"],
    });
    expect(JSON.parse(transcribeRequest([]))).not.toHaveProperty("languageBias");
  });

  it("never sends a name Meta doesn't document", () => {
    const request = JSON.parse(transcribeRequest(["Klingon", "Tamil"] as never)) as {
      languageBias: string[];
    };
    expect(request.languageBias).toEqual(["Tamil"]);
  });

  it("names the variant and script when writing in a language", () => {
    expect(languageRule("Arabic")).toContain("Modern Standard Arabic");
    expect(languageRule("Hindi")).toContain("Devanagari");
    expect(languageRule("auto")).toContain("Do not translate");
  });

  it("ends every mode with the chosen language", () => {
    for (const task of [
      dictateTask("Spanish"),
      promptTask("Cursor", "Spanish"),
      fixTask("Cursor", true, "Spanish"),
    ]) {
      expect(task).toContain(languageRule("Spanish"));
      expect(task).not.toContain("Write in English");
    }
  });
});
