#!/usr/bin/env bash
set -e
cd android

# --- Root build.gradle: add ObjectBox plugin classpath ---
if ! grep -q "objectbox-gradle-plugin" build.gradle; then
  sed -i 's|dependencies {|dependencies {\n        classpath "io.objectbox:objectbox-gradle-plugin:6.0.0-beta"|' build.gradle
fi

# --- App build.gradle: apply plugin + add deps ---
if ! grep -q "io.objectbox" app/build.gradle; then
  # apply plugin at top (after existing apply lines)
  sed -i '1a apply plugin: "io.objectbox.sync"' app/build.gradle

  # add dependencies
  sed -i 's|dependencies {|dependencies {\n    implementation "io.objectbox:objectbox-sync-android:6.0.0-beta"\n    implementation "io.objectbox:objectbox-meshsync-android:6.0.0-beta"\n    implementation "com.google.android.gms:play-services-nearby:19.3.0"|' app/build.gradle
fi

echo "patch-android.sh applied"

# --- Register MeshSyncPlugin in MainActivity ---
MAIN=$(find app/src/main/java -name MainActivity.java | head -1)
if [ -n "$MAIN" ] && ! grep -q "MeshSyncPlugin" "$MAIN"; then
  sed -i 's|public class MainActivity extends BridgeActivity {|public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(MeshSyncPlugin.class);\n        super.onCreate(savedInstanceState);\n    }|' "$MAIN"
fi
