// SPDX-License-Identifier: AGPL-3.0-only

import type { CSSProperties, ReactNode } from "react";
import {
  siApple,
  siClaude,
  siCursor,
  siDiscord,
  siLinear,
  siNotion,
  siWhatsapp,
} from "simple-icons";
import type { SimpleIcon } from "simple-icons";
import type { Os } from "./kit.tsx";

/** Brand marks come from Simple Icons (CC0). Chrome is drawn here, in its own colours. */

export type App =
  "chrome" | "terminal" | "cursor" | "claude" | "whatsapp" | "notion" | "linear" | "discord";

export const DOCK: App[] = [
  "chrome",
  "terminal",
  "cursor",
  "claude",
  "whatsapp",
  "notion",
  "linear",
  "discord",
];

export function Glyph({ icon, size, color }: { icon: SimpleIcon; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={icon.path} fill={color} />
    </svg>
  );
}

export const AppleLogo = ({ size, color }: { size: number; color: string }) => (
  <Glyph icon={siApple} size={size} color={color} />
);

/** Chrome's mark: three segments, each with a straight edge tangent to the white ring. */
export function ChromeLogo({ size }: { size: number }) {
  const R = 11;
  const ring = 5.1;
  const tilt = (Math.asin(ring / R) * 180) / Math.PI;
  const at = (radius: number, degrees: number) => {
    const angle = (degrees * Math.PI) / 180;
    return `${(12 + radius * Math.cos(angle)).toFixed(3)} ${(12 - radius * Math.sin(angle)).toFixed(3)}`;
  };
  const segment = (turn: number) =>
    `M ${at(R, tilt + turn)} A ${R} ${R} 0 0 0 ${at(R, tilt + 120 + turn)} L ${at(ring, 210 + turn)} A ${ring} ${ring} 0 0 1 ${at(ring, 90 + turn)} Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={R} fill="#fff" />
      <path d={segment(0)} fill="#EA4335" />
      <path d={segment(-120)} fill="#FBBC04" />
      <path d={segment(-240)} fill="#34A853" />
      <circle cx="12" cy="12" r="4.1" fill="#4285F4" />
    </svg>
  );
}

function TerminalGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m5.5 8 4 4-4 4M12 16.5h6"
        stroke="#f2f2f2"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TILES: Record<Exclude<App, "chrome">, { bg: string; glyph: (size: number) => ReactNode }> = {
  terminal: {
    bg: "linear-gradient(180deg, #4a4a4c, #1e1e20)",
    glyph: (size) => <TerminalGlyph size={size} />,
  },
  cursor: {
    bg: "linear-gradient(180deg, #2b2b2b, #0c0c0c)",
    glyph: (size) => <Glyph icon={siCursor} size={size} color="#f4f4f4" />,
  },
  claude: {
    bg: "linear-gradient(180deg, #e08a6c, #c96442)",
    glyph: (size) => <Glyph icon={siClaude} size={size} color="#fbf3ec" />,
  },
  whatsapp: {
    bg: "linear-gradient(180deg, #5ee07f, #1fb855)",
    glyph: (size) => <Glyph icon={siWhatsapp} size={size} color="#fff" />,
  },
  notion: {
    bg: "linear-gradient(180deg, #ffffff, #ececec)",
    glyph: (size) => <Glyph icon={siNotion} size={size} color="#111" />,
  },
  linear: {
    bg: "linear-gradient(180deg, #7480ea, #4f5bc4)",
    glyph: (size) => <Glyph icon={siLinear} size={size} color="#fff" />,
  },
  discord: {
    bg: "linear-gradient(180deg, #7a86ff, #5865f2)",
    glyph: (size) => <Glyph icon={siDiscord} size={size} color="#fff" />,
  },
};

/** An app's icon as the OS shows it: a squircle tile on macOS, a smaller rounded one on Windows. */
export function AppIcon({ app, size, os }: { app: App; size: number; os: Os }) {
  const shadow = "drop-shadow(0 2px 3px rgba(0,0,0,0.25))";
  if (app === "chrome") {
    return (
      <span
        style={{ display: "grid", placeItems: "center", width: size, height: size, filter: shadow }}
      >
        <ChromeLogo size={size * (os === "mac" ? 0.92 : 1)} />
      </span>
    );
  }
  const tile = TILES[app];
  const style: CSSProperties = {
    display: "grid",
    placeItems: "center",
    width: size,
    height: size,
    borderRadius: size * (os === "mac" ? 0.23 : 0.2),
    background: tile.bg,
    boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.35), 0 1px 2px rgba(0,0,0,0.18)",
    filter: os === "mac" ? shadow : undefined,
  };
  return <span style={style}>{tile.glyph(size * (app === "terminal" ? 0.7 : 0.56))}</span>;
}

export const APP_NAME: Record<App, string> = {
  chrome: "Google Chrome",
  terminal: "Terminal",
  cursor: "Cursor",
  claude: "Claude",
  whatsapp: "WhatsApp",
  notion: "Notion",
  linear: "Linear",
  discord: "Discord",
};
