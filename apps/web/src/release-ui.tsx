// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { FALLBACK_RELEASE, latestRelease } from "./release.ts";
import type { Release } from "./release.ts";

/** The latest release and each platform's icon, for the pages that offer a download. */

export const appleIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.41-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z" />
  </svg>
);

export const windowsIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M2 4.4 10 3.3v8.1H2zm9-1.2L22 1.6v9.8H11zM2 12.6h8v8.1l-8-1.1zm9 0h11v9.8l-11-1.5z" />
  </svg>
);

export const linuxIcon = <Monitor size={15} strokeWidth={1.75} aria-hidden="true" />;

export function useRelease(): Release {
  const [release, setRelease] = useState<Release>(FALLBACK_RELEASE);
  useEffect(() => {
    latestRelease().then(setRelease, () => undefined);
  }, []);
  return release;
}
