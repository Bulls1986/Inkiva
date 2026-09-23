#!/usr/bin/env bash
set -euo pipefail

artifact_dir="${1:-dist}"
dmg="$(find "$artifact_dir" -maxdepth 1 -type f -name '*.dmg' -print -quit)"
zip="$(find "$artifact_dir" -maxdepth 1 -type f -name '*.zip' -print -quit)"
[[ -n "$dmg" ]] || { echo 'macOS package smoke: DMG artifact not found' >&2; exit 1; }
[[ -n "$zip" ]] || { echo 'macOS package smoke: ZIP artifact not found' >&2; exit 1; }

hdiutil verify "$dmg"
mount_dir="$(mktemp -d)"
install_dir="$(mktemp -d)"
cleanup() {
  hdiutil detach "$mount_dir" >/dev/null 2>&1 || true
  rm -rf "$mount_dir" "$install_dir"
}
trap cleanup EXIT

hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mount_dir" >/dev/null
app="$(find "$mount_dir" -maxdepth 1 -type d -name '*.app' -print -quit)"
[[ -n "$app" ]] || { echo 'macOS package smoke: mounted DMG contains no .app bundle' >&2; exit 1; }
executable_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")"
[[ -x "$app/Contents/MacOS/$executable_name" ]] || {
  echo 'macOS package smoke: app bundle executable is missing or not executable' >&2
  exit 1
}

cp -R "$app" "$install_dir/"
installed_app="$install_dir/$(basename "$app")"
[[ -x "$installed_app/Contents/MacOS/$executable_name" ]] || {
  echo 'macOS install smoke: copied app bundle is not runnable' >&2
  exit 1
}

unzip -tq "$zip" >/dev/null
echo "Verified macOS DMG install copy and ZIP from $artifact_dir"
