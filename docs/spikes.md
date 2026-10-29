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
| S18   | Which Meta text model cleans up dictation fastest?                                                  | ✅ Passed            | Spark 1.3 at minimal effort is fastest (median 2.0 s); 1.1, 1.3-contributor and Wonder 2.3–2.5 s; default effort 5 s  | Keep Spark 1.3 at minimal; speed up the pipeline around the call instead                                  |
| S19   | What one more step of reasoning costs for Prompt and Fix                                            | ✅ Passed            | Prompt low ≈ minimal (3.0–4.6 s); Fix high ≈ medium (19–23 s on a 1080p recording, 14 s on a 720p fixture)            | Prompt at low, Fix at high; Fix latency is the image, not the reasoning                                   |
| S20   | Can free-trial runs use `muse-spark-1.3-contributor`?                                               | ✅ Passed            | Same quality on all three writers; Dictate 3.0 s vs 1.7–2.0 s, Prompt 7.2–7.8 s vs 4.1–6.2 s, Fix 23–33 s vs 13–14 s  | Trial-only accounts use it (D25); BYOK and paid keep `muse-spark-1.3`                                     |

## Log

### S23 · Oct 28, 2026

**Tested:** `spikes/meta/s23-auto-detect.ts`: real speech, not synthetic. Two 30-s Hindi health announcements and the start of a Spanish spoken-Wikipedia article (Wikimedia Commons, decoded to 16 kHz mono WAV), each transcribed with no `languageBias`, the right language, English only, and iVibe's default (English + Hindi).
**Result:** with no bias, both Hindi clips came back in Devanagari and the Spanish one in Spanish, so automatic detection works as the schema says. Even an English-only bias transcribed both languages correctly. The bias mostly decides how a word that fits both languages is written: one clip opened with "Dengue" (Latin) under no bias or English only, and "डेंगू" under a Hindi bias. Repeated words ("का का") appeared under every setting, so they come from the model, not the bias; the writers already remove them.
**Decision:** keep "Detect automatically" as a real option. Settings explains that choosing languages decides how mixed words are written, not that it is more accurate.

### S22 · Oct 28, 2026

**Tested:** `spikes/meta/s22-output-languages.ts`: muse-spark-1.3 at dictation's shipped effort (`minimal`, 2,000 output tokens) cleaning up one Hinglish dictation into each of Voice Transcribe's 25 languages. Meta documents no language list for Spark.
**Result:** all 25 replies were in the right script, and the identifier `handleSave` survived in every one. With a 400-token cap most replies were empty, so the shipped limits matter. "Write it in Arabic" produced Urdu (a transliteration of the Hindi); naming the variant and script ("Arabic (Modern Standard Arabic)", "Hindi (Devanagari)") plus "translate every part that is in another language" gave correct output.
**Decision:** output can be any of the 25. Each language carries an explicit prompt name with its variant and script, used in the writing instruction.

### S21 · Oct 28, 2026

**Tested:** `spikes/meta/s21-language-bias.ts`: one English Windows text-to-speech WAV sent to `/asr/transcribe` with `languageBias` set to each of the 25 documented names, then codes (`en`, `hi`, `en-US`), lower case, near misses (`Chinese`, `Filipino`) and unsupported names (`Klingon`, `Gujarati`).
**Result:** every request returned 200, including `Klingon`: the API never validates the value. The Voice schemas define it as free-form language names ("each as a language name, e.g. `["English", "French"]`"); omitting it lets the model detect the language. English was transcribed correctly under every bias, so the bias is a soft hint. Transcription never translates.
**Decision:** iVibe sends only the 25 documented names, spelled exactly as in the docs ("Mandarin Chinese", "Tagalog"), from one list in the engine, and omits `languageBias` for automatic detection. Output language is handled by the writer (S22).

### S20 · Oct 28, 2026

**Tested:** Dictate (minimal), Prompt (low) and Fix (high, with proof) through the engine's writers on `muse-spark-1.3` and, with `trial: true`, on `muse-spark-1.3-contributor`, 2 runs each on synthetic input (`spikes/meta/s20-trial-model.ts`).
**Result:** contributor output matched the standard model: the Dictate correction and dictionary applied (with better capitalisation), the same Prompt structure, and Fix found the `TypeError … reading 'map'` at `ProfileForm.tsx:41`. It was slower: Dictate 3.0–3.1 s vs 1.7–2.0 s, Prompt 7.2–7.8 s vs 4.1–6.2 s, Fix 23.2–32.6 s vs 13.2–14.4 s, with about 25% more Fix output tokens. At third-party prices ($0.10/$0.20 per million) a Fix costs about $0.001 instead of $0.018.
**Decision:** free-trial runs use the contributor model (D25), disclosed in the app; BYOK and paid runs stay on `muse-spark-1.3`. Metered at the standard rate until Meta's console confirms the price.

### S19 · Oct 28, 2026

**Tested:** Prompt at minimal vs low and Fix at medium vs high through the engine's writers (`spikes/meta/s19-reasoning.ts`, synthetic 720p "Save does nothing" frame), then Fix in the desktop self-test on a real 1080p keyframe with OCR lines.
**Result:** Prompt minimal 2.8–3.3 s, low 3.0–4.6 s, similar text. Fix on the fixture: medium 13.5–14.7 s, high 13.7–14.5 s, with a longer, more specific prompt (1,089 vs 843 characters) and proof still found. In the self-test, Spark took 21.4 and 21.6 s at medium and 22.7 and 18.8 s at high; SAM added 1.3–1.9 s.
**Decision:** Prompt at low, Fix at high; output caps raised to 3,000 and 12,000 tokens and Cloud reservations to $0.025 and $0.12. Fix's ~20 s is the high-detail 1080p image, so the next speed-up to test is a smaller keyframe or `detail: "auto"`, checked against proof-box accuracy.

### S18 · Oct 28, 2026

**Tested:** the exact Dictate prompt (D21 stack, Slack destination, a Hinglish transcript with a self-correction) on every text model `GET /v1/models` lists, 3 runs each, straight to Meta (`spikes/meta/s18-cleanup-models.ts`).
**Result:** median latency: `muse-spark-1.3` minimal 2.0 s (230 output tokens), `muse-spark-1.1` minimal 2.3 s, `muse-spark-1.3-contributor` 2.3 s, `muse-wonder-1.0` minimal 2.5 s (159 tokens), `muse-spark-1.2` minimal 3.2 s, `-1.2-contributor` 4.2 s; default effort 5.0–5.3 s with 1,000–1,500 tokens. Every model applied the correction ("Can Priya look at it?") and the dictionary ("iVibe"). Most outputs kept the Hindi filler "matlab".
**Decision:** keep `muse-spark-1.3` at minimal effort; no listed model is faster. `-contributor` models stay off the allowlist (inputs may train Meta models). Remaining latency is in the pipeline around the call (final caption, Worker hop, ledger writes), so measure and trim that next.

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
