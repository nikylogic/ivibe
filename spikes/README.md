# Spikes

Spikes are small, throwaway experiments that verify a fact about an API or a platform **before** we build on it. Each one answers a single question from [docs/architecture.md §2.10](../docs/architecture.md#210-day-0-spikes) and its result is written to [docs/spikes.md](../docs/spikes.md).

Spike code is deliberately simple and dependency-free. Production code lives in `packages/`.

## Running

1. Copy `.env.example` to `.env` and set `META_API_KEY`.
2. Run a spike with `pnpm spike <file> [args]`. Raw outputs are saved to `spikes/results/` (git-ignored, because they can describe private recordings).

| Spike   | Question                                                                                 | Command                                                                 |
| ------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| S10     | Which model IDs does the API expose?                                                     | `pnpm spike spikes/meta/s10-models.ts`                                  |
| S1 / S2 | How does Muse Spark read an MP4, how accurate are its timestamps, and what does it cost? | `pnpm spike spikes/meta/s1-video.ts clip.mp4`                           |
| S3      | Do `store: false`, encrypted reasoning, tools and a follow-up image work together?       | `pnpm spike spikes/meta/s3-tool-loop.ts shot.png [stateless\|previous]` |
| S4      | Can JSON Schema output be combined with tools?                                           | `pnpm spike spikes/meta/s4-schema-with-tools.ts`                        |
| S5      | Voice Transcribe on mixed Hindi and English narration                                    | `pnpm spike spikes/meta/s5-transcribe.ts narration.wav`                 |

Use only recordings and screenshots of your own test apps. Never use material that shows real secrets.
