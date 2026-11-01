// SPDX-License-Identifier: AGPL-3.0-only

import type { Context } from "hono";
import type { AppEnv, Env } from "./env.ts";
import { now } from "./util.ts";

/**
 * Automated email (D32), sent through Resend. Sign-in and payment only add a row to email_outbox:
 * a failure here can never stop either one. The row is sent straight away when possible, and the
 * 10-minute cron retries whatever is left.
 */

export type EmailKind = "welcome" | "pro";

const FROM = "iVibe <hello@ivibe.tech>";
/** Resend's free plan allows 100 a day; the rest of the room is for replies sent from Gmail. */
const DAILY_LIMIT = 90;
const BATCH = 20;
/** At one try every 10 minutes, about four hours of a provider or domain problem. */
const MAX_ATTEMPTS = 24;
const DAY_MS = 86_400_000;

/** One statement, so it can join the same transaction as the event that caused the email. */
export const queueEmail = (db: D1Database, userId: string, kind: EmailKind): D1PreparedStatement =>
  db
    .prepare(
      "INSERT OR IGNORE INTO email_outbox (id, user_id, kind, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(`${kind}:${userId}`, userId, kind, now());

const INK = "#2a2622";
const FAINT = "#6f675c";
const PAPER = "#f6f2e8";
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

interface Message {
  subject: string;
  /** Shown beside the subject in the inbox. */
  preview: string;
  title: string;
  paragraphs: string[];
  /** Label and description of each line, for a short list under the text. */
  rows?: [string, string][];
  button: { label: string; href: string };
  footnote: string;
}

export function emailHtml(site: string, message: Message): string {
  const paragraphs = message.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 14px;font:16px/1.55 ${SANS};color:${INK};">${escapeHtml(text)}</p>`,
    )
    .join("");
  const rows = (message.rows ?? [])
    .map(
      ([label, text]) =>
        `<tr><td valign="top" style="padding:7px 16px 7px 0;font:600 15px/1.45 ${SANS};color:${INK};white-space:nowrap;">${escapeHtml(label)}</td><td valign="top" style="padding:7px 0;font:15px/1.45 ${SANS};color:${FAINT};">${escapeHtml(text)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(message.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(message.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffdf8;border:1px solid #e8e2d4;border-radius:20px;"><tr><td style="padding:36px 32px 32px;">
<img src="${site}/icon-192.png" width="56" height="56" alt="iVibe" style="display:block;border:0;border-radius:14px;margin:0 0 24px;">
<h1 style="margin:0 0 16px;font:400 36px/1.1 ${SERIF};letter-spacing:-0.01em;color:${INK};">${escapeHtml(message.title)}</h1>
${paragraphs}
${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 14px;">${rows}</table>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 22px;"><tr><td style="background:#0f0e0d;border-radius:17px;"><a href="${escapeHtml(message.button.href)}" style="display:inline-block;padding:12px 24px;font:600 15px/1 ${SANS};color:#f4f1ea;text-decoration:none;">${escapeHtml(message.button.label)}</a></td></tr></table>
<p style="margin:0;font:14px/1.5 ${SANS};color:${FAINT};">${escapeHtml(message.footnote)}</p>
</td></tr></table>
<p style="margin:20px 0 0;font:12px/1.5 ${SANS};color:${FAINT};"><a href="${site}" style="color:${FAINT};">ivibe.tech</a> · Made in the open</p>
</td></tr></table>
</body></html>`;
}

export function emailText(message: Message): string {
  return [
    message.title,
    "",
    ...message.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(message.rows ?? []).map(([label, line]) => `${label}: ${line}`),
    ...(message.rows ? [""] : []),
    `${message.button.label}: ${message.button.href}`,
    "",
    message.footnote,
  ].join("\n");
}

export function messageFor(kind: EmailKind, site: string, login: string | null): Message {
  if (kind === "welcome") {
    return {
      subject: "Welcome to iVibe",
      preview: "Your voice, turned into prompts and clean text.",
      title: "You're in.",
      paragraphs: [
        login
          ? `Hi @${login}. Press a shortcut, talk, and iVibe does the rest.`
          : "Press a shortcut, talk, and iVibe does the rest.",
      ],
      rows: [
        ["Fix", "Show the bug and say what's wrong. Get a prompt with marked-up screenshots."],
        ["Prompt", "Say what you want built. Get a clear prompt for your coding agent."],
        ["Dictate", "Talk anywhere. Get clean text without the ums."],
      ],
      button: { label: "Download iVibe", href: `${site}/download` },
      footnote: "Stuck on anything? Just reply. A real person reads these.",
    };
  }
  return {
    subject: "You're on iVibe Pro",
    preview: "400 credits a month, encrypted backups, no API key needed.",
    title: "You're on Pro.",
    paragraphs: [
      "You get 400 credits a month and encrypted backups, with no API key to manage.",
      login
        ? `Sign in to the app with GitHub as @${login} and Pro is ready.`
        : "Sign in to the app with the same GitHub account and Pro is ready.",
    ],
    button: { label: "Get started", href: `${site}/welcome` },
    footnote: "You can cancel anytime from the billing portal. Questions? Just reply.",
  };
}

/** Sends what's waiting, stopping at the daily limit so the rest simply wait for tomorrow. */
export async function sendQueuedEmails(env: Env): Promise<number> {
  const key = env.RESEND_API_KEY;
  if (!key) return 0;
  const db = env.DB;
  const counted = await db
    .prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE sent_at > ?")
    .bind(now() - DAY_MS)
    .first<{ n: number }>();
  const room = DAILY_LIMIT - (counted?.n ?? 0);
  if (room <= 0) return 0;
  const { results } = await db
    .prepare(
      `SELECT o.id, o.kind, o.attempts, u.email, u.github_login FROM email_outbox o
       JOIN users u ON u.id = o.user_id WHERE o.status = 'queued'
       ORDER BY o.created_at LIMIT ?`,
    )
    .bind(Math.min(room, BATCH))
    .all<{
      id: string;
      kind: EmailKind;
      attempts: number;
      email: string | null;
      github_login: string | null;
    }>();

  let sent = 0;
  for (const row of results) {
    if (!row.email) {
      // GitHub gave us no address for this account, so there's nowhere to send it.
      await db
        .prepare("UPDATE email_outbox SET status = 'skipped' WHERE id = ?")
        .bind(row.id)
        .run();
      continue;
    }
    const message = messageFor(row.kind, env.SITE_URL, row.github_login);
    let response: Response | null = null;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          // Two runs picking up the same row still send one email.
          "Idempotency-Key": row.id,
        },
        body: JSON.stringify({
          from: FROM,
          to: [row.email],
          reply_to: "hello@ivibe.tech",
          subject: message.subject,
          html: emailHtml(env.SITE_URL, message),
          text: emailText(message),
        }),
      });
    } catch (error) {
      console.error("email: Resend unreachable", error);
    }
    if (response?.ok) {
      await db
        .prepare("UPDATE email_outbox SET status = 'sent', sent_at = ? WHERE id = ?")
        .bind(now(), row.id)
        .run();
      sent++;
      continue;
    }
    if (response?.status === 429) break; // Rate limited: leave everything for the next run.
    if (response) console.error(`email: Resend said ${response.status} for a ${row.kind} email`);
    const attempts = row.attempts + 1;
    await db
      .prepare("UPDATE email_outbox SET attempts = ?, status = ? WHERE id = ?")
      .bind(attempts, attempts >= MAX_ATTEMPTS ? "failed" : "queued", row.id)
      .run();
  }
  return sent;
}

/** Tries to send right after the response, so a new user's email isn't waiting on the cron. */
export function sendSoon(c: Context<AppEnv>): void {
  try {
    c.executionCtx.waitUntil(
      sendQueuedEmails(c.env).catch((error: unknown) => console.error("email:", error)),
    );
  } catch {
    // No execution context (tests): the cron sends it instead.
  }
}
