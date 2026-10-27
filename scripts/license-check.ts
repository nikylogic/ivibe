// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Fails when any dependency of any workspace package uses a license outside the allowlist.
 * Development dependencies count too: Vite bundles the desktop app's devDependencies into it.
 *
 * iVibe is AGPL-3.0 and also sold under a commercial license, so every dependency must be
 * permissive: GPL-family code could not be included in the commercial license.
 * Policy: docs/architecture.md §12.1.
 */

import { execSync } from "node:child_process";

const ALLOWED = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Apache-2.0",
  "MPL-2.0",
  "CC0-1.0",
  "CC-BY-4.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "Python-2.0",
  "WTFPL",
  // Fonts bundled with the app (Inter, Instrument Serif); allows embedding in commercial software.
  "OFL-1.1",
]);

/** Packages whose license field isn't a valid SPDX ID, checked by hand. */
const REVIEWED: Record<string, string> = {
  // "BSD" in package.json; the LICENSE file is the 3-clause BSD license.
  "css-mediaquery": "BSD-3-Clause",
};

/** Our own workspace packages are AGPL-3.0 by design. */
const isOwnPackage = (name: string) => name === "ivibe" || name.startsWith("@ivibe/");

interface LicensedPackage {
  name: string;
  versions?: string[];
}

/** Accepts SPDX expressions such as "(MIT OR Apache-2.0)" or "MIT AND ISC". */
function isAllowedExpression(expression: string): boolean {
  const cleaned = expression.replace(/[()]/g, " ").trim();
  return cleaned
    .split(/\s+OR\s+/i)
    .some((alternative) =>
      alternative.split(/\s+AND\s+/i).every((id) => ALLOWED.has(id.trim().replace(/\+$/, ""))),
    );
}

function main(): void {
  const raw = execSync("pnpm licenses list --recursive --json", { encoding: "utf8" });
  const byLicense = (raw.trim() ? JSON.parse(raw) : {}) as Record<string, LicensedPackage[]>;

  const violations: string[] = [];
  let checked = 0;
  for (const [license, packages] of Object.entries(byLicense)) {
    for (const pkg of packages) {
      if (isOwnPackage(pkg.name)) continue;
      checked++;
      if (!isAllowedExpression(REVIEWED[pkg.name] ?? license)) {
        violations.push(`${pkg.name}@${pkg.versions?.join(", ") ?? "?"}: ${license}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("Dependencies with licenses outside the allowlist (docs/architecture.md §12.1):");
    for (const line of violations) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log(`License check passed: ${checked} dependencies, all on the allowlist.`);
}

main();
