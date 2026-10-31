// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Downloads come straight from the latest GitHub release, so a new release never needs a site
 * update. Until the release is read (or if GitHub can't be reached) every link goes to the
 * release page, where all the files are.
 */

export const REPO = "nikylogic/ivibe";
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
export const MAC_INSTALL = `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install-mac.sh | bash`;

export type Platform = "mac" | "windows" | "linux";

export interface Download {
  label: string;
  url: string;
  /** "84 MB", once the release has been read. */
  size?: string;
}

export interface Release {
  version?: string;
  windows: Download;
  macArm: Download;
  macIntel: Download;
  linuxDeb: Download;
  linuxAppImage: Download;
}

export const FALLBACK_RELEASE: Release = {
  windows: { label: "Windows installer", url: RELEASES_URL },
  macArm: { label: "Mac with Apple silicon", url: RELEASES_URL },
  macIntel: { label: "Mac with Intel", url: RELEASES_URL },
  linuxDeb: { label: "Linux (.deb)", url: RELEASES_URL },
  linuxAppImage: { label: "Linux (AppImage)", url: RELEASES_URL },
};

interface GitHubAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

export async function latestRelease(): Promise<Release> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const release = (await response.json()) as { tag_name: string; assets: GitHubAsset[] };
  const pick = (base: Download, test: RegExp): Download => {
    const asset = release.assets.find((candidate) => test.test(candidate.name));
    return asset ? { ...base, url: asset.browser_download_url, size: megabytes(asset.size) } : base;
  };
  return {
    version: release.tag_name.replace(/^v/, ""),
    windows: pick(FALLBACK_RELEASE.windows, /Setup-.*\.exe$/),
    macArm: pick(FALLBACK_RELEASE.macArm, /mac-arm64\.dmg$/),
    macIntel: pick(FALLBACK_RELEASE.macIntel, /mac-x64\.dmg$/),
    linuxDeb: pick(FALLBACK_RELEASE.linuxDeb, /\.deb$/),
    linuxAppImage: pick(FALLBACK_RELEASE.linuxAppImage, /\.AppImage$/),
  };
}

/** The visitor's OS, from the browser. Phones and unknowns get null. */
export function detectPlatform(): Platform | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const name = (nav.userAgentData?.platform || nav.userAgent).toLowerCase();
  if (/android|iphone|ipad|ipod/.test(name)) return null;
  if (name.includes("mac")) return "mac";
  if (name.includes("win")) return "windows";
  if (name.includes("linux") || name.includes("x11")) return "linux";
  return null;
}
