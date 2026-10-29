# SPDX-License-Identifier: AGPL-3.0-only
"""The iVibe mascot: a three-quarter view of the wind-up toy, in iVibe's colours.

Drawn in a 1254 px square (the reference artwork's own coordinates). `logo()` returns the
mascot as an SVG, tightly cropped on a transparent background or laid out on a full square.
Every other logo file is built from this by build.py.
"""
import math
import re

TOP, BASE, INK = "#f2efe8", "#574d42", "#3f2a21"
VIEW = "205 190 1040 1040"

def smooth_path(points):
    """A closed Catmull-Rom spline through the points, as cubic Beziers: no corners anywhere."""
    n = len(points)
    d = f"M{points[0][0]:.2f} {points[0][1]:.2f}"
    for k in range(n):
        p0, p1, p2, p3 = (points[(k + o) % n] for o in (-1, 0, 1, 2))
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}"
    return d + " Z"


def body_points(steps=240):
    """The toy's front silhouette, as in scene.ts: a domed top, a flatter, boxier bottom, a
    little narrower at the top, and leaning a touch to the right as in the three-quarter view."""
    cx, cy, half, up, down = 726, 868, 438, 385, 338
    points = []
    for k in range(steps):
        t = k / steps * math.tau
        c, s_ = math.cos(t), math.sin(t)
        power = 2 / 2.2 if s_ > 0 else 2 / 3.6
        x = math.copysign(abs(c) ** power, c)
        y = math.copysign(abs(s_) ** power, s_)
        rise = (y + 1) / 2
        width = half * (1 - 0.07 * rise) * (1 + 0.025 * x)
        points.append((cx + x * width + 14 * rise, cy - y * (up if y > 0 else down)))
    return points


BODY = smooth_path(body_points())
# The seam, following the body's curve round the front: higher at the left, dipping a little.
SEAM = "M270 912 C520 960 900 1000 1190 982 L1190 1240 L270 1240 Z"

# Key head: two lobes and a softly pinched waist, on an axis tilted like the body.
LOBE_R, HOLE_R, SPAN = 104, 44, 206
ANGLE = math.degrees(math.atan2(30, SPAN))
KEY_AT = (725, 343)


def key_points():
    """The key head's outline: the two lobes joined above and below by round fillets that meet
    them tangentially, so the waist is a gentle, even curve with no pinch or corner."""
    a, r, waist = SPAN / 2, LOBE_R, 72
    fillet = (a * a + waist * waist - r * r) / (2 * (r - waist))
    k = waist + fillet

    def arc(cx, cy, radius, start, end, steps):
        return [(cx + radius * math.cos(start + (end - start) * i / steps),
                 cy + radius * math.sin(start + (end - start) * i / steps)) for i in range(steps)]

    left_top, left_bottom = math.atan2(-k, a), math.atan2(k, a)
    right_top, right_bottom = math.atan2(-k, -a), math.atan2(k, -a)
    return (
        arc(a, -k, fillet, math.atan2(k, -a), math.atan2(k, a), 24)
        + arc(2 * a, 0, r, right_top, right_bottom + math.tau if right_bottom < right_top else right_bottom, 90)
        + arc(a, k, fillet, math.atan2(-k, a), math.atan2(-k, -a), 24)
        + arc(0, 0, r, left_bottom, left_top + math.tau, 90)
    )


def circle(cx, cy, r):
    return f"M{cx - r} {cy} a{r} {r} 0 1 0 {2 * r} 0 a{r} {r} 0 1 0 {-2 * r} 0 Z"


KEY_SHAPES = [smooth_path(key_points())]
KEY_HOLES = f"{circle(0, 0, HOLE_R)} {circle(SPAN, 0, HOLE_R)}"
KEY_TRANSFORM = f"translate({KEY_AT[0]} {KEY_AT[1]}) rotate({ANGLE:.2f})"

# Stem: a short peg with a rounded top, rising out of the body to just under the key's waist.
STEM = "M757 500 L757 442 A47 20 0 0 1 851 442 L851 500 Z"

# Face: the near eye a touch bigger, the smile between and below them.
EYES = [(505, 797, 45, 50), (838, 840, 50, 51)]
SMILE = "M617 851 Q658 893 701 858"


def logo(dark=False, background=None):
    """The shaded logo. `background` fills the full square, laid out like the reference;
    without it the logo is cropped tight on a transparent background."""
    base_light, base_mid, base_deep = ("#97887a", "#7a6c5d", "#5a4f43") if dark else ("#75695a", BASE, "#3b332b")
    key_light, key_deep = ("#9c8d7e", "#5e5246") if dark else ("#7a6d5e", "#40382f")
    stem_light = "#8f8172" if dark else "#6e6254"
    # Light pages darken the body's edges; on dark pages they catch a faint warm rim light.
    edge, edge_alpha = ("#f2efe8", 0.10) if dark else ("#2a221b", 0.18)
    view = "0 0 1254 1254" if background else VIEW
    eyes = "\n".join(f'  <ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="url(#eye)"/>' for x, y, rx, ry in EYES)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" width="512" height="512">
  <title>iVibe</title>
  <defs>
    <radialGradient id="top" gradientUnits="userSpaceOnUse" cx="560" cy="600" r="720">
      <stop offset="0" stop-color="#fdfcf9"/>
      <stop offset="0.45" stop-color="{TOP}"/>
      <stop offset="1" stop-color="#d9d0c0"/>
    </radialGradient>
    <radialGradient id="base" gradientUnits="userSpaceOnUse" cx="480" cy="940" r="760">
      <stop offset="0" stop-color="{base_light}"/>
      <stop offset="0.5" stop-color="{base_mid}"/>
      <stop offset="1" stop-color="{base_deep}"/>
    </radialGradient>
    <radialGradient id="form" gradientUnits="userSpaceOnUse" cx="640" cy="760" r="620">
      <stop offset="0.6" stop-color="{edge}" stop-opacity="0"/>
      <stop offset="1" stop-color="{edge}" stop-opacity="{edge_alpha}"/>
    </radialGradient>
    <linearGradient id="key" gradientUnits="userSpaceOnUse" x1="640" y1="240" x2="1020" y2="460">
      <stop offset="0" stop-color="{key_light}"/>
      <stop offset="0.55" stop-color="{base_mid}"/>
      <stop offset="1" stop-color="{key_deep}"/>
    </linearGradient>
    <linearGradient id="stem" gradientUnits="userSpaceOnUse" x1="757" y1="0" x2="851" y2="0">
      <stop offset="0" stop-color="{stem_light}"/>
      <stop offset="0.6" stop-color="{base_mid}"/>
      <stop offset="1" stop-color="{base_deep}"/>
    </linearGradient>
    <linearGradient id="eye" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4b3429"/>
      <stop offset="1" stop-color="{INK}"/>
    </linearGradient>
    <clipPath id="body"><path d="{BODY}"/></clipPath>
    <mask id="key-holes" maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254">
      {"".join(f'<path d="{d}" transform="{KEY_TRANSFORM}" fill="#fff"/>' for d in KEY_SHAPES)}
      <path d="{KEY_HOLES}" transform="{KEY_TRANSFORM}" fill="#000"/>
    </mask>
  </defs>
{f'  <rect width="1254" height="1254" fill="{background}"/>' if background else ""}
  <rect width="1254" height="1254" fill="url(#key)" mask="url(#key-holes)"/>
  <path d="{STEM}" fill="url(#stem)"/>
  <g clip-path="url(#body)">
    <rect width="1254" height="1254" fill="url(#top)"/>
    <path d="{SEAM}" fill="url(#base)"/>
    <rect width="1254" height="1254" fill="url(#form)"/>
  </g>
{eyes}
  <path d="{SMILE}" fill="none" stroke="{INK}" stroke-width="15" stroke-linecap="round"/>
</svg>
'''


def scoped(svg, suffix):
    """The same SVG with its ids made unique, so several can share one file."""
    for name in set(re.findall(r'id="([^"]+)"', svg)):
        svg = svg.replace(f'id="{name}"', f'id="{name}-{suffix}"')
        svg = svg.replace(f"url(#{name})", f"url(#{name}-{suffix})")
    return svg


def nested(dark=False, x=0.0, y=0.0, size=1254.0, suffix="m"):
    """The tight-cropped mascot as an <svg> element placed in a box, to embed in another SVG."""
    inner = scoped(logo(dark), suffix)
    inner = inner.replace('<svg xmlns="http://www.w3.org/2000/svg" ', f'<svg x="{x:.2f}" y="{y:.2f}" ', 1)
    inner = inner.replace('width="512" height="512"', f'width="{size:.2f}" height="{size:.2f}"', 1)
    return inner.replace("  <title>iVibe</title>\n", "", 1)
