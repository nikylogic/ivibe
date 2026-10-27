✅ Passed | `muse-spark-1.3`, `muse-wonder-1.0`, `muse-voice-transcribe-1.0`, `sam-3.1` listed (plus 1.1/1.2, `-contributor` variants, `muse-image-1.0`) | Model IDs in `ALLOWED_MODELS` are correct |

Each spike from [architecture.md §2.10](architecture.md#210-day-0-spikes) gets an entry here once it has run: the date, what was tested, the result and the decision it drives. Raw outputs stay local in `spikes/results/`.

| Spike | Question                                                                                            | Status               | Result                                                                                                                | Decision                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| S1    | How does `muse-spark-1.3` sample an MP4, and what does a 60-s clip cost?                            | 🟡 Partial           | Accepts an MP4 as `input_video`, but ignores its audio track                                                          | Narration goes to Voice Transcribe separately; Fix sends keyframes, not video. Cost per clip not measured |
| S2    | Can Spark point to moments in a video accurately?                                                   | ⏳ Pending           |                                                                                                                       |                                                                                                           |
| S3    | `store: false` + encrypted reasoning + tools + follow-up images; is `previous_response_id` cheaper? | ✅ Passed            | Stateless turns 1.6 s and 3.0 s; tool loop works with `store: false`                                                  | Stateless loop (see log)                                                                                  |
| S4    | JSON Schema output combined with tools                                                              | ✅ Passed            | JSON Schema output and tools work together                                                                            | Schema-formatted final output                                                                             |
| S5    | Voice Transcribe on mixed Hindi and English                                                         | 🟡 Partial (English) | 9 timestamped turns from a 27-s English narration                                                                     | Needs a real Hindi + English recording                                                                    |
| S6    | SAM 3.1 on code-editor and browser screenshots                                                      | ✅ Passed            | Box prompts snap to the element in about 2 s; concept prompts ("save button") find nothing                            | Box prompts only; short labels padded 24 px so SAM grows them to the button                               |
| S7    | Baseten Muse Spark Open: video, tools, JSON Schema                                                  | ⏳ Pending           |                                                                                                                       |                                                                                                           |
| S8    | Cost and latency of a full analysis                                                                 | ⏳ Pending           |                                                                                                                       |                                                                                                           |
| S9    | electron-builder signing with the self-signed macOS identity in CI                                  | ⏳ Pending           |                                                                                                                       |                                                                                                           |
| S10   | Exact model IDs from `GET /v1/models`                                                               | ✅ Passed            | All four models listed by `GET /v1/models`                                                                            | IDs pinned in the engine's model allowlist                                                                |
| S11   | Screen capture from the global hotkey without a picker                                              | ✅ Passed (Windows)  | `executeJavaScript(…, true)` + `getDisplayMedia` in the hidden recorder captured 1920×1080 with no picker             | Keep the primary path; build the `chromeMediaSource` fallback only if macOS needs it                      |
| S12   | PaddleOCR accuracy and speed on code screens                                                        | 🟡 Partial (Windows) | PP-OCRv5 mobile reads code and tokens; ~0.2 s per frame in Node, ~1.6 s per 1080p frame in the recorder (WebAssembly) | Ship it; add incremental OCR of changed tiles to reach the 700 ms target; run the 30-screenshot CER set   |
| S13   | WebCodecs H.264 in Electron and Chrome on all OSes                                                  | ⏳ Pending           |                                                                                                                       |                                                                                                           |
| S14   | Better Auth with the Electron plugin on Workers + D1                                                | ⏳ Pending           |                                                                                                                       |                                                                                                           |
| S15   | Squirrel.Mac updates with the self-signed identity (P10)                                            | ⏳ Pending           |                                                                                                                       |                                                                                                           |
| S16   | A full analysis within the Workers Free plan's CPU limit                                            | ⏳ Pending           |                                                                                                                       |                                                                                                           |
| S17   | Quality and latency of the Dictate and Prompt writers                                               | ✅ Passed            | Minimal reasoning: 1.2–2 s, against 3–5 s at the default effort                                                       | Minimal reasoning for Dictate and Prompt; medium for Fix                                                  |

## Log

### S6, S17 · Oct 27–28, 2026

**S6 tested:** SAM 3.1 through the Responses API on redacted keyframes from the self-test's "Edit profile" fixture (`spikes/meta/s6-sam-proof.ts`), with box prompts (`<|box;x1=…|>`) and concept prompts.
**Result:** a box prompt returns a refined box and mask in about 2 s. Concept prompts such as "save button" return nothing on screenshots. A box around just the button's text, padded by 24 px, grows to the whole button.
**Decision:** proof highlights use box prompts only; the model's proposed box, or a short OCR label padded by 24 px, goes to SAM, and the result is accepted only if it still contains the text and doesn't grow absurdly (`packages/engine/src/proof.ts`).

**S17 tested:** the Dictate and Prompt writers (`spikes/meta/s17-writers.ts`) on three transcripts: a Hinglish feature request, a bug narration, and a Slack message with a misheard product name.
**Result:** minimal reasoning answered in 1.2–2 s against 3–5 s at the default effort, with the same quality on these cases. With the prompt stack (D21), the bug narration became a first-person prompt ("When I … click Save, nothing happens") instead of instructions to the agent, and the personal dictionary fixed "I vibe" → "iVibe".
**Decision:** minimal reasoning for Dictate and Prompt. Quality still needs the eval suite (§15) rather than three cases.

### S3, S4, S5, S10 · Oct 27, 2026

**Tested:** the Meta Model API with the project key: `GET /v1/models`; a two-turn tool loop on a synthetic "Save does nothing" screenshot (`spikes/fixtures/make-screenshot.ts`); `text.format` with tools; `/asr/transcribe` on a 27-s English narration from Windows text-to-speech.
**Result:** all four models are available. Stateless turns took 1.6 s and 3.0 s (2,360 tokens for the second); the model asked for the frame through `view_frames`, then described the `.map` TypeError and the 200 response. Schema output and tools work together. Transcription returned 9 timestamped turns.
**Decision:** stateless loop, schema-formatted final report. S5 needs a real Hindi + English recording before it is closed.

### S12 · Oct 27, 2026

**Tested:** PP-OCRv5 mobile English (`ppu-paddle-ocr` 6.6.1) on `onnxruntime-node` against a rendered dark-theme editor, and on ONNX Runtime Web inside the recorder through `--ivibe-selftest`, which shows a fake editor with a fake GitHub token.
**Result:** the `per-line` recognition strategy dropped a short line (confidence 0.27); `cross-line` read all three lines at 0.99–1.0 confidence and was fastest (~190 ms). OCR misread `l2`→`112` and `O5`→`05` inside the token, so the redaction rules match token shape rather than exact characters. In the recorder, 37 lines were read across 2 keyframes at ~1.6 s per frame, and the token was redacted in both frames without network access.
**Decision:** use `cross-line`. Speed is over the 700 ms target, so incremental OCR (§4.8) is next. The character error rate (CER) run on 30 screenshots is still to do.

### S11 · Oct 27, 2026

**Tested:** `apps/desktop --ivibe-selftest` on Windows 11: main grants the display under the cursor through `setDisplayMediaRequestHandler` and starts capture with `webContents.executeJavaScript(…, true)` in the hidden recorder window.
**Result:** capture started in under a second without a picker; 1920×1080 frames sampled at 4 fps; 2.5 s of microphone narration encoded as 16 kHz WAV.
**Decision:** keep the primary path. Re-run on macOS through volunteer testers (§11.5).

<!-- Newest first. Template:

### S10 · Oct 27, 2026
**Tested:** …
**Result:** …
**Decision:** …
-->
