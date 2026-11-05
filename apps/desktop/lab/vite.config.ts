// SPDX-License-Identifier: AGPL-3.0-only

import { astryxStylex } from "@astryxdesign/build/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

/**
 * In the app, "system" follows Electron's theme setting. Here it follows the Lab's Light and Dark
 * switch, which a frame can't get from the browser. Only the Lab's copy of the file changes.
 */
function followLabTheme(): Plugin {
  const original = "mode={mode}";
  return {
    name: "ivibe-lab-theme",
    enforce: "pre",
    transform(code, id) {
      if (!id.split("?")[0]!.endsWith("renderer/shared/theme.tsx")) return null;
      if (!code.includes(original)) this.error(`theme.tsx no longer has ${original}`);
      return code.replace(
        original,
        'mode={mode === "system" ? ((new URLSearchParams(location.search).get("theme") ?? mode) as "dark") : mode}',
      );
    },
  };
}

// The app's real screens in a browser, with a pretend main process (fake.ts). Never in the installer.
export default defineConfig({
  plugins: [followLabTheme(), ...astryxStylex(), react()],
  server: { port: 5200, strictPort: true, fs: { allow: ["../../.."] } },
});
