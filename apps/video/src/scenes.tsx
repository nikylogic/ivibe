// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Mascot } from "./mascot.tsx";
import { Cursor, ModeTitle, Pill, Window, fade, mono, typed, useEnter } from "./parts.tsx";
import { C, MONO, SANS, SERIF } from "./theme.ts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The page every scene sits on. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill style={{ background: C.page, fontFamily: SANS, color: C.ink }}>
      {children}
    </AbsoluteFill>
  );
}

/** Bottom centre of the screen, where the app puts the pill. */
function PillSpot({ children, at = 0 }: { children: ReactNode; at?: number }) {
  const enter = useEnter(at, 16);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 46,
        display: "flex",
        justifyContent: "center",
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px) scale(${0.9 + enter * 0.1})`,
      }}
    >
      {children}
    </div>
  );
}

/** What you said, as a live caption above the pill. */
function Caption({ text, italic = false }: { text: string; italic?: boolean }) {
  if (!text) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 122,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          padding: "16px 24px",
          borderRadius: 18,
          background: "#1c1b19ee",
          color: C.pillText,
          fontSize: 26,
          lineHeight: 1.4,
          fontStyle: italic ? "italic" : "normal",
          boxShadow: "0 18px 40px #00000033",
        }}
      >
        “{text.trimEnd()}”
      </div>
    </div>
  );
}

function Title({
  name,
  line,
  keys,
  pressAt,
}: {
  name: string;
  line: string;
  keys: string[];
  pressAt: number;
}) {
  const frame = useCurrentFrame();
  const enter = useEnter(0);
  return (
    <div
      style={{
        position: "absolute",
        left: 120,
        top: 84,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 24}px)`,
      }}
    >
      <ModeTitle
        name={name}
        line={line}
        keys={keys}
        pressed={frame >= pressAt && frame < pressAt + 10}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function Intro() {
  const frame = useCurrentFrame();
  const pop = useEnter(4, 12);
  const word = useEnter(22);
  const line = useEnter(40);
  // A first hello: shy (glance down, blush), then a smile, as on the website.
  const shy = interpolate(frame, [6, 18, 44, 54], [0, 1, 1, 0], clamp);
  const happy = interpolate(frame, [50, 58], [0, 1], clamp);
  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ transform: `scale(${pop}) translateY(${(1 - pop) * 60}px)` }}>
            <Mascot
              size={230}
              face={{
                blush: shy,
                happy,
                look: { x: -0.7 * shy, y: 0.8 * shy },
                key: frame / 9,
              }}
            />
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 190,
              lineHeight: 1,
              opacity: word,
              transform: `translateX(${(1 - word) * -30}px)`,
            }}
          >
            iVibe
          </div>
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: 64,
            color: C.secondary,
            opacity: line,
            transform: `translateY(${(1 - line) * 16}px)`,
          }}
        >
          Show it. Say it. Paste the prompt.
        </div>
      </AbsoluteFill>
    </Stage>
  );
}

// ---------------------------------------------------------------------------------------------

const FIX_SAID = "I change my bio and hit Save… nothing happens. It should save and show a toast.";

function ProfileApp({ shake }: { shake: number }) {
  const field = (label: string, value: string) => (
    <div style={{ marginBottom: 22 }}>
      <div style={{ color: C.secondary, fontSize: 18, marginBottom: 8 }}>{label}</div>
      <div
        style={{
          border: `2px solid #e3dfd6`,
          borderRadius: 10,
          padding: "12px 16px",
          fontSize: 20,
        }}
      >
        {value}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", height: "calc(100% - 44px)" }}>
      <div style={{ flex: 1, padding: "40px 48px", background: "#f7f6f2" }}>
        <div style={{ fontSize: 34, fontWeight: 700, marginBottom: 26 }}>Edit profile</div>
        {field("Name", "Asha Rao")}
        {field("Bio", "Building things on weekends ✦ coffee")}
        <div
          style={{
            display: "inline-block",
            marginTop: 8,
            padding: "14px 46px",
            borderRadius: 10,
            background: "#5146e5",
            color: "#fff",
            fontWeight: 700,
            fontSize: 20,
            transform: `translateX(${Math.sin(shake * Math.PI * 6) * 6 * (1 - shake)}px)`,
          }}
        >
          Save
        </div>
      </div>
      <div
        style={{
          width: 380,
          background: "#1e1e1e",
          color: "#d4d4d4",
          padding: 26,
          ...mono,
          fontSize: 15,
          lineHeight: 1.6,
        }}
      >
        <div style={{ color: "#9a9a9a", marginBottom: 12 }}>Console</div>
        <div style={{ color: "#f48771" }}>
          Uncaught TypeError: Cannot read properties of undefined (reading &apos;map&apos;)
          <br />
          &nbsp;&nbsp;at saveProfile (ProfileForm.tsx:41)
        </div>
        <div style={{ marginTop: 14, color: "#9cdcfe" }}>POST /api/profile 200</div>
        <div style={{ marginTop: 14 }}>GITHUB_TOKEN=&quot;ghp_A1b2C3…&quot;</div>
      </div>
    </div>
  );
}

/** A proof screenshot as pasted: a thumbnail with the red box iVibe draws. */
function Proof({ kind, at }: { kind: "save" | "console"; at: number }) {
  const enter = useEnter(at);
  return (
    <div
      style={{
        width: 250,
        height: 150,
        borderRadius: 10,
        overflow: "hidden",
        position: "relative",
        background: kind === "save" ? "#f7f6f2" : "#1e1e1e",
        border: "1px solid #ffffff22",
        opacity: enter,
        transform: `scale(${0.85 + enter * 0.15})`,
      }}
    >
      {kind === "save" ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 18,
              top: 16,
              width: 120,
              height: 12,
              borderRadius: 3,
              background: "#333",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 18,
              top: 42,
              width: 200,
              height: 16,
              borderRadius: 4,
              border: "2px solid #ddd",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 18,
              top: 70,
              width: 200,
              height: 16,
              borderRadius: 4,
              border: "2px solid #ddd",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 18,
              top: 104,
              width: 64,
              height: 24,
              borderRadius: 5,
              background: "#5146e5",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 10,
              top: 96,
              width: 80,
              height: 40,
              borderRadius: 7,
              border: `3px solid ${C.proof}`,
            }}
          />
        </>
      ) : (
        <>
          <div
            style={{
              position: "absolute",
              left: 14,
              top: 20,
              width: 210,
              height: 9,
              borderRadius: 3,
              background: "#f48771",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 14,
              top: 36,
              width: 150,
              height: 9,
              borderRadius: 3,
              background: "#f48771",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 14,
              top: 66,
              width: 120,
              height: 9,
              borderRadius: 3,
              background: "#9cdcfe",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 14,
              top: 94,
              width: 170,
              height: 9,
              borderRadius: 3,
              background: C.secret,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 6,
              top: 12,
              width: 230,
              height: 42,
              borderRadius: 7,
              border: `3px solid ${C.proof}`,
            }}
          />
        </>
      )}
    </div>
  );
}

const FIX_PROMPT = [
  { text: "Save on Edit profile does nothing", style: { color: "#fff", fontWeight: 700 } },
  { text: "Expected: saves the bio and shows a toast.", style: {} },
  { text: "Actual: TypeError reading 'map' in saveProfile", style: {} },
  { text: "  (ProfileForm.tsx:41); the request returns 200.", style: { color: "#a9a49a" } },
  { text: "Proof:", style: { color: "#a9a49a" } },
];

export function Fix() {
  const frame = useCurrentFrame();
  const app = useEnter(6);
  const writing = frame >= 196;
  const terminal = useEnter(232, 20);
  const pasted = frame >= 262;
  const said = typed(FIX_SAID, frame, 64, 184);
  return (
    <Stage>
      <Title name="Fix" line="Show the bug." keys={["Ctrl", "Caps Lock"]} pressAt={50} />
      <Window
        title="localhost:5173/profile"
        style={{
          left: 120,
          top: 300,
          width: 1180,
          height: 640,
          opacity: app,
          transform: `translateY(${(1 - app) * 40}px) scale(${1 - terminal * 0.04})`,
          filter: `brightness(${1 - terminal * 0.06})`,
        }}
      >
        <ProfileApp shake={fade(frame, 30, 46)} />
      </Window>
      <Cursor
        path={[
          { frame: 6, x: 1000, y: 1020 },
          { frame: 28, x: 250, y: 700 },
          { frame: 200, x: 256, y: 706 },
        ]}
        clickAt={30}
      />
      {frame >= 52 && frame < 300 && (
        <PillSpot at={52}>
          <Pill state={writing ? "writing" : "listening"} />
        </PillSpot>
      )}
      {frame >= 64 && frame < 196 && <Caption text={said} />}
      {frame >= 228 && (
        <Window
          title="Claude Code"
          dark
          style={{
            left: 900,
            top: 230,
            width: 900,
            height: 720,
            opacity: terminal,
            transform: `translateX(${(1 - terminal) * 120}px)`,
          }}
        >
          <div
            style={{
              padding: "26px 32px",
              color: C.terminalText,
              fontFamily: MONO,
              fontSize: 21,
              lineHeight: 1.6,
            }}
          >
            <div style={{ color: "#8f8a80", marginBottom: 16 }}>~/profile-app</div>
            <div style={{ display: "flex", gap: 14 }}>
              <span style={{ color: "#d97757" }}>{">"}</span>
              <div>
                {FIX_PROMPT.map((line, index) => {
                  const from = 250 + index * 8;
                  return (
                    <div
                      key={line.text}
                      style={{
                        ...line.style,
                        opacity: fade(frame, from, from + 6),
                        whiteSpace: "pre",
                      }}
                    >
                      {line.text}
                    </div>
                  );
                })}
                <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
                  <Proof kind="save" at={292} />
                  <Proof kind="console" at={298} />
                </div>
              </div>
            </div>
          </div>
        </Window>
      )}
      {pasted && (
        <PillSpot at={300}>
          <div style={{ display: "flex", gap: 12 }}>
            <Pill state="done" label="Pasted into Claude Code" />
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 56,
                paddingInline: 22,
                borderRadius: 28,
                background: "#3a2f1c",
                color: "#f0d9a8",
                fontSize: 19,
                fontWeight: 550,
                opacity: fade(frame, 310, 318),
              }}
            >
              Hid a GitHub token
            </div>
          </div>
        </PillSpot>
      )}
    </Stage>
  );
}

// ---------------------------------------------------------------------------------------------

const RAMBLE =
  "uh so I want, like, a dark mode toggle… it should remember my choice, oh and, um, follow the system setting by default I guess";

const STRUCTURED = [
  { text: "Add a dark mode toggle", heading: true },
  { text: "Goal", label: true },
  { text: "Let users switch between light and dark themes." },
  { text: "Requirements", label: true },
  { text: "• Follow the system setting by default" },
  { text: "• Remember the user's choice across visits" },
  { text: "Done when", label: true },
  { text: "• The toggle works and the choice survives a reload" },
];

export function Prompt() {
  const frame = useCurrentFrame();
  const writing = frame >= 132;
  const chat = useEnter(156);
  const ramble = typed(RAMBLE, frame, 36, 128);
  return (
    <Stage>
      <Title name="Prompt" line="Ramble it." keys={["Alt", "Caps Lock"]} pressAt={24} />
      {frame < 160 && (
        <div
          style={{
            position: "absolute",
            left: 120,
            right: 120,
            top: 380,
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: 64,
            lineHeight: 1.25,
            color: C.secondary,
            opacity: 1 - fade(frame, 140, 158),
            filter: `blur(${fade(frame, 136, 158) * 6}px)`,
          }}
        >
          {ramble}
        </div>
      )}
      {frame >= 150 && (
        <Window
          title="New chat"
          style={{
            left: 360,
            top: 280,
            width: 1200,
            height: 600,
            opacity: chat,
            transform: `translateY(${(1 - chat) * 40}px)`,
          }}
        >
          <div style={{ padding: "34px 44px" }}>
            <div
              style={{
                border: `1px solid ${C.borderStrong}`,
                borderRadius: 18,
                padding: "26px 30px",
                fontSize: 24,
                lineHeight: 1.5,
                background: C.page,
              }}
            >
              {STRUCTURED.map((line, index) => {
                const from = 168 + index * 5;
                return (
                  <div
                    key={line.text}
                    style={{
                      opacity: fade(frame, from, from + 5),
                      fontWeight: line.heading ? 700 : line.label ? 600 : 400,
                      fontSize: line.heading ? 28 : 23,
                      color: line.label ? C.secondary : C.ink,
                      marginTop: line.label ? 12 : 0,
                    }}
                  >
                    {line.text}
                  </div>
                );
              })}
            </div>
          </div>
        </Window>
      )}
      {frame >= 30 && frame < 210 && (
        <PillSpot at={30}>
          <Pill state={writing ? "writing" : "listening"} />
        </PillSpot>
      )}
      {frame >= 210 && (
        <PillSpot at={210}>
          <Pill state="done" label="Pasted into your chat" />
        </PillSpot>
      )}
    </Stage>
  );
}

// ---------------------------------------------------------------------------------------------

/** Dictation as heard: the words that cleanup removes are marked. */
const HEARD: { word: string; filler?: boolean }[] = [
  { word: "Hey" },
  { word: "Asha," },
  { word: "um,", filler: true },
  { word: "the", filler: true },
  { word: "demo", filler: true },
  { word: "is,", filler: true },
  { word: "uh,", filler: true },
  { word: "the" },
  { word: "demo" },
  { word: "is" },
  { word: "ready" },
  { word: "for" },
  { word: "tomorrow," },
  { word: "so", filler: true },
  { word: "like,", filler: true },
  { word: "let" },
  { word: "me" },
  { word: "know" },
];

const CLEAN = "Hey Asha, the demo is ready for tomorrow. Let me know what you think!";

export function Dictate() {
  const frame = useCurrentFrame();
  const app = useEnter(6);
  const shown = Math.floor(interpolate(frame, [36, 120], [0, HEARD.length], clamp));
  const strike = fade(frame, 128, 146);
  const cleanText = typed(CLEAN, frame, 160, 196);
  const pressed = frame >= 26 && frame < 140;
  return (
    <Stage>
      <Title name="Dictate" line="Just talk." keys={["Hold Caps Lock"]} pressAt={26} />
      <Window
        title="Messages · Asha"
        style={{
          left: 360,
          top: 290,
          width: 1200,
          height: 560,
          opacity: app,
          transform: `translateY(${(1 - app) * 40}px)`,
        }}
      >
        <div
          style={{
            padding: "30px 40px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            height: "calc(100% - 44px)",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              alignSelf: "flex-start",
              background: C.muted,
              borderRadius: 18,
              padding: "14px 20px",
              fontSize: 22,
            }}
          >
            Is the demo ready? 👀
          </div>
          <div style={{ flex: 1 }} />
          <div
            style={{
              border: `2px solid ${frame >= 156 ? C.ink : C.borderStrong}`,
              borderRadius: 16,
              padding: "18px 22px",
              fontSize: 26,
              minHeight: 40,
              color: cleanText ? C.ink : C.faint,
            }}
          >
            {cleanText || "Message"}
            {frame >= 156 && frame < 205 && Math.floor(frame / 8) % 2 === 0 && <span>|</span>}
          </div>
        </div>
      </Window>
      {frame >= 36 && frame < 156 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 122,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              maxWidth: 1100,
              padding: "16px 24px",
              borderRadius: 18,
              background: "#1c1b19ee",
              color: C.pillText,
              fontSize: 28,
              lineHeight: 1.5,
              display: "flex",
              flexWrap: "wrap",
              gap: "0 9px",
              opacity: 1 - fade(frame, 146, 156),
            }}
          >
            {HEARD.slice(0, shown).map((item, index) => (
              <span
                key={index}
                style={
                  item.filler
                    ? {
                        color: interpolate(strike, [0, 1], [0, 1]) > 0.5 ? "#e5484d" : C.pillText,
                        textDecoration: strike > 0.3 ? "line-through" : "none",
                        opacity: 1 - strike * 0.6,
                      }
                    : {}
                }
              >
                {item.word}
              </span>
            ))}
          </div>
        </div>
      )}
      {frame >= 26 && frame < 200 && (
        <PillSpot at={26}>
          <Pill state={pressed ? "listening" : "writing"} label="Tidying up…" />
        </PillSpot>
      )}
      {frame >= 200 && (
        <PillSpot at={200}>
          <Pill state="done" label="Pasted" />
        </PillSpot>
      )}
    </Stage>
  );
}

// ---------------------------------------------------------------------------------------------

export function Outro() {
  const frame = useCurrentFrame();
  const pop = useEnter(2, 12);
  const text = useEnter(14);
  const sub = useEnter(26);
  const cta = useEnter(40);
  const blink = interpolate(frame, [70, 74, 78], [0, 1, 0], clamp);
  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 26 }}>
        <div style={{ transform: `scale(${pop})` }}>
          <Mascot
            size={260}
            face={{ happy: interpolate(frame, [20, 30], [0, 1], clamp), blink, key: frame / 10 }}
          />
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 150,
            lineHeight: 1,
            opacity: text,
            transform: `translateY(${(1 - text) * 20}px)`,
          }}
        >
          iVibe
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: 50,
            color: C.secondary,
            opacity: sub,
          }}
        >
          Fix, Prompt and Dictate: three modes, one keystroke away.
        </div>
        <div
          style={{
            marginTop: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 14,
            height: 64,
            paddingInline: 30,
            borderRadius: 32,
            background: C.ink,
            color: C.page,
            fontSize: 24,
            fontWeight: 600,
            opacity: cta,
            transform: `translateY(${(1 - cta) * 20}px)`,
          }}
        >
          ivibe.tech
          <span style={{ fontWeight: 400, opacity: 0.7 }}>
            Windows · macOS · Linux · Free to try
          </span>
        </div>
      </AbsoluteFill>
    </Stage>
  );
}
