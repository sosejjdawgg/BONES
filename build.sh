#!/usr/bin/env bash
# Builds dist/bones.html from the split source files.
# Usage: ./build.sh [--no-bump]
set -euo pipefail
cd "$(dirname "$0")"

BUMP=1
if [[ "${1:-}" == "--no-bump" ]]; then BUMP=0; fi

echo "==> concatenating sources into combined.js"
cat jumpslide.js enemyframes.js megaframes.js parktiles.js statport.js hearts.js \
    dogframes2.js dogframes3.js runframes.js frames.js portraits.js bones.js park.js paperboy.js \
    > combined.js

echo "==> node --check combined.js"
node --check combined.js

echo "==> checking every \$(\"#id\") / \$('#id') target exists in bones.html"
python3 - "$BUMP" <<'PYEOF'
import re, sys, pathlib

bump = sys.argv[1] == "1"

html_path = pathlib.Path("bones.html")
js_path = pathlib.Path("combined.js")
dist_path = pathlib.Path("dist/bones.html")

html = html_path.read_text()
js = js_path.read_text()

# ---- id sanity check: every $("#foo") / $('#foo') must exist as id="foo" in bones.html ----
referenced = set(re.findall(r'''\$\(["']#([A-Za-z0-9_-]+)["']\)''', js))
declared = set(re.findall(r'''\bid=["']([A-Za-z0-9_-]+)["']''', html))
missing = sorted(referenced - declared)
if missing:
    sys.stderr.write("BUILD FAILED — ids referenced in JS but missing from bones.html:\n")
    for m in missing:
        sys.stderr.write("  #%s\n" % m)
    sys.exit(1)
print("  all %d referenced ids present" % len(referenced))

# ---- version bump (in the source bones.html, so it carries forward) ----
ver_re = re.compile(r'(id="devToggle"[^>]*>)v(\d+)\.(\d+)([a-z]*)(<)')
m = ver_re.search(html)
if m is None:
    sys.stderr.write("BUILD FAILED — could not find version span (#devToggle) in bones.html\n")
    sys.exit(1)

if bump:
    major, minor, suffix = int(m.group(2)), int(m.group(3)), m.group(4)
    minor += 1
    new_ver = "v%d.%02d%s" % (major, minor, suffix)
    html = html[:m.start()] + m.group(1) + new_ver + m.group(5) + html[m.end():]
    html_path.write_text(html)
    print("  version bumped to %s" % new_ver)
else:
    new_ver = "v%d.%02d%s" % (int(m.group(2)), int(m.group(3)), m.group(4))
    print("  version left at %s (--no-bump)" % new_ver)

# ---- inline combined.js into (the possibly just-bumped) bones.html ----
placeholder = '<script src="bones.js"></script>'
if placeholder not in html:
    sys.stderr.write("BUILD FAILED — placeholder %r not found in bones.html\n" % placeholder)
    sys.exit(1)
out = html.replace(placeholder, "<script>\n" + js + "\n</script>")

dist_path.parent.mkdir(exist_ok=True)
dist_path.write_text(out)
print("  wrote %s (%d bytes)" % (dist_path, len(out)))
PYEOF

echo "==> done"
