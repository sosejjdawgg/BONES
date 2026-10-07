#!/usr/bin/env bash
# Builds BONES-v<version>.apk from the newest bones-v*.html in the repo root (or the one passed in).
# No Gradle: aapt2 + javac + d8 + zipalign + apksigner straight from the Android SDK, so the only
# requirements are a JDK and an SDK with platforms;android-34 and build-tools;35.0.0:
#   ANDROID_HOME=/path/to/sdk ./android/build.sh [bones-vX.html]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(dirname "$HERE")"
: "${ANDROID_HOME:?set ANDROID_HOME to an Android SDK}"
BT="$ANDROID_HOME/build-tools/35.0.0"            # 34.0.0's d8 crashes on anonymous classes
JAR="$ANDROID_HOME/platforms/android-34/android.jar"
HTML="${1:-$(ls "$ROOT"/bones-v*.html | sort -V | tail -1)}"
VER="$(basename "$HTML" .html)"; VER="${VER#bones-v}"                  # 0.409a
CODE="$(echo "$VER" | sed -E 's/^0\.([0-9]+).*/\1/')"                # 409 - goes up with every release
OUT="$HERE/build"; rm -rf "$OUT"; mkdir -p "$OUT/assets/fonts" "$OUT/classes" "$OUT/gen" "$OUT/dex"

# 1. the game, made to work offline: the Google Fonts links become the bundled woff2 files, and
#    the PWA manifest/icon links (files this repo does not ship) are dropped
python3 - "$HTML" "$OUT/assets/index.html" <<'PY'
import sys,re
src,dst=sys.argv[1],sys.argv[2]
s=open(src,encoding='utf-8').read()
face=lambda f,r:("@font-face{font-family:'Press Start 2P';font-style:normal;font-weight:400;font-display:block;"
                 "src:url(fonts/%s) format('woff2');unicode-range:%s}"%(f,r))
css="<style>"+face("ps2p-latin.woff2","U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD")+ \
    face("ps2p-latin-ext.woff2","U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF")+"</style>"
n0=len(s)
s=re.sub(r'<link rel="preconnect" href="https://fonts\.googleapis\.com">\s*','',s)
s,k=re.subn(r'<link href="https://fonts\.googleapis\.com/css2\?family=Press\+Start\+2P[^"]*" rel="stylesheet">',lambda m:css,s)
assert k==1,"font link not found"
s=re.sub(r'<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\s*','',s)
assert 'googleapis' not in s
open(dst,'w',encoding='utf-8').write(s)
print("packaged",src,"->",len(s),"bytes")
PY
cp "$HERE"/fonts/*.woff2 "$HERE/fonts/OFL.txt" "$OUT/assets/fonts/"

# 2. resources and manifest
"$BT/aapt2" compile --dir "$HERE/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$JAR" --manifest "$HERE/AndroidManifest.xml" \
  -A "$OUT/assets" --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$CODE" --version-name "$VER" --java "$OUT/gen" "$OUT/res.zip"

# 3. code
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$JAR" -classpath "$JAR" \
  -d "$OUT/classes" $(find "$HERE/src" "$OUT/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
(cd "$OUT/dex" && zip -q -j "$OUT/unsigned.apk" classes.dex)

# 4. align and sign. Android only installs an update over an app signed with the SAME key - a new
#    key means uninstalling first, which wipes the saves - so keep the keystore. It is deliberately
#    NOT in git (the repo is public, and anyone holding it can sign an "update" to this app): pass
#    it in with BONES_KEYSTORE, or leave android/bones-release.jks (gitignored) in place.
KS="${BONES_KEYSTORE:-$HERE/bones-release.jks}"; PASS="${BONES_KEYSTORE_PASS:-bones-sideload}"
[ -f "$KS" ] || echo "no keystore at $KS - making a NEW key; this APK will not install over one signed with another" >&2
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass "$PASS" -keypass "$PASS" -alias bones \
  -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=BONES, O=sosejjdawgg" >/dev/null
"$BT/zipalign" -p -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
APK="$OUT/BONES-v$VER.apk"
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$PASS" --ks-key-alias bones --out "$APK" "$OUT/aligned.apk"
"$BT/apksigner" verify "$APK"
echo "built $APK ($(du -h "$APK" | cut -f1)), versionCode $CODE"
