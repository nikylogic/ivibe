// SPDX-License-Identifier: AGPL-3.0-only

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { astryxStylex } from "@astryxdesign/build/vite";

// A static site: `pnpm --filter @ivibe/web build` writes dist/, which Cloudflare Pages serves.
export default defineConfig({
  plugins: [...astryxStylex(), react()],
});
