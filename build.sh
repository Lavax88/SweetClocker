#!/bin/bash
# build.sh - Build and Package SweetClocker Module
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "==> Building WebUI with Vite & TypeScript..."
npm ci
npm run typecheck
npm run build

echo "==> Validating build output..."
if [ ! -f "webroot/index.html" ] || [ ! -d "webroot/assets" ]; then
  echo "Error: webroot build artifacts missing!"
  exit 1
fi

VER=$(grep '^version=' module.prop | cut -d= -f2 | tr -d '\r')
ZIP_NAME="SweetClocker-${VER}.zip"

echo "==> Packaging ${ZIP_NAME}..."
rm -f "$ZIP_NAME"

zip -r -9 "$ZIP_NAME" \
  module.prop \
  service.sh \
  post-fs-data.sh \
  customize.sh \
  uninstall.sh \
  sweetspot-apply.sh \
  telemetry.sh \
  webroot \
  changelog.md \
  update.json \
  -x "webroot/.git*" "webroot/*~"

echo "==> Flashable module package ready: ${ZIP_NAME}"
ls -lh "$ZIP_NAME"
unzip -l "$ZIP_NAME"
