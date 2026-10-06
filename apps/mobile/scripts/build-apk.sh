#!/usr/bin/env bash
# Release APK, signed with the per-app release key kept OUTSIDE the repo.
#   XORV_SIGNING=/path/to/xorv-release.properties scripts/build-apk.sh
# The properties file holds XORV_STORE_FILE / XORV_STORE_PASSWORD /
# XORV_KEY_ALIAS / XORV_KEY_PASSWORD. Output is copied to $APK_OUT.
set -euo pipefail
cd "$(dirname "$0")/.."
SIGNING="${XORV_SIGNING:-/Volumes/Extreme SSD/Projects/clockin/keys/xorv-release.properties}"
APK_OUT="${APK_OUT:-/Volumes/Extreme SSD/Projects/clockin/apks/xorv-clockin.apk}"
[ -f "$SIGNING" ] || { echo "missing signing properties: $SIGNING"; exit 1; }

[ -d android ] || npx expo prebuild -p android --no-install
GRADLE=android/app/build.gradle
if ! grep -q "XORV_SIGNING" "$GRADLE"; then
  python3 - "$GRADLE" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
props = '''
// --- xorv: release signing from a properties file outside the repo ---
def xorvSigning = new Properties()
def xorvSigningFile = file(System.getenv("XORV_SIGNING") ?: "/nonexistent")
if (xorvSigningFile.exists()) { xorvSigningFile.withInputStream { xorvSigning.load(it) } }
'''
s = s.replace("android {", props + "\nandroid {", 1)
s = s.replace("""    signingConfigs {
        debug {""", """    signingConfigs {
        release {
            if (xorvSigning['XORV_STORE_FILE']) {
                storeFile file(xorvSigning['XORV_STORE_FILE'])
                storePassword xorvSigning['XORV_STORE_PASSWORD']
                keyAlias xorvSigning['XORV_KEY_ALIAS']
                keyPassword xorvSigning['XORV_KEY_PASSWORD']
            }
        }
        debug {""", 1)
i = s.index("buildTypes {")
j = s.index("release {", i)
k = s.index("signingConfig signingConfigs.debug", j)
s = s[:k] + "signingConfig signingConfigs.release" + s[k + len("signingConfig signingConfigs.debug"):]
open(p, "w").write(s)
print("patched signing in", p)
PY
fi
export XORV_SIGNING="$SIGNING"
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon --max-workers=4 -Dorg.gradle.jvmargs="-Xmx3g -XX:MaxMetaspaceSize=512m" -q)
mkdir -p "$(dirname "$APK_OUT")"
cp android/app/build/outputs/apk/release/app-release.apk "$APK_OUT"
"$ANDROID_HOME"/build-tools/36.0.0/apksigner verify --print-certs "$APK_OUT" | head -3
shasum -a 256 "$APK_OUT"
