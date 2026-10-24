#!/bin/sh
# Packs the newest bones-v*.html as an itch.io HTML upload: a zip with index.html at its top level
# (itch.io looks for exactly that, and sits on "Loading game for the first time" without it),
# plus the copyright notice and licence.
set -e
cd "$(dirname "$0")/.."
HTML=$(ls bones-v*.html | sort -V | tail -1)
VER=$(echo "$HTML" | sed 's/^bones-\(v[0-9.]*a\)\.html$/\1/')
OUT=itch/build/BONES-itch-$VER.zip
STAGE=itch/build/stage
rm -rf "$STAGE" "$OUT"; mkdir -p "$STAGE"
cp "$HTML" "$STAGE/index.html"
cp COPYRIGHT.md LICENSE "$STAGE/"
(cd "$STAGE" && zip -q -9 -X "../$(basename "$OUT")" index.html COPYRIGHT.md LICENSE)
rm -rf "$STAGE"
echo "built $OUT ($(du -h "$OUT" | cut -f1))"
