// SPDX-License-Identifier: AGPL-3.0-only

import { MASCOT_BODY, MASCOT_VIEWBOX } from "./mascot-svg.ts";

export interface Face {
  /** 0 open eyes, 1 happy closed arches. */
  happy?: number;
  /** 0 to 1: eyes closed for a blink. */
  blink?: number;
  /** 0 to 1: pink cheeks. */
  blush?: number;
  /** Where the eyes look, -1 to 1 on each axis. */
  look?: { x: number; y: number };
  /** The key's turn, in radians; drawn as a squash, since the toy is flat. */
  key?: number;
}

/**
 * The logo's mascot (logo/web/logo-light.svg) with a face that moves, for the video: the body and
 * key come from the logo, the eyes, mouth and cheeks are drawn here.
 */
export function Mascot({ size, face = {} }: { size: number; face?: Face }) {
  const { happy = 0, blink = 0, blush = 0, look = { x: 0, y: 0 }, key = 0 } = face;
  const dx = look.x * 14;
  const dy = look.y * 10;
  const open = Math.max(0.06, 1 - blink) * (1 - happy);
  const eye = (cx: number, cy: number, rx: number, ry: number) => (
    <g>
      {open > 0.02 && <ellipse cx={cx + dx} cy={cy + dy} rx={rx} ry={ry * open} fill="#43302a" />}
      {happy > 0.02 && (
        <path
          d={`M${cx - rx * 0.9 + dx} ${cy + 8 + dy} Q${cx + dx} ${cy - 34 + dy} ${cx + rx * 0.9 + dx} ${cy + 8 + dy}`}
          fill="none"
          stroke="#3f2a21"
          strokeWidth={15}
          strokeLinecap="round"
          opacity={happy}
        />
      )}
    </g>
  );
  // The key turns about its stem (x = 804): a flat squash reads as a turn.
  const squash = Math.abs(Math.cos(key)) * 0.85 + 0.15;
  return (
    <svg width={size} height={size} viewBox={MASCOT_VIEWBOX} style={{ overflow: "visible" }}>
      <g
        transform={`translate(804 0) scale(${squash} 1) translate(-804 0)`}
        // Only the key and stem turn; the body below is drawn again on top, unsquashed.
        dangerouslySetInnerHTML={{ __html: MASCOT_BODY }}
      />
      <g
        dangerouslySetInnerHTML={{
          __html: MASCOT_BODY.replace(
            /<rect width="1254" height="1254" fill="url\(#key\)"[^>]*\/>|<path d="M757 500[^>]*\/>/g,
            "",
          ),
        }}
      />
      {blush > 0.01 && (
        <g opacity={blush * 0.75}>
          <ellipse cx={440 + dx * 0.5} cy={880} rx={52} ry={26} fill="#f2a7a0" />
          <ellipse cx={910 + dx * 0.5} cy={925} rx={52} ry={26} fill="#f2a7a0" />
        </g>
      )}
      {eye(505, 797, 45, 50)}
      {eye(838, 840, 50, 51)}
      <path
        d={`M${617 + dx} ${851 + dy} Q${658 + dx} ${893 + dy + happy * 18} ${701 + dx} ${858 + dy}`}
        fill="none"
        stroke="#3f2a21"
        strokeWidth={15}
        strokeLinecap="round"
      />
    </svg>
  );
}
