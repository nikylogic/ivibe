// SPDX-License-Identifier: AGPL-3.0-only

import { BatteryFull, ChevronUp, Search, Volume2, Wifi } from "lucide-react";
import { APP_NAME, AppIcon, AppleLogo, DOCK } from "./icons.tsx";
import type { App } from "./icons.tsx";
import { H, SANS, W } from "./kit.tsx";
import type { Env } from "./kit.tsx";

/** The desktop around the windows: wallpaper, the menu bar and dock, or the Windows taskbar. */

export function Wallpaper({ env }: { env: Env }) {
  const background = env.dark
    ? "radial-gradient(70% 60% at 18% 12%, #6a3b26 0%, transparent 70%), radial-gradient(60% 70% at 88% 25%, #3d2b55 0%, transparent 70%), radial-gradient(90% 70% at 55% 105%, #7a4320 0%, transparent 70%), #17130f"
    : "radial-gradient(70% 60% at 15% 10%, #fbd7bb 0%, transparent 70%), radial-gradient(60% 70% at 90% 22%, #e7cfe6 0%, transparent 70%), radial-gradient(90% 70% at 50% 108%, #f5bf93 0%, transparent 70%), #f7ede2";
  return <div style={{ position: "absolute", inset: 0, background }} />;
}

// ---------------------------------------------------------------------------------------------
// Where each app sits, so the cursor can click it. Kept next to the code that draws them.

const MAC_ICON = 46;
const MAC_GAP = 8;
const MAC_PAD = 8;
const MAC_WIDTH = MAC_PAD * 2 + DOCK.length * MAC_ICON + (DOCK.length - 1) * MAC_GAP;
const MAC_LEFT = (W - MAC_WIDTH) / 2;

const TASKBAR = 44;
const WIN_ITEM = 40;
const WIN_GAP = 4;
const WIN_SEARCH = 130;
const WIN_WIDTH = WIN_ITEM + WIN_SEARCH + DOCK.length * WIN_ITEM + (DOCK.length + 1) * WIN_GAP;
const WIN_LEFT = (W - WIN_WIDTH) / 2;
const winAppLeft = (index: number) =>
  WIN_LEFT + WIN_ITEM + WIN_SEARCH + 2 * WIN_GAP + index * (WIN_ITEM + WIN_GAP);

export function dockSpot(env: Env, app: App): { x: number; y: number } {
  const index = DOCK.indexOf(app);
  if (env.os === "mac") {
    return {
      x: MAC_LEFT + MAC_PAD + MAC_ICON / 2 + index * (MAC_ICON + MAC_GAP),
      y: H - 8 - 9 - MAC_ICON / 2,
    };
  }
  return { x: winAppLeft(index) + WIN_ITEM / 2, y: H - TASKBAR / 2 };
}

/** How far up from the bottom the pill sits: just above the dock or taskbar. */
export const pillBottom = (env: Env) => (env.os === "mac" ? 84 : 58);
/** Where the mascot sits, bottom right. */
export const mascotBottom = (env: Env) => (env.os === "mac" ? 8 : TASKBAR + 6);

// ---------------------------------------------------------------------------------------------

export function MenuBar({ env, app }: { env: Env; app: App }) {
  const ink = env.dark ? "#f4f1ec" : "#1d1b18";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: 24,
        display: "flex",
        alignItems: "center",
        gap: 18,
        paddingInline: 16,
        background: env.dark ? "rgba(20,16,12,0.35)" : "rgba(255,255,255,0.3)",
        backdropFilter: "blur(20px)",
        color: ink,
        fontFamily: SANS,
        fontSize: 12.5,
      }}
    >
      <AppleLogo size={13} color={ink} />
      <b style={{ fontWeight: 650 }}>{APP_NAME[app]}</b>
      {["File", "Edit", "View", "Window", "Help"].map((item) => (
        <span key={item}>{item}</span>
      ))}
      <span style={{ flex: 1 }} />
      <img src="/favicon.svg" alt="" width={15} height={15} style={{ borderRadius: 4 }} />
      <BatteryFull size={17} strokeWidth={1.6} />
      <Wifi size={14} strokeWidth={2} />
      <Search size={13} strokeWidth={2} />
      <span>Sat 1 Nov&nbsp;&nbsp;9:41 PM</span>
    </div>
  );
}

export function Dock({
  env,
  open,
  pressed,
}: {
  env: Env;
  open: Partial<Record<App, boolean>>;
  pressed?: App;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: MAC_LEFT,
        bottom: 8,
        width: MAC_WIDTH,
        boxSizing: "border-box",
        display: "flex",
        gap: MAC_GAP,
        padding: `7px ${MAC_PAD}px 9px`,
        borderRadius: 20,
        background: env.dark ? "rgba(40,34,30,0.45)" : "rgba(255,255,255,0.35)",
        backdropFilter: "blur(24px) saturate(1.4)",
        boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.45), 0 10px 30px rgba(0,0,0,0.15)",
      }}
    >
      {DOCK.map((app) => (
        <span
          key={app}
          style={{ position: "relative", filter: pressed === app ? "brightness(0.65)" : undefined }}
        >
          <AppIcon app={app} size={MAC_ICON} os="mac" />
          {open[app] && (
            <span
              style={{
                position: "absolute",
                left: "50%",
                bottom: -7,
                width: 4,
                height: 4,
                marginLeft: -2,
                borderRadius: 2,
                background: env.dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)",
              }}
            />
          )}
        </span>
      ))}
    </div>
  );
}

export function Taskbar({
  env,
  open,
  active,
  pressed,
}: {
  env: Env;
  open: Partial<Record<App, boolean>>;
  active: App;
  pressed?: App;
}) {
  const d = env.dark;
  const ink = d ? "#ffffff" : "#1a1a1a";
  const accent = d ? "#4cc2ff" : "#005fb8";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: TASKBAR,
        background: d ? "rgba(28,28,28,0.86)" : "rgba(238,240,244,0.86)",
        backdropFilter: "blur(30px) saturate(1.3)",
        borderTop: `1px solid ${d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        fontFamily: SANS,
        color: ink,
      }}
    >
      {/* Start */}
      <span
        style={{
          position: "absolute",
          left: WIN_LEFT,
          top: 2,
          width: WIN_ITEM,
          height: 40,
          display: "grid",
          placeItems: "center",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <defs>
            <linearGradient id="start" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3ccbf4" />
              <stop offset="1" stopColor="#0f6cbd" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="9.5" height="9.5" rx="0.6" fill="url(#start)" />
          <rect x="10.5" y="0" width="9.5" height="9.5" rx="0.6" fill="url(#start)" />
          <rect x="0" y="10.5" width="9.5" height="9.5" rx="0.6" fill="url(#start)" />
          <rect x="10.5" y="10.5" width="9.5" height="9.5" rx="0.6" fill="url(#start)" />
        </svg>
      </span>
      {/* Search */}
      <span
        style={{
          position: "absolute",
          left: WIN_LEFT + WIN_ITEM + WIN_GAP,
          top: 7,
          width: WIN_SEARCH,
          height: 30,
          borderRadius: 15,
          background: d ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.85)",
          border: `1px solid ${d ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingInline: 12,
          fontSize: 12,
          color: d ? "#c5c5c5" : "#5c5c5c",
        }}
      >
        <Search size={14} strokeWidth={2} /> Search
      </span>
      {DOCK.map((app, index) => (
        <span
          key={app}
          style={{
            position: "absolute",
            left: winAppLeft(index),
            top: 2,
            width: WIN_ITEM,
            height: 40,
            borderRadius: 5,
            display: "grid",
            placeItems: "center",
            background:
              active === app ? (d ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.7)") : undefined,
            filter: pressed === app ? "brightness(0.75)" : undefined,
          }}
        >
          <AppIcon app={app} size={24} os="windows" />
          {open[app] && (
            <span
              style={{
                position: "absolute",
                left: "50%",
                bottom: 2,
                width: active === app ? 16 : 6,
                height: 3,
                marginLeft: active === app ? -8 : -3,
                borderRadius: 2,
                background: active === app ? accent : d ? "#9a9a9a" : "#8a8a8a",
              }}
            />
          )}
        </span>
      ))}
      {/* Tray */}
      <span
        style={{
          position: "absolute",
          right: 12,
          top: 0,
          height: TASKBAR,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 11.5,
        }}
      >
        <ChevronUp size={14} strokeWidth={2} />
        <img src="/favicon.svg" alt="" width={16} height={16} style={{ borderRadius: 4 }} />
        <span style={{ display: "flex", gap: 8 }}>
          <Wifi size={15} strokeWidth={2} />
          <Volume2 size={15} strokeWidth={2} />
          <BatteryFull size={16} strokeWidth={1.7} />
        </span>
        <span style={{ textAlign: "right", lineHeight: 1.35 }}>
          9:41 PM
          <br />
          01-11-2026
        </span>
      </span>
    </div>
  );
}
