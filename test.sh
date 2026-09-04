#!/usr/bin/env bash
# Run the harnesses in parallel.
#
# Every suite pays a fixed ~17s boot before it checks anything - the page load plus the
# adoption click-through - and that preamble, not the checking, is most of the battery.
# Measured on six suites: 111s serial, 21s at six-wide. 5.3x, and nothing else changed.
#
#   ./test.sh              the full battery
#   ./test.sh boss         only suites matching "boss"
#   ./test.sh smoke        the fast set worth running after every edit
#
# Four cores here, but the work is mostly waiting, so six-wide beats four-wide.
set -uo pipefail
cd "$(dirname "$0")"
J="${J:-6}"
# The battery is the list in SUITES, not "everything matching p*.js" - there are 110 of
# those and 74 are stale one-off probes from earlier sessions.
ALL=$(grep -v '^#' SUITES | awk 'NF{print $1}' | tr '\n' ' ')
SMOKE=$(grep -v '^#' SUITES | awk '$2=="smoke"{print $1}' | tr '\n' ' ')
case "${1:-all}" in
  all)   SUITES="$ALL" ;;
  smoke) SUITES="$SMOKE" ;;
  *)     SUITES=$(echo "$ALL" | tr ' ' '\n' | grep -- "$1" | tr '\n' ' ') ;;
esac
# THE BUILD MUST BE THE SOURCE. The one way this layout can hurt us is silently: edit
# src/src.js, forget to rebuild, and the battery then passes against the PREVIOUS build
# while reporting on code that is not what is in src/. Or the reverse - someone edits the
# built HTML and the next build wipes it without a word. Both are caught here, by rebuilding
# to a temp file and comparing, before a single suite runs. It costs under a second.
FRESH=$(mktemp); trap 'rm -f "$FRESH"' EXIT
cat src/head.html src/assets.js src/src.js src/tail.html > "$FRESH"
if ! cmp -s "$FRESH" bones-latest.html; then
  echo "STALE BUILD: bones-latest.html is not what src/ builds."
  echo "  run ./build.sh <version> first — the tests would otherwise pass against old code."
  exit 2
fi

mkdir -p .out
T0=$(date +%s); FAIL=0; N=0
for t in $SUITES; do
  while [ "$(jobs -rp | wc -l)" -ge "$J" ]; do wait -n 2>/dev/null || true; done
  ( timeout 560 node "$t.js" > ".out/$t.txt" 2>&1; echo $? > ".out/$t.code" ) &
  N=$((N+1))
done
wait
for t in $SUITES; do
  c=$(cat ".out/$t.code" 2>/dev/null || echo 99)
  if [ "$c" != "0" ]; then
    FAIL=$((FAIL+1)); printf '\033[31mFAIL\033[0m %-10s\n' "$t"
    grep -E '^  - ' ".out/$t.txt" | head -6 | sed 's/^/       /'
  fi
done
printf '\n%d suites, %d failed, %ds wall\n' "$N" "$FAIL" "$(( $(date +%s) - T0 ))"
[ "$FAIL" -eq 0 ] || exit 1
