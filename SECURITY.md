# Security Policy

iVibe handles screen recordings, narration and API keys, so we take security reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub: **[Report a vulnerability](https://github.com/nikylogic/ivibe/security/advisories/new)**. Alternatively, email **security@ivibe.tech**.

Please include:

- What the issue is and what an attacker could do with it.
- Steps to reproduce, or a proof of concept.
- The affected version, platform and component (desktop app, web app, API).

## What to expect

- An acknowledgement within **3 days**.
- An assessment and a fix plan within **10 days**.
- Credit in the release notes once a fix ships, unless you prefer to stay anonymous.

## Scope

Especially interesting to us:

- A secret (API key, token, password) that reaches an uploaded frame, clip or OCR text despite redaction.
- A user's Meta API key leaving their device, or becoming readable by a renderer process.
- Access to another user's analyses, reports, credits or account.
- Bypassing credit holds or payment verification.
- Using iVibe Cloud as a general-purpose model endpoint.

Out of scope: denial-of-service through volume, findings from automated scanners without a demonstrated impact, and missing hardening headers without an exploit.

## Supported versions

Until v1.0, only the latest release receives security fixes.
