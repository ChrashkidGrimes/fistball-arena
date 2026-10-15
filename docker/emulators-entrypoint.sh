#!/bin/sh
# Start the emulators; reload the last saved state and save it back on shutdown
# (`podman compose stop`/`down` sends SIGTERM → export-on-exit). The export goes
# to a subdirectory: firebase replaces the target dir, and /data is a mount point.
set -e
DATA=/data/export
IMPORT=""
if [ -f "$DATA/firebase-export-metadata.json" ]; then IMPORT="--import=$DATA"; fi
exec firebase emulators:start --project demo-fistball $IMPORT --export-on-exit="$DATA"
