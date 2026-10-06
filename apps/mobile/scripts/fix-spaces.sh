#!/usr/bin/env bash
# This repo lives under "/Volumes/Extreme SSD/…". expo-constants' iOS build
# phase runs its script unquoted, so a path with a space breaks the build.
# Quote it (idempotent). Runs on postinstall; iOS-only, Android unaffected.
f="node_modules/expo-constants/ios/EXConstants.podspec"
[ -f "$f" ] || exit 0
sed -i.bak 's#bash -l -c \\"\#{env_vars}\$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"#bash -l -c \\"\#{env_vars}\\\\\\"\$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\\\\\"\\"#' "$f" && rm -f "$f.bak"
grep -n "get-app-config-ios.sh" "$f" | head -1

# The generated Xcode project runs the RN bundling script through an unquoted
# command substitution; quote it too (only present after `expo prebuild -p ios`).
pbx="ios/Xorv.xcodeproj/project.pbxproj"
if [ -f "$pbx" ]; then
  python3 - "$pbx" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "`\\\"$NODE_BINARY\\\" --print \\\"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\\\"`"
new = "\\\"$(\\\"$NODE_BINARY\\\" --print \\\"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\\\")\\\""
if old in s:
    open(p, "w").write(s.replace(old, new)); print("patched", p)
PY
fi
