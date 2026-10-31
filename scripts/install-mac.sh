#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
#
# Installs the latest iVibe on macOS in one step:
#
#   curl -fsSL https://raw.githubusercontent.com/nikylogic/ivibe/main/scripts/install-mac.sh | bash
#
# It downloads the release zip for this Mac (Apple silicon or Intel), puts iVibe.app in
# /Applications (or ~/Applications when that isn't writable) and opens it. Files curl downloads
# aren't quarantined, so macOS doesn't stop the unsigned app on first launch.
set -euo pipefail

repo="nikylogic/ivibe"
case "$(uname -m)" in
  arm64) arch="arm64" ;;
  *) arch="x64" ;;
esac

echo "Finding the latest iVibe for $arch..."
url="$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest" |
  grep -o "https://[^\"]*-mac-$arch\.zip\"" | head -n 1 | tr -d '"')"
if [ -z "$url" ]; then
  echo "Couldn't find a macOS download. Get it from https://github.com/$repo/releases/latest" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "Downloading $(basename "$url")..."
curl -fL --progress-bar -o "$tmp/iVibe.zip" "$url"
ditto -x -k "$tmp/iVibe.zip" "$tmp/app"

target="/Applications"
if [ ! -w "$target" ]; then
  target="$HOME/Applications"
  mkdir -p "$target"
fi

# Quit a running copy so it can be replaced.
osascript -e 'tell application "iVibe" to quit' >/dev/null 2>&1 || true
sleep 1

rm -rf "$target/iVibe.app"
mv "$tmp/app/iVibe.app" "$target/iVibe.app"
xattr -dr com.apple.quarantine "$target/iVibe.app" 2>/dev/null || true

echo "Installed in $target. Opening iVibe..."
open "$target/iVibe.app"
