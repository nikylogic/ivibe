# Contributing to iVibe

Thanks for your interest in iVibe. This guide covers how to set up the project, how changes are made and reviewed, and the agreements every contribution needs.

## Before you start

- **Bugs and ideas:** open an [issue](https://github.com/nikylogic/ivibe/issues/new/choose) first, so we can agree on the approach before you write code.
- **Security issues:** never in a public issue; follow [SECURITY.md](SECURITY.md).
- **Design:** read the relevant section of [docs/architecture.md](docs/architecture.md). Changes that contradict a decision in §1.2 need an issue to discuss the decision itself.

## Setup

**Prerequisites:** Node.js 24+ (see `.nvmrc`) and pnpm 12+.

```bash
pnpm install
pnpm ocr:fetch
pnpm check
```

`pnpm ocr:fetch` downloads the PaddleOCR models the recorder runs on-device. They are checked against pinned SHA-256 hashes and kept out of git.

`pnpm check` runs everything CI runs: ESLint, Prettier, TypeScript, Vitest and the dependency license check.

| Command               | What it does                                       |
| --------------------- | -------------------------------------------------- |
| `pnpm lint`           | ESLint over the whole repo                         |
| `pnpm format`         | Format with Prettier                               |
| `pnpm typecheck`      | Type-check every package                           |
| `pnpm test`           | Run every package's tests                          |
| `pnpm licenses:check` | Fail on dependencies outside the license allowlist |
| `pnpm ocr:fetch`      | Download the OCR models for tests and the app      |
| `pnpm spike <file>`   | Run a spike with `.env` loaded                     |

## Making a change

1. Fork the repo and create a branch from `main`: `feat/short-name`, `fix/short-name` or `docs/short-name`.
2. Keep the change focused. Add or update tests for behavior you change.
3. Run `pnpm check` before pushing.
4. Open a pull request and fill in the template. Link the issue it resolves.

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(redact): detect Stripe restricted keys
fix(capture): restart the stream after display sleep
docs: explain the evidence bundle format
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `chore`. The scope is the package or app name.

### Code style

- TypeScript in strict mode everywhere. Prefer small, typed modules over large ones.
- Every source file starts with `// SPDX-License-Identifier: AGPL-3.0-only`.
- Comments explain _why_, not _what_. Reference the architecture section when a design decision drives the code (for example `Design: docs/architecture.md §4.9`).
- Privacy rules are not optional: frames that reach an encoder or an upload must be `RedactedFrame`s, and model IDs must pass the allowlist in `packages/engine`.

### Dependencies

- Production dependencies must use a license on the allowlist in `scripts/license-check.ts` (MIT, Apache-2.0, BSD, ISC, MPL-2.0 and similar). GPL-family licenses are not accepted.
- Do not copy code from sources under incompatible licenses, including snippets from posts or answers that carry such a license.
- Prefer the platform (Web APIs, Node, Electron) over a new dependency.

## Contributor License Agreement

iVibe is licensed under the AGPL-3.0 and is also offered under a [commercial license](COMMERCIAL.md). To keep that possible, every contributor signs the [Contributor License Agreement](CLA.md) once. A bot comments on your first pull request with a link; signing takes a minute. You keep the copyright to your contribution.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to uphold it.
