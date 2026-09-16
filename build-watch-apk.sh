#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# build-watch-apk.sh — Build Agentrix Claw Watch APK for Wear OS
# Usage: bash build-watch-apk.sh [debug|release]
# Output: android/app/build/outputs/apk/{debug|release}/app-{debug|release}.apk
# ────────────────────────────────────────────────────────────────
set -euo pipefail

BUILD_TYPE="${1:-release}"
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
MANIFEST_BACKUP="$MANIFEST.phone.bak"
WEAROS_MANIFEST="$ANDROID_DIR/app/src/wearos/AndroidManifest.xml"
OUTPUT_DIR="$PROJECT_ROOT/builds"

echo "🕐 Agentrix Claw Watch APK Builder"
echo "   Build type: $BUILD_TYPE"
echo ""

# ── Step 1: Patch manifest for Wear OS ──────────────────────────
echo "📝 Step 1: Patching AndroidManifest.xml for Wear OS..."
cp "$MANIFEST" "$MANIFEST_BACKUP"

# Insert Wear OS uses-feature after opening <manifest> tag
sed -i '/<manifest/a\    <uses-feature android:name="android.hardware.type.watch" />' "$MANIFEST"

# Insert Wear OS standalone meta-data before </application>
sed -i '/<\/application>/i\    <meta-data android:name="com.google.android.wearable.standalone" android:value="true" />\n    <uses-library android:name="com.google.android.wearable" android:required="false" />' "$MANIFEST"

# Add BODY_SENSORS permission if not present
if ! grep -q "android.permission.BODY_SENSORS" "$MANIFEST"; then
  sed -i '/<uses-permission android:name="android.permission.VIBRATE"/a\  <uses-permission android:name="android.permission.BODY_SENSORS" />\n  <uses-permission android:name="android.permission.BODY_SENSORS_BACKGROUND" />\n  <uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />' "$MANIFEST"
fi

echo "   ✓ Manifest patched"

# ── Step 2: Gradle build (bundles JS automatically via react{} block) ──
echo "🔨 Step 2: Building APK ($BUILD_TYPE)..."
echo "   Gradle will bundle index.watch.js via -Pagentrix.wearos=true flag"
cd "$ANDROID_DIR"

# Clean previous build artifacts to ensure fresh bundle
rm -rf app/build/generated/assets/createBundleReleaseJsAndAssets
rm -rf app/build/generated/assets/createBundleDebugJsAndAssets

if [ "$BUILD_TYPE" = "debug" ]; then
  ./gradlew :app:assembleDebug -Pagentrix.wearos=true --no-daemon 2>&1 | tail -20
  APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
else
  ./gradlew :app:assembleRelease -Pagentrix.wearos=true --no-daemon 2>&1 | tail -20
  APK_PATH="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
fi

# ── Step 3: Restore original manifest ──────────────────────────
echo "🔄 Step 3: Restoring original AndroidManifest.xml..."
mv "$MANIFEST_BACKUP" "$MANIFEST"
echo "   ✓ Manifest restored"

# ── Step 4: Copy APK to output ──────────────────────────────────
if [ -f "$APK_PATH" ]; then
  mkdir -p "$OUTPUT_DIR"
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  OUTPUT_APK="$OUTPUT_DIR/agentrix-watch-${BUILD_TYPE}-${TIMESTAMP}.apk"
  cp "$APK_PATH" "$OUTPUT_APK"
  
  APK_SIZE=$(du -h "$OUTPUT_APK" | cut -f1)
  echo ""
  echo "✅ Wear OS APK built successfully!"
  echo "   📁 $OUTPUT_APK"
  echo "   📏 Size: $APK_SIZE"
  echo ""
  echo "📱 Install on watch:"
  echo "   adb -s <watch_ip>:5555 install $OUTPUT_APK"
  echo ""
  echo "   Or via WiFi debugging:"
  echo "   adb connect <watch_ip>:5555"
  echo "   adb install $OUTPUT_APK"
else
  echo "❌ APK not found at: $APK_PATH"
  echo "   Check Gradle output above for errors."
  exit 1
fi
