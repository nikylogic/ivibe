# Spike results

Each spike from [architecture.md §2.10](architecture.md#210-day-0-spikes) gets an entry here once it has run: the date, what was tested, the result and the decision it drives. Raw outputs stay local in `spikes/results/`.

| Spike | Question                                                                                            | Status               | Result                                                                                                                | Decision                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| S1    | How does `muse-spark-1.3` sample an MP4, and what does a 60-s clip cost?                            | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S2    | Can Spark point to moments in a video accurately?                                                   | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S3    | `store: false` + encrypted reasoning + tools + follow-up images; is `previous_response_id` cheaper? | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S4    | JSON Schema output combined with tools                                                              | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S5    | Voice Transcribe on mixed Hindi and English                                                         | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S6    | SAM 3.1 on code-editor and browser screenshots                                                      | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S7    | Baseten Muse Spark Open: video, tools, JSON Schema                                                  | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S8    | Cost and latency of a full analysis                                                                 | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S9    | electron-builder signing with the self-signed macOS identity in CI                                  | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S10   | Exact model IDs from `GET /v1/models`                                                               | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S11   | Screen capture from the global hotkey without a picker                                              | ✅ Passed (Windows)  | `executeJavaScript(…, true)` + `getDisplayMedia` in the hidden recorder captured 1920×1080 with no picker             | Keep the primary path; build the `chromeMediaSource` fallback only if macOS needs it                    |
| S12   | PaddleOCR accuracy and speed on code screens                                                        | 🟡 Partial (Windows) | PP-OCRv5 mobile reads code and tokens; ~0.2 s per frame in Node, ~1.6 s per 1080p frame in the recorder (WebAssembly) | Ship it; add incremental OCR of changed tiles to reach the 700 ms target; run the 30-screenshot CER set |
| S13   | WebCodecs H.264 in Electron and Chrome on all OSes                                                  | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S14   | Better Auth with the Electron plugin on Workers + D1                                                | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S15   | Squirrel.Mac updates with the self-signed identity (P10)                                            | ⏳ Pending           |                                                                                                                       |                                                                                                         |
| S16   | A full analysis within the Workers Free plan's CPU limit                                            | ⏳ Pending           |                                                                                                                       |                                                                                                         |

## Log

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
