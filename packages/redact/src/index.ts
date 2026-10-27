// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @packageDocumentation
 * Secret detection and redaction. Only this package can create a RedactedFrame.
 *
 * Design: docs/architecture.md §4.9.
 */

export { scanFrame } from "./scan.ts";
export type { Redaction, ScanOptions, ScanReport } from "./scan.ts";
export { assertRedacted, paintOffscreen, redact } from "./redacted-frame.ts";
export type { Painter, RedactedFrame, ScannedFrame } from "./redacted-frame.ts";
export type { RuleId } from "./rules.ts";
