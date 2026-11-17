#!/bin/sh
# Copies the build to stage/, which a test server's modules/midi-qol links to while testing midi-next.
# stage/packs is copied once and never rebuilt: a world's server keeps the pack databases it opened at launch, and
# replacing them under it empties the world's compendiums (the "Turn into Frog" failures of 2026-11-17).
set -e
cd "$(dirname "$0")/.."
mkdir -p stage
rsync -a --delete --exclude packs dist/ stage/
[ -d stage/packs ] || cp -a packs stage/packs
echo "stage/ updated (packs kept)"
