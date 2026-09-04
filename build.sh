#!/usr/bin/env bash
# Build the single-file game. That single file is the DELIVERABLE - it is what itch.io
# hosts and what gets sent to the phone - but it is not the source, and it stopped being
# the source in v0.350a.
#
#   src/head.html    the DOM and the CSS
#   src/assets.js    33 declarations, 10.1MB, pure base64 data. Changes about once a month.
#   src/src.js       1.2MB of actual code. Changes every session.
#   src/tail.html    the closing tags
#
# assets.js goes FIRST so every asset binding exists before any code runs. That is safe
# because assets.js is provably pure data: no calls, no arrows, no functions, no operators
# (see split.py, which checks exactly that before it will write the file).
set -euo pipefail
cd "$(dirname "$0")"
V="${1:-}"
[ -z "$V" ] && { echo "usage: ./build.sh 0.350a"; exit 1; }
OUT="bones-v${V}.html"
sed -i "s|<span id=\"devToggle\">v[0-9.]*a</span>|<span id=\"devToggle\">v${V}</span>|" src/head.html
node --check src/assets.js
node --check src/src.js
cat src/head.html src/assets.js src/src.js src/tail.html > "$OUT"
# ...and a stable name. The harnesses point at THIS, so a version bump no longer means
# editing the filename in thirty-six test files, and it is the one file to upload to itch.
cp "$OUT" bones-latest.html
printf 'built %s -> bones-latest.html  %s MB\n' "$OUT" "$(du -m "$OUT" | cut -f1)"
