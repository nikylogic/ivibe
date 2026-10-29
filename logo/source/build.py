# SPDX-License-Identifier: AGPL-3.0-only
"""Builds every iVibe logo file from the mascot in mascot.py.

    python logo/source/build.py

Writes the master SVGs to logo/source/svg, renders them (and the social cards) to PNG with
render.mjs, which runs in the desktop app's Electron, and packs the Windows .ico and macOS
.icns with Pillow. Run it again after changing the mascot and every file is regenerated.
"""
import json
import os
import shutil
import subprocess
import sys

from PIL import Image

import mascot

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.dirname(HERE)
REPO = os.path.dirname(LOGO)
DESKTOP = os.path.join(REPO, "apps", "desktop")
SVG = os.path.join(HERE, "svg")

# The app's page colours (apps/desktop/src/renderer/shared/theme.tsx).
LIGHT_PAGE, DARK_PAGE = "#fdfcf9", "#1a1917"
LIGHT_TEXT, LIGHT_SECONDARY = "#1b1a17", "#6f6a60"
DARK_TEXT, DARK_SECONDARY = "#f2efe8", "#a39e94"
RECORDING = "#e5484d"
# The app icon's tile: the light cream, softly lit from the top.
TILE = ("#ffffff", "#f2efe8")
DARK_TILE = ("#2f2d2a", "#22211e")


def out(*parts):
    path = os.path.join(LOGO, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def write(path, text):
    with open(path, "w", encoding="utf8", newline="\n") as file:
        file.write(text)


def svg(size, body, title="iVibe"):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">\n'
        f"  <title>{title}</title>\n{body}\n</svg>\n"
    )


def tile(x, size, radius, colors, extra=""):
    top, bottom = colors
    return (
        f'  <defs><linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/>'
        f"</linearGradient>{extra}</defs>\n"
        f'  <rect x="{x}" y="{x}" width="{size}" height="{size}" rx="{radius}" fill="url(#tile)"'
    )


def app_icon():
    """Windows and Linux: the light tile almost to the edge, the mascot filling most of it."""
    edge, size = 24, 976
    body = tile(edge, size, 218, TILE) + ' stroke="#1b1a17" stroke-opacity="0.08" stroke-width="4"/>\n'
    box = size * 0.86
    body += mascot.nested(False, 512 - box / 2, 512 - box / 2, box)
    return svg(1024, body)


def mac_icon():
    """macOS: Apple's icon grid, an 824 px tile centred in 1024 with a soft shadow below it."""
    shadow = (
        '<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.28"/></filter>'
    )
    body = tile(100, 824, 185, TILE, shadow) + ' filter="url(#shadow)"/>\n'
    box = 824 * 0.86
    body += mascot.nested(False, 512 - box / 2, 512 - box / 2, box)
    return svg(1024, body)


def tray(dark, recording=False):
    """The tray / menu-bar icon: the mascot unchanged, on a small tile tinted to suit the bar it
    sits on, light or dark. Recording adds a red dot."""
    body = tile(0, 64, 14, DARK_TILE if dark else TILE) + "/>\n"
    body += mascot.nested(dark, 1, 1, 62)
    if recording:
        ring = DARK_TILE[1] if dark else TILE[1]
        body += f'\n  <circle cx="51" cy="13" r="11" fill="{RECORDING}" stroke="{ring}" stroke-width="4"/>'
    return svg(64, body)


def favicon():
    """One favicon for the browser's light and dark modes: it switches with the visitor's."""
    light = mascot.scoped(mascot.logo(False), "l")
    dark = mascot.scoped(mascot.logo(True), "d")
    inner = lambda s, cls: s.split(">", 1)[1].rsplit("</svg>", 1)[0].replace("<title>iVibe</title>", "").join(
        (f'<g class="{cls}">', "</g>")
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{mascot.VIEW}">\n'
        "  <title>iVibe</title>\n"
        "  <style>.d{display:none}@media (prefers-color-scheme:dark){.l{display:none}.d{display:inline}}</style>\n"
        f"{inner(light, 'l')}\n{inner(dark, 'd')}\n</svg>\n"
    )


def square(background, dark, scale, colors=None):
    """The mascot centred on a full square: avatars, the Apple touch icon, maskable web icons."""
    if colors:
        body = tile(0, 1024, 0, colors) + "/>\n"
    else:
        body = f'  <rect width="1024" height="1024" fill="{background}"/>\n'
    box = 1024 * scale
    body += mascot.nested(dark, 512 - box / 2, 512 - box / 2, box)
    return svg(1024, body)


def masters():
    os.makedirs(SVG, exist_ok=True)
    files = {
        "mascot-light.svg": mascot.logo(False),
        "mascot-dark.svg": mascot.logo(True),
        "mascot-on-light.svg": mascot.logo(False, LIGHT_PAGE),
        "mascot-on-dark.svg": mascot.logo(True, DARK_PAGE),
        "app-icon.svg": app_icon(),
        "app-icon-mac.svg": mac_icon(),
        "tray-on-light.svg": tray(False),
        "tray-on-dark.svg": tray(True),
        "tray-recording-on-light.svg": tray(False, True),
        "tray-recording-on-dark.svg": tray(True, True),
        "favicon.svg": favicon(),
        "avatar-light.svg": square(LIGHT_PAGE, False, 0.82),
        "avatar-dark.svg": square(DARK_PAGE, True, 0.82),
        "touch-icon.svg": square(None, False, 0.8, TILE),
        "maskable.svg": square(LIGHT_PAGE, False, 0.62),
    }
    for name, text in files.items():
        write(os.path.join(SVG, name), text)
    return {name: os.path.join(SVG, name) for name in files}


def cards():
    """Text and mascot together, drawn on a canvas so the wordmark uses Instrument Serif."""
    light = dict(bg=LIGHT_PAGE, mascot="mascot-light.svg", text=LIGHT_TEXT, secondary=LIGHT_SECONDARY)
    dark = dict(bg=DARK_PAGE, mascot="mascot-dark.svg", text=DARK_TEXT, secondary=DARK_SECONDARY)
    jobs = []
    for theme, look in (("light", light), ("dark", dark)):
        for path, w, h, tagline in [
            (("web", f"og-{theme}.png"), 1200, 630, True),
            (("social", f"github-social-{theme}.png"), 1280, 640, True),
            (("social", f"thumbnail-{theme}.png"), 1500, 1000, True),
            (("social", f"x-banner-{theme}.png"), 1500, 500, True),
            (("social", f"linkedin-banner-{theme}.png"), 1584, 396, True),
            # The README's header, at 2x for sharp text on high-DPI screens.
            (("social", f"readme-banner-{theme}.png"), 2400, 720, True),
        ]:
            jobs.append(dict(card=True, out=out(*path), w=w, h=h, tagline=tagline, **look))
        # The product image for checkout and invoices (Dodo Payments): square, mascot over
        # "iVibe Pro", large enough to read when the checkout shows it small.
        jobs.append(dict(card=True, stack=True, out=out("social", f"product-pro-{theme}.png"),
                         w=1024, h=1024, tagline=False, **look))
        # The lockup: mascot and wordmark on a transparent background.
        jobs.append(dict(card=True, out=out("web", f"lockup-{theme}.png"), w=1200, h=440, tagline=False,
                         **{**look, "bg": None}))
    return jobs


def renders(svgs):
    jobs = []

    def png(name, size, *path):
        jobs.append(dict(svg=svgs[name], w=size, h=size, out=out(*path)))

    for size in (16, 20, 24, 32, 40, 48, 64, 96, 128, 256):
        png("app-icon.svg", size, "source", "build", f"win-{size}.png")
    for size in (16, 32, 64, 128, 256, 512, 1024):
        png("app-icon-mac.svg", size, "source", "build", f"mac-{size}.png")
    png("app-icon-mac.svg", 1024, "desktop", "macos", "icon-1024.png")
    for size in (16, 24, 32, 48, 64, 128, 256, 512):
        png("app-icon.svg", size, "desktop", "linux", "icons", f"{size}x{size}.png")
    for variant in ("on-light", "on-dark", "recording-on-light", "recording-on-dark"):
        name = f"tray-{variant}.svg"
        for size in (16, 20, 24, 32, 40, 48):
            png(name, size, "source", "build", f"tray-{variant}-{size}.png")
        png(name, 16, "desktop", "macos", f"tray-{variant}.png")
        png(name, 32, "desktop", "macos", f"tray-{variant}@2x.png")
        png(name, 24, "desktop", "linux", f"tray-{variant}.png")
        png(name, 48, "desktop", "linux", f"tray-{variant}@2x.png")
    for size in (16, 32, 48):
        png("mascot-light.svg", size, "source", "build", f"favicon-{size}.png")
    png("touch-icon.svg", 180, "web", "apple-touch-icon.png")
    png("app-icon.svg", 192, "web", "icon-192.png")
    png("app-icon.svg", 512, "web", "icon-512.png")
    png("maskable.svg", 512, "web", "icon-maskable-512.png")
    for theme in ("light", "dark"):
        for size in (400, 1024):
            png(f"avatar-{theme}.svg", size, "social", f"avatar-{theme}-{size}.png")
        png(f"mascot-on-{theme}.svg", 1024, "social", f"mascot-on-{theme}-1024.png")
    for job in cards():
        job["mascot"] = svgs[job["mascot"]]
        jobs.append(job)
    return jobs


def render(jobs):
    job_file = os.path.join(HERE, "build", "jobs.json")
    os.makedirs(os.path.dirname(job_file), exist_ok=True)
    fonts = os.path.join(DESKTOP, "node_modules", "@fontsource", "instrument-serif", "files")
    with open(job_file, "w", encoding="utf8") as file:
        json.dump(dict(jobs=jobs, fonts=fonts), file)
    electron = os.path.join(DESKTOP, "node_modules", ".bin", "electron.cmd" if os.name == "nt" else "electron")
    subprocess.run([electron, os.path.join(HERE, "render.mjs"), job_file], check=True, cwd=DESKTOP)


def pack():
    build = os.path.join(HERE, "build")
    load = lambda name: Image.open(os.path.join(build, name)).convert("RGBA")

    def ico(path, prefix, sizes):
        images = [load(f"{prefix}-{size}.png") for size in sizes]
        images[-1].save(path, format="ICO", sizes=[(s, s) for s in sizes], append_images=images[:-1])

    ico(out("desktop", "windows", "icon.ico"), "win", (16, 20, 24, 32, 40, 48, 64, 96, 128, 256))
    for variant in ("on-light", "on-dark", "recording-on-light", "recording-on-dark"):
        ico(out("desktop", "windows", f"tray-{variant}.ico"), f"tray-{variant}", (16, 20, 24, 32, 40, 48))
    ico(out("web", "favicon.ico"), "favicon", (16, 32, 48))
    sizes = (16, 32, 64, 128, 256, 512, 1024)
    images = [load(f"mac-{size}.png") for size in sizes]
    images[-1].save(out("desktop", "macos", "icon.icns"), format="ICNS", append_images=images[:-1])


def copies(svgs):
    shutil.copy(svgs["app-icon.svg"], out("desktop", "linux", "icon.svg"))
    shutil.copy(svgs["favicon.svg"], out("web", "favicon.svg"))
    shutil.copy(svgs["mascot-light.svg"], out("web", "logo-light.svg"))
    shutil.copy(svgs["mascot-dark.svg"], out("web", "logo-dark.svg"))
    write(out("web", "site.webmanifest"), json.dumps({
        "name": "iVibe",
        "short_name": "iVibe",
        "icons": [
            {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
        "theme_color": LIGHT_PAGE,
        "background_color": LIGHT_PAGE,
        "display": "standalone",
    }, indent=2) + "\n")
    write(out("web", "head.html"), f"""<!-- Paste into the site's <head>; the files go in the site's root (public/) folder. -->
<link rel="icon" href="/favicon.ico" sizes="48x48" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="{LIGHT_PAGE}" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="{DARK_PAGE}" media="(prefers-color-scheme: dark)" />
<meta property="og:image" content="https://ivibe.tech/og-light.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
""")


if __name__ == "__main__":
    svgs = masters()
    render(renders(svgs))
    pack()
    copies(svgs)
    if "--keep" not in sys.argv:
        shutil.rmtree(os.path.join(HERE, "build"))
    print("done")
