// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { astryxStylex } from "@astryxdesign/build/vite";

// Cross-origin isolation lets ONNX Runtime (OCR) use WebAssembly threads (docs/architecture.md §4.2).
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/**
 * The Astryx layer-split plugin links its shared stylesheet as "./assets/…" (from electron-vite's
 * relative base), which breaks for pages in subfolders. The app is served from app://ivibe/, so
 * an absolute link is correct for every page.
 */
function absoluteAstryxStylesheet(): Plugin {
  return {
    name: "ivibe-absolute-astryx-stylesheet",
    apply: "build",
    enforce: "post",
    writeBundle({ dir }) {
      if (!dir) return;
      for (const page of ["ui", "hud", "recorder"]) {
        const file = join(dir, page, "index.html");
        const html = readFileSync(file, "utf8");
        writeFileSync(
          file,
          html.replaceAll('href="./assets/astryx-stylex-', 'href="/assets/astryx-stylex-'),
        );
      }
    },
  };
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, "src/main/index.ts") } },
    },
  },
  preload: {
    build: {
      // Sandboxed preloads can't require shared chunks, so each entry is bundled on its own.
      isolatedEntries: true,
      externalizeDeps: false,
      rollupOptions: {
        input: {
          ui: resolve(__dirname, "src/preload/ui.ts"),
          hud: resolve(__dirname, "src/preload/hud.ts"),
          recorder: resolve(__dirname, "src/preload/recorder.ts"),
        },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [...astryxStylex(), react(), absoluteAstryxStylesheet()],
    server: { headers: isolationHeaders },
    build: {
      rollupOptions: {
        input: {
          ui: resolve(__dirname, "src/renderer/ui/index.html"),
          hud: resolve(__dirname, "src/renderer/hud/index.html"),
          recorder: resolve(__dirname, "src/renderer/recorder/index.html"),
        },
      },
    },
  },
});
