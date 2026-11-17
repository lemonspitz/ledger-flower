#!/usr/bin/env bash
# Ad-hoc sign the macOS builds after electron-builder (which can't sign when building on Linux).
# Apple-silicon Macs refuse to launch an app bundle without a valid signature, even a free ad-hoc one.
# Needs rcodesign:  cargo install apple-codesign --locked
set -euo pipefail
cd "$(dirname "$0")/../release"
for zip in *-mac-*.zip; do
  work=$(mktemp -d)
  unzip -q "$zip" -d "$work"
  # No certificate given → ad-hoc signature for every helper, framework and the app, with sealed resources.
  rcodesign sign "$work/Ledgerleaf.app" >/dev/null
  rm "$zip"
  (cd "$work" && zip -qry "$OLDPWD/$zip" Ledgerleaf.app)   # -y keeps the framework symlinks
  rm -rf "$work"
  echo "signed $zip"
done
