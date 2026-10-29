// SPDX-License-Identifier: AGPL-3.0-only

import { spanBox, splitWords } from "@ivibe/ocr";
import type { LineId, OcrLine, Rect } from "@ivibe/ocr";
import {
  ENTROPY,
  ENV_CONTEXT,
  ENV_LINE,
  PATTERN_RULES,
  SENSITIVE_APP,
  isHighEntropyToken,
} from "./rules.ts";
import type { PatternRule, RuleId } from "./rules.ts";

/** One opaque box to paint over the frame. */
export interface Redaction {
  rule: RuleId;
  /** The line the secret was on; absent for whole-frame blackouts. */
  lineId?: LineId;
  rect: Rect;
}

export interface ScanReport {
  /** Boxes to paint, in frame pixel coordinates. */
  boxes: Redaction[];
  /** The whole frame must be blacked out (a password manager was on screen). */
  blackout: boolean;
  /** The OCR lines with every secret character replaced by "•", so the text is safe to send. */
  lines: OcrLine[];
}

export interface ScanOptions {
  width: number;
  height: number;
}

const MASK = "•";

interface Span {
  start: number;
  end: number;
  rule: RuleId;
}

export function matchRule(text: string, rule: PatternRule): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(rule.pattern)) {
    const value = rule.group === undefined ? match[0] : match[rule.group];
    if (!value) continue;
    const offset = rule.group === undefined ? 0 : match[0].lastIndexOf(value);
    const start = match.index + offset;
    spans.push({ start, end: start + value.length, rule: rule.id });
  }
  return spans;
}

export function entropySpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(ENTROPY.candidate)) {
    if (isHighEntropyToken(match[0])) {
      spans.push({ start: match.index, end: match.index + match[0].length, rule: "high-entropy" });
    }
  }
  return spans;
}

/** Merges overlapping spans; the first rule to claim a character names the merged span. */
export function merge(spans: Span[]): Span[] {
  const sorted = spans.toSorted((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/** Pads a box so interpolated character positions can't leave a sliver of a secret visible. */
function pad(rect: Rect, { width, height }: ScanOptions): Rect {
  const dx = Math.max(4, rect.height * 0.35);
  const dy = Math.max(2, rect.height * 0.15);
  const x = Math.max(0, rect.x - dx);
  const y = Math.max(0, rect.y - dy);
  return {
    x,
    y,
    width: Math.min(width, rect.x + rect.width + dx) - x,
    height: Math.min(height, rect.y + rect.height + dy) - y,
  };
}

/**
 * Finds secrets in one frame's OCR lines (docs/architecture.md §4.9) and returns the boxes to
 * paint plus a masked copy of the text.
 */
export function scanFrame(lines: readonly OcrLine[], options: ScanOptions): ScanReport {
  const sensitive = lines.some((line) => SENSITIVE_APP.test(line.text));
  if (sensitive) {
    return {
      boxes: [{ rule: "sensitive-app", rect: { x: 0, y: 0, ...options } }],
      blackout: true,
      lines: [],
    };
  }

  const envContext = lines.some((line) => ENV_CONTEXT.test(line.text));
  const boxes: Redaction[] = [];
  const masked = lines.map((line) => {
    const found = PATTERN_RULES.flatMap((rule) => matchRule(line.text, rule));
    if (envContext) found.push(...matchRule(line.text, ENV_LINE));
    found.push(...entropySpans(line.text));
    if (found.length === 0) return line;

    const spans = merge(found);
    let text = line.text;
    for (const span of spans) {
      boxes.push({
        rule: span.rule,
        lineId: line.id,
        rect: pad(spanBox(line, span.start, span.end), options),
      });
      text = text.slice(0, span.start) + MASK.repeat(span.end - span.start) + text.slice(span.end);
    }
    return { ...line, text, words: splitWords({ text, bbox: line.bbox }) };
  });

  return { boxes, blackout: false, lines: masked };
}
