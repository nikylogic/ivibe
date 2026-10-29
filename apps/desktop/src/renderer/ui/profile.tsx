// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { Text } from "@astryxdesign/core/Text";
import { Blobatar } from "@blobatar/react";
import { happy } from "blobatar/expression";
import "blobatar/motion.css";
import {
  ChevronsUpDown,
  CreditCard,
  KeyRound,
  LogIn,
  LogOut,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { CloudStatus } from "../../shared/ipc.ts";
import type { SettingsSection } from "./settings-page.tsx";
import type { ByokState, CloudState } from "./state.ts";

/**
 * The sidebar's footer: who is using iVibe and on which plan (Free, Trial or Pro), with a menu
 * for the account. Credit numbers stay on Settings → Billing on purpose: a balance ticking down
 * in the corner makes every recording feel like it costs something.
 */

/**
 * A signed-in account gets its own blobatar, drawn on the device from the GitHub login (stable
 * when the display name changes; nothing is fetched). Guests keep the plain initial. Static on
 * purpose: nothing in the sidebar moves on its own.
 */
function UserAvatar({
  name,
  login,
  size,
  isHappy = false,
}: {
  name: string;
  login?: string;
  size: 32 | 36;
  isHappy?: boolean;
}) {
  if (!login) return <Avatar name={name} size={size} />;
  // No backdrop: the blob stands on the sidebar itself, drawn a little larger than the slot so
  // it reads at the size of an avatar. It wakes on hover (global.css extends that to the whole
  // account button) and is still otherwise; reduced motion is honoured by blobatar's stylesheet.
  return (
    <span {...stylex.props(styles.blob)} style={{ width: size, height: size }}>
      <Blobatar
        name={login.toLowerCase()}
        size={Math.round(size * 1.25)}
        background={false}
        animate="hover"
        expression={isHappy ? happy : undefined}
        aria-hidden
      />
    </span>
  );
}

/** A short happy face when the account button is pressed. */
function useCheer(): [boolean, () => void] {
  const [isHappy, setHappy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cheer = () => {
    clearTimeout(timer.current);
    setHappy(true);
    timer.current = setTimeout(() => setHappy(false), 900);
  };
  return [isHappy, cheer];
}

const styles = stylex.create({
  blob: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  badge: { display: "inline-flex", flexShrink: 0 },
  footer: { display: "flex", flexDirection: "column", gap: 8, width: "100%" },
  row: { display: "flex", alignItems: "center", gap: 4, width: "100%" },
  trigger: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingBlock: 6,
    // Pulled out by its own padding, so the avatar's centre is the nav icons' column (36 px) both
    // expanded and collapsed: centred in the rail, and no jump when the layout swaps.
    marginInlineStart: -4,
    paddingInlineStart: 4,
    paddingInlineEnd: 8,
    borderWidth: 0,
    borderRadius: 10,
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--color-overlay-hover)",
    },
    color: "inherit",
    font: "inherit",
    textAlign: "start",
    cursor: "pointer",
  },
  triggerCollapsed: { flex: "none", paddingInlineEnd: 4 },
  name: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: 600,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingBlock: 10,
    paddingInline: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--color-border)",
  },
  headerText: { display: "flex", flexDirection: "column", minWidth: 0 },
  chevron: { marginInlineStart: "auto", flexShrink: 0, opacity: 0.6 },
  nudge: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginInline: 2,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
  },
  buttons: { display: "flex", gap: 8, flexWrap: "wrap" },
});

type Tier = NonNullable<CloudStatus["tier"]>;

const BADGE: Record<Tier, { label: string; variant: "purple" | "info" | "neutral" }> = {
  pro: { label: "Pro", variant: "purple" },
  trial: { label: "Trial", variant: "info" },
  free: { label: "Free", variant: "neutral" },
};

const icon = (Icon: typeof Settings2) => <Icon size={16} strokeWidth={1.75} />;

export function ProfileFooter({
  byok,
  cloud,
  personalName,
  collapsed,
  onOpen,
}: {
  byok: ByokState;
  cloud: CloudState;
  /** Settings → Personal → name, for someone who hasn't signed in. */
  personalName: string;
  collapsed: boolean;
  onOpen: (section: SettingsSection) => void;
}) {
  const status = cloud.status;
  if (!status || !byok.status) return null;
  const hasKey = byok.status.hasKey;
  const signedIn = status.signedIn;
  const [isHappy, cheer] = useCheer();
  const tier: Tier = signedIn ? (status.tier ?? "free") : "free";
  const name = signedIn ? status.name || status.login || "You" : personalName.trim() || "Guest";
  const paymentTrouble =
    tier === "pro" && (status.plan?.status === "on_hold" || status.plan?.status === "past_due");
  const canBuy = tier !== "pro" && !!status.planOffer?.available;
  // Blocked: a Cloud user with nothing left to run on. Said without a number.
  const outOfCredits = signedIn && !hasKey && status.credits === 0;
  const pro = tier === "pro";

  // Short rows, no descriptions: who you are and your plan sit in the menu's header.
  const items: DropdownMenuOption[] = signedIn
    ? [
        {
          type: "section",
          items: [
            ...(canBuy
              ? [
                  {
                    label: "Get iVibe Pro",
                    icon: icon(Sparkles),
                    onClick: () => cloud.billing("checkout"),
                  },
                ]
              : []),
            { label: "Billing", icon: icon(CreditCard), onClick: () => onOpen("billing") },
            // Pro needs no key; one already added stays easy to find.
            ...(pro && !hasKey
              ? []
              : [
                  {
                    label: hasKey ? "Meta API key" : "Add Meta API key",
                    icon: icon(KeyRound),
                    onClick: () => onOpen("key"),
                  },
                ]),
          ],
        },
        { type: "divider" },
        { label: "Settings", icon: icon(Settings2), onClick: () => onOpen("general") },
        { label: "Sign out", icon: icon(LogOut), onClick: cloud.signOut },
      ]
    : [
        {
          type: "section",
          items: [
            {
              label: "Sign in with GitHub",
              icon: icon(LogIn),
              onClick: () => {
                cloud.signIn();
                onOpen("cloud");
              },
            },
            {
              label: hasKey ? "Meta API key" : "Use my own Meta key",
              icon: icon(KeyRound),
              onClick: () => onOpen("key"),
            },
          ],
        },
        { type: "divider" },
        { label: "Settings", icon: icon(Settings2), onClick: () => onOpen("general") },
      ];

  const badge = BADGE[tier];
  return (
    <div {...stylex.props(styles.footer)}>
      {outOfCredits && !collapsed && (
        <div {...stylex.props(styles.nudge)}>
          <Text size="sm">
            {pro ? "You've used your Pro credits." : "You're out of free credits."}
          </Text>
          <Text size="sm" color="secondary">
            {pro
              ? "More arrive with your next monthly payment. Add your own Meta key to keep going now."
              : canBuy
                ? "Get Pro, or add your own Meta key to keep going for free."
                : "Add your own Meta key to keep going for free."}
          </Text>
          <div {...stylex.props(styles.buttons)}>
            {canBuy && (
              <Button
                label="Get Pro"
                size="sm"
                variant="primary"
                icon={icon(Sparkles)}
                onClick={() => cloud.billing("checkout")}
              />
            )}
            <Button
              label="Add key"
              size="sm"
              variant="secondary"
              icon={icon(KeyRound)}
              onClick={() => onOpen("key")}
            />
          </div>
        </div>
      )}
      <div {...stylex.props(styles.row)}>
        <DropdownMenu
          items={items}
          placement="above"
          menuWidth={232}
          header={
            <div {...stylex.props(styles.header)}>
              <UserAvatar name={name} login={signedIn ? status.login : undefined} size={36} />
              <div {...stylex.props(styles.headerText)}>
                <span data-sidebar-text {...stylex.props(styles.name)}>
                  {name}
                </span>
                <Text size="sm" color="secondary">
                  {signedIn
                    ? paymentTrouble
                      ? "Payment failed · update in Billing"
                      : `${badge.label} plan${status.login ? ` · @${status.login}` : ""}`
                    : hasKey
                      ? "Free · your own key"
                      : "Free · not signed in"}
                </Text>
              </div>
            </div>
          }
          renderTrigger={(props) => (
            <button
              type="button"
              {...props}
              data-blob-host=""
              onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
                (props as { onPointerDown?: (e: typeof event) => void }).onPointerDown?.(event);
                cheer();
              }}
              aria-label={`${name}, ${badge.label} plan. Account menu`}
              {...stylex.props(styles.trigger, collapsed && styles.triggerCollapsed)}
            >
              <UserAvatar
                name={name}
                login={signedIn ? status.login : undefined}
                size={32}
                isHappy={isHappy}
              />
              {!collapsed && (
                <>
                  <span {...stylex.props(styles.name)}>{name}</span>
                  <span data-sidebar-text {...stylex.props(styles.badge)}>
                    <Badge
                      label={badge.label}
                      variant={paymentTrouble ? "warning" : badge.variant}
                    />
                  </span>
                  <span data-sidebar-text {...stylex.props(styles.chevron)}>
                    <ChevronsUpDown size={14} strokeWidth={1.75} />
                  </span>
                </>
              )}
            </button>
          )}
        />
      </div>
    </div>
  );
}
