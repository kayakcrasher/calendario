#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d "android" ]; then
  echo "ERROR: android/ folder doesn't exist — cap add failed"
  exit 1
fi

cd android

echo "=== android/ contents ==="
ls -la
echo "=== android/app/ contents ==="
ls -la app/ 2>/dev/null || true

# Detect which DSL Capacitor generated
ROOT=""
for f in build.gradle build.gradle.kts; do
  if [ -f "$f" ]; then ROOT="$f"; break; fi
done

APP=""
for f in app/build.gradle app/build.gradle.kts; do
  if [ -f "$f" ]; then APP="$f"; break; fi
done

echo "root=$ROOT  app=$APP"

if [ -z "$ROOT" ] || [ -z "$APP" ]; then
  echo "ERROR: gradle files not found — this Capacitor version uses unexpected layout"
  exit 1
fi

echo "patch script completed successfully"
