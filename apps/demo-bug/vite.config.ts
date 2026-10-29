// SPDX-License-Identifier: AGPL-3.0-only

import type { Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

type Profile = { name: string; email: string; bio: string; tags: string[] };

let stored: Profile = {
  name: "Asha Rao",
  email: "asha@example.com",
  bio: "Building things on weekends",
  tags: ["react", "design"],
};

/**
 * A tiny in-memory profile API, so the Network tab shows real requests. "v2" of the API wraps the
 * profile in `profile`; the form was written against v1, which used `user`. That mismatch is the
 * planted bug.
 */
function profileApi(): Plugin {
  return {
    name: "profile-api",
    configureServer(server) {
      server.middlewares.use("/api/profile", (req, res) => {
        const send = () => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Api-Version", "2");
          res.end(JSON.stringify({ profile: stored, updatedAt: new Date().toISOString() }));
        };
        if (req.method !== "PUT") return send();
        let body = "";
        req.on("data", (chunk: Buffer) => (body += chunk));
        req.on("end", () => {
          stored = { ...stored, ...(JSON.parse(body) as Partial<Profile>) };
          setTimeout(send, 250);
        });
      });
    },
  };
}

export default defineConfig({ plugins: [react(), profileApi()] });
