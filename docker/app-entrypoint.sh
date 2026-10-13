#!/bin/sh
# Vite dev server against the emulators. node_modules lives in a container
# volume (the host's are built for macOS), reinstalled when the lockfile changes.
set -e
cd /app
STAMP=node_modules/.package-lock.sha
if ! sha1sum -c "$STAMP" >/dev/null 2>&1; then
  echo "Installing dependencies…"
  npm ci --no-audit --no-fund
  sha1sum package-lock.json > "$STAMP"
fi
exec npx vite --mode emulator --host 0.0.0.0 --port 5173 --strictPort
