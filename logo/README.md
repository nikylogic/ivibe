# iVibe logo

The mascot, a little wind-up toy, in every format the desktop app, the website and other
platforms need. Every file here is generated from one drawing, so never edit a PNG by hand:
change the mascot and rebuild.

```sh
python logo/source/build.py
```

The build needs Python with Pillow, and the desktop app's dependencies installed
(`pnpm install`). It uses the app's Electron to draw the images and its Instrument Serif font
for the wordmark.

## Light and dark

- **Light:** the regular colours, for light pages and backgrounds. Light cream top, cream brown
  base and key, chocolate face.
- **Dark:** for dark pages. The base and key are a few shades lighter, and the edges catch a
  faint warm light, so the mascot doesn't sink into the dark.

The app icon itself is a single icon on a light cream tile: Windows and Linux show one icon
whatever the theme, and the light tile stands out on both light and dark desktops.

## What goes where

### `desktop/windows/`

| File                                    | Use                                                                |
| --------------------------------------- | ------------------------------------------------------------------ |
| `icon.ico`                              | The app icon: 16 to 256 px. Set as `win.icon` in electron-builder. |
| `tray-on-light.ico`, `tray-on-dark.ico` | The tray icon for a light or dark taskbar.                         |
| `tray-recording-on-*.ico`               | The same while recording, with a red dot.                          |

### `desktop/macos/`

| File                          | Use                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `icon.icns`                   | The app icon, on Apple's icon grid. Set as `mac.icon` in electron-builder.     |
| `icon-1024.png`               | The same at 1024 px, for the App Store and the DMG window.                     |
| `tray-on-light.png` (+ `@2x`) | The menu-bar icon on a light menu bar. Electron picks `@2x` on Retina screens. |
| `tray-on-dark.png` (+ `@2x`)  | The same on a dark menu bar.                                                   |
| `tray-recording-on-*.png`     | While recording, with a red dot.                                               |

The menu-bar icon keeps the mascot in colour; only its small background tile changes, light or
dark, to suit the menu bar.

### `desktop/linux/`

| File                      | Use                                                                               |
| ------------------------- | --------------------------------------------------------------------------------- |
| `icons/`                  | The app icon from 16 to 512 px, named as electron-builder expects (`linux.icon`). |
| `icon.svg`                | The scalable app icon.                                                            |
| `tray-on-*.png` (+ `@2x`) | The tray icon for a light or dark panel, and while recording.                     |

### `web/`

Copy these into the website's root (`public/`) folder, and paste `head.html` into its `<head>`.

| File                                  | Use                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `favicon.svg`                         | The browser tab icon. It switches with the visitor's light or dark mode. |
| `favicon.ico`                         | The fallback tab icon for older browsers (16, 32, 48 px).                |
| `apple-touch-icon.png`                | 180 px, for iPhone and iPad home screens.                                |
| `icon-192.png`, `icon-512.png`        | App icons for `site.webmanifest`.                                        |
| `icon-maskable-512.png`               | The same for Android, safe to crop into any shape.                       |
| `site.webmanifest`                    | The web app manifest.                                                    |
| `og-light.png`, `og-dark.png`         | Link previews (1200 x 630) for X, LinkedIn, Slack, WhatsApp and others.  |
| `logo-light.svg`, `logo-dark.svg`     | The mascot alone, transparent, for the site's light and dark themes.     |
| `lockup-light.png`, `lockup-dark.png` | The mascot with the "iVibe" wordmark, transparent.                       |

### `social/`

| File                                                  | Use                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `avatar-light-*.png`, `avatar-dark-*.png`             | Profile pictures (400 and 1024 px): GitHub, X, LinkedIn, Devpost, Product Hunt. |
| `github-social-*.png`                                 | The repository's social preview (1280 x 640): Settings → Social preview.        |
| `thumbnail-*.png`                                     | A 3:2 project thumbnail (1500 x 1000), e.g. for the hackathon submission.       |
| `x-banner-*.png`                                      | The X header (1500 x 500).                                                      |
| `linkedin-banner-*.png`                               | The LinkedIn banner (1584 x 396).                                               |
| `mascot-on-light-1024.png`, `mascot-on-dark-1024.png` | The mascot artwork on its square background.                                    |
| `product-pro-light.png`, `product-pro-dark.png`       | The iVibe Pro product image (1024 x 1024) for the Dodo Payments checkout.       |
| `readme-banner-light.png`, `readme-banner-dark.png`   | The repository README's header (2400 x 720), for GitHub's light and dark modes. |

## Source

| File                |                                                    |
| ------------------- | -------------------------------------------------- |
| `source/mascot.py`  | The mascot's drawing: its shape, colours and face. |
| `source/build.py`   | Builds everything above from it.                   |
| `source/render.mjs` | Draws the PNGs, run by `build.py`.                 |
| `source/svg/`       | The master SVGs every file is made from.           |
