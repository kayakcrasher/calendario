#!/usr/bin/env bash
set -e
MANIFEST="android/app/src/main/AndroidManifest.xml"

if grep -q "NEARBY_WIFI_DEVICES" "$MANIFEST"; then
  echo "manifest already patched"
  exit 0
fi

# Insert permissions right after <manifest ...>
PERMS='    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
    <uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
'

# Use awk to insert after the first <manifest ...> line
awk -v perms="$PERMS" '
  /<manifest/ && !done { print; print perms; done=1; next }
  { print }
' "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"

echo "manifest patched"
