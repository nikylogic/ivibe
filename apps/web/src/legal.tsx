// SPDX-License-Identifier: AGPL-3.0-only

import * as stylex from "@stylexjs/stylex";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { Footer } from "./finale.tsx";
import { TopBar } from "./home.tsx";
import { Nav } from "./nav.tsx";
import { breadcrumbs, usePageMeta } from "./seo.ts";
import { ivibeTheme } from "./theme.ts";

/** The promises the site makes, in plain words, one short page each. */

const CONTACT = "business@ivibe.tech";
const UPDATED = "November 1, 2026";

export type LegalPageName = "privacy" | "terms" | "refunds";

const PAGES: Record<
  LegalPageName,
  {
    title: string;
    seoTitle: string;
    description: string;
    sections: { heading: string; body: string[] }[];
  }
> = {
  privacy: {
    title: "Privacy",
    seoTitle: "Privacy Policy · iVibe",
    description:
      "What stays on your computer, what goes to Meta's models, what iVibe keeps, and the choices you have. No analytics, and secrets are painted over first.",
    sections: [
      {
        heading: "On your device",
        body: [
          "Screens are read on your computer, and secrets are painted over before anything leaves it. Unredacted frames are never written to disk or uploaded.",
          "Your history stays on your computer. You can turn it off or clear it in Settings. A Meta API key is encrypted with your system keychain.",
        ],
      },
      {
        heading: "What goes to Meta",
        body: [
          "To do its job, iVibe sends your voice, the redacted screenshots of a Fix, and your text to Meta's models.",
          "With your own key, these go straight to Meta under your Meta account. With Pro, they pass through iVibe and aren't kept. On free credits, Meta may use them to improve its models.",
        ],
      },
      {
        heading: "What iVibe keeps",
        body: [
          "If you sign in: your GitHub ID, username, name and email, your credit balance, and a record of each run (its type, cost and time). To limit abuse of free credits, we also keep hashed identifiers of your computer and network.",
          "Payments are handled by Dodo Payments, the merchant of record. iVibe never sees your card details.",
          "We email you when you first sign in and when you start Pro, using the address on your GitHub account. We don't send marketing without asking first.",
          "Buying on this site sets one cookie that keeps you signed in for 30 days, only so you can buy or manage Pro. It doesn't track you, and signing out removes it.",
          "Pro backups are encrypted on your computer with a recovery key only you hold, so iVibe can't read them. They are kept while Pro is active and for 90 days after it ends, or deleted sooner if you ask.",
          "Server logs last a few days and contain no transcripts, screen text or images. The app and this site have no analytics.",
        ],
      },
      {
        heading: "Who else is involved",
        body: [
          "Meta (models), Cloudflare (hosting, storage and forwarding mail to us), Dodo Payments (payments), GitHub (sign-in and downloads) and Resend (sending email).",
        ],
      },
      {
        heading: "Your choices",
        body: [
          `You can use iVibe with your own key and no account. To get a copy of your data or delete your account, write to ${CONTACT}. Billing records are kept as long as tax law requires.`,
        ],
      },
    ],
  },
  terms: {
    title: "Terms",
    seoTitle: "Terms of Service · iVibe",
    description:
      "The terms for using iVibe: credits and Pro, using your own Meta key, AI mistakes and the warranty.",
    sections: [
      {
        heading: "Using iVibe",
        body: [
          "The app is open source under AGPL-3.0, which sets your rights to use, change and share its code. These terms cover iVibe's paid and hosted services: free credits, Pro and backups.",
          "Don't use the services to break the law, to harm others, or to get around usage limits. We may withhold free credits from, or suspend, accounts that abuse them.",
        ],
      },
      {
        heading: "Credits and Pro",
        body: [
          "Pro costs $8 a month and renews until you cancel. Each payment resets your balance to 400 credits; unused credits don't roll over, and they end when the plan ends.",
          "Credits have no cash value, can't be transferred, and can only be spent on iVibe. Prices and credit amounts may change, and we'll tell you before a change affects your plan.",
        ],
      },
      {
        heading: "Your own key",
        body: [
          "With your own Meta key, Meta bills you directly and Meta's terms apply to that use.",
        ],
      },
      {
        heading: "AI makes mistakes",
        body: [
          "Prompts, text and screenshots are generated by AI and can be wrong. Redaction is automatic and can miss things. Check results before you send or rely on them.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "iVibe is provided as is, without warranties, and may change or stop. As far as the law allows, we aren't liable for indirect losses, and our total liability is limited to what you paid in the last three months.",
        ],
      },
      {
        heading: "Questions",
        body: [`Write to ${CONTACT}. If these terms change, we'll update this page.`],
      },
    ],
  },
  refunds: {
    title: "Refunds",
    seoTitle: "Refund Policy · iVibe",
    description: "How refunds and cancellations work for iVibe Pro, and how to ask for one.",
    sections: [
      {
        heading: "Cancelling",
        body: ["Cancel Pro anytime from the billing portal, and you won't be charged again."],
      },
      {
        heading: "Refunds",
        body: [
          `If a charge is wrong or iVibe didn't work for you, write to ${CONTACT} within 7 days of the charge, with the email on your account. We review each request, and approved refunds are issued through Dodo Payments to your original payment method.`,
        ],
      },
      {
        heading: "Free credits",
        body: ["Free credits have no cash value and can't be refunded."],
      },
    ],
  },
};

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-primary)",
  },
  main: {
    maxWidth: 640,
    marginInline: "auto",
    paddingInline: 24,
    paddingTop: { default: 136, "@media (max-width: 760px)": 104 },
    paddingBottom: 72,
  },
  title: {
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontWeight: 400,
    fontSize: "clamp(36px, 5vw, 48px)",
    lineHeight: 1.05,
    letterSpacing: "-0.01em",
    margin: 0,
  },
});

export function LegalPage({
  name,
  mode,
  onModeChange,
}: {
  name: LegalPageName;
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  const page = PAGES[name];
  usePageMeta({
    title: page.seoTitle,
    description: page.description,
    path: `/${name}`,
    jsonLd: [breadcrumbs({ name: "iVibe", path: "/" }, { name: page.title, path: `/${name}` })],
  });
  return (
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode={mode}>
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <Nav page="legal" />
      <main {...stylex.props(styles.main)}>
        <VStack gap={8}>
          <VStack gap={2}>
            <Heading level={1} xstyle={styles.title}>
              {page.title}
            </Heading>
            <Text size="sm" color="secondary">
              Last updated {UPDATED}
            </Text>
          </VStack>
          {page.sections.map((section) => (
            <VStack key={section.heading} gap={2}>
              <Heading level={2}>{section.heading}</Heading>
              {section.body.map((paragraph) => (
                <Text key={paragraph} color="secondary">
                  {paragraph}
                </Text>
              ))}
            </VStack>
          ))}
          <Link href="/" size="sm">
            Back to iVibe
          </Link>
        </VStack>
      </main>
      <Footer mode={mode} onModeChange={onModeChange} />
    </div>
  );
}
