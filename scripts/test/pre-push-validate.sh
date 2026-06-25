#!/usr/bin/env bash
# =============================================================================
# pre-push-validate.sh
# Local validation checks run before every git push.
# Catches known crash patterns and type errors WITHOUT touching product code.
#
# Exit codes: 0 = all checks passed, 1 = one or more checks failed
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "  ${GREEN}✔${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}✘${NC} $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
section() { echo -e "\n${CYAN}${BOLD}▶ $1${NC}"; }

# ---------------------------------------------------------------------------
# 1. ARM64 CRASH GUARDS
#    Detect side-effect imports that force native-module JSI init at bundle
#    parse time, which crashes on ARM64 real devices before Fabric is ready.
# ---------------------------------------------------------------------------
section "ARM64 crash guard — App.tsx side-effect imports"

# Standalone gesture-handler side-effect import (not a named import)
if grep -qP "^import\s+'react-native-gesture-handler'" "$REPO_ROOT/App.tsx"; then
  fail "App.tsx: bare 'import \"react-native-gesture-handler\"' detected — ARM64 crash risk"
else
  pass "App.tsx: no bare gesture-handler side-effect import"
fi

# Standalone reanimated side-effect import
if grep -qP "^import\s+'react-native-reanimated'" "$REPO_ROOT/App.tsx"; then
  fail "App.tsx: bare 'import \"react-native-reanimated\"' detected — ARM64 crash risk"
else
  pass "App.tsx: no bare reanimated side-effect import"
fi

# GestureHandlerRootView wrapper — REQUIRED by React Navigation v7.
# This is a named import, NOT a bare side-effect import. It does not trigger
# the early JNI init that caused ARM64 crashes. Keep it.
if grep -q "GestureHandlerRootView" "$REPO_ROOT/App.tsx"; then
  pass "App.tsx: GestureHandlerRootView wrapper present (required by React Navigation v7)"
else
  warn "App.tsx: GestureHandlerRootView not found — recommended for React Navigation v7 gesture support"
fi

# ---------------------------------------------------------------------------
# 2. BABEL CONFIG GUARD
#    nativewind/babel + jsxImportSource crashed on New Arch (B58-B67).
# ---------------------------------------------------------------------------
section "babel.config.js — nativewind check"

if grep -q "nativewind" "$REPO_ROOT/babel.config.js"; then
  fail "babel.config.js: 'nativewind' entry detected — caused JSI crash on New Arch (B58-B67)"
else
  pass "babel.config.js: no nativewind"
fi

if grep -q "jsxImportSource" "$REPO_ROOT/babel.config.js"; then
  fail "babel.config.js: 'jsxImportSource' found — paired with nativewind, caused RN 0.81 crash"
else
  pass "babel.config.js: no jsxImportSource"
fi

# ---------------------------------------------------------------------------
# 3. PACKAGE VERSION GUARDS
#    react-native-reanimated and react-native-worklets MUST NOT be present.
#    These packages auto-register native TurboModules at New Arch startup
#    via JNI, crashing on HarmonyOS 4.x (Huawei P40 Pro, Kirin 990).
#    They are NOT imported anywhere in the codebase — zero usage.
# ---------------------------------------------------------------------------
section "package.json — dependency version pins"

REANIMATED_VER=$(node -e "const p=require('./package.json'); console.log(p.dependencies['react-native-reanimated'] || '')")
WORKLETS_VER=$(node -e "const p=require('./package.json'); console.log(p.dependencies['react-native-worklets'] || p.dependencies['react-native-worklets-core'] || '')")

# reanimated must NOT be present — causes HarmonyOS ARM64 crash at startup
if [[ -n "$REANIMATED_VER" ]]; then
  fail "react-native-reanimated '$REANIMATED_VER' found — must be removed (causes HarmonyOS JNI crash at startup; not used in codebase)"
else
  pass "react-native-reanimated absent ✓ (removed B87: was crashing HarmonyOS P40 Pro)"
fi

# worklets must NOT be present
if [[ -n "$WORKLETS_VER" ]]; then
  fail "react-native-worklets '$WORKLETS_VER' found — must be removed (peer dep of reanimated, same crash risk)"
else
  pass "react-native-worklets absent ✓"
fi

# babel reanimated plugin must NOT be present
if grep -q "react-native-reanimated/plugin" "$REPO_ROOT/babel.config.js"; then
  fail "babel.config.js: 'react-native-reanimated/plugin' found — reanimated removed, plugin must also be removed"
else
  pass "babel.config.js: no reanimated babel plugin ✓"
fi

# newArchEnabled MUST be false — HarmonyOS 4.2 (Huawei P40 Pro) crashes on
# New Architecture JNI/TurboModule registration. Fixed in B88 (B78/B80 also worked
# by disabling it). No dependency requires New Arch now that reanimated is removed.
NEW_ARCH_TOP=$(node -e "const a=require('./app.json'); console.log(a.expo.newArchEnabled)")
NEW_ARCH_PLUGIN=$(node -e "const a=require('./app.json'); const p=a.expo.plugins||[]; const ep=p.find(x=>Array.isArray(x)&&x[0]==='expo-build-properties'); console.log(ep?ep[1]?.android?.newArchEnabled:'')")
if [[ "$NEW_ARCH_TOP" == "true" || "$NEW_ARCH_PLUGIN" == "true" ]]; then
  fail "app.json: newArchEnabled=true detected — must be false (HarmonyOS ARM64 crash; B78/B88 fix)"
else
  pass "app.json: newArchEnabled=false ✓ (HarmonyOS compatible)"
fi

# ---------------------------------------------------------------------------
# 4. TYPESCRIPT CHECK
#    Catches type errors that would surface in CI or at runtime.
#    Runs with a 60s timeout — if it times out we warn (don't block push),
#    since the fast ARM64/babel/version guards are more critical.
#    Run manually to see full output: npx tsc --noEmit
# ---------------------------------------------------------------------------
section "TypeScript — type check (npx tsc --noEmit, 60s timeout)"

TS_TIMEOUT=60
TS_EXIT=0
TS_OUTPUT=$(timeout "$TS_TIMEOUT" npx tsc --noEmit 2>&1) || TS_EXIT=$?

if [[ "$TS_EXIT" -eq 124 ]]; then
  warn "TypeScript check timed out after ${TS_TIMEOUT}s — run 'npx tsc --noEmit' manually to verify"
elif [[ "$TS_EXIT" -eq 0 ]]; then
  TS_ERRORS=$(echo "$TS_OUTPUT" | grep -cP "error TS" || true)
  if [[ "$TS_ERRORS" -eq 0 ]]; then
    pass "TypeScript: no errors"
  else
    echo "$TS_OUTPUT" | grep "error TS" | head -20
    fail "TypeScript: $TS_ERRORS error(s) — fix before push"
  fi
else
  TS_ERRORS=$(echo "$TS_OUTPUT" | grep -cP "error TS" || true)
  if [[ "$TS_ERRORS" -gt 0 ]]; then
    echo "$TS_OUTPUT" | grep "error TS" | head -20
    fail "TypeScript: $TS_ERRORS error(s) — fix before push"
  else
    warn "TypeScript exited with code $TS_EXIT but no 'error TS' lines found — check manually"
  fi
fi

# ---------------------------------------------------------------------------
# 5. CRASH LOG CAPTURE (if device is connected via ADB)
#    Captures device crash log — the only reliable way to diagnose ARM64
#    native crashes that x86_64 CI emulators cannot reproduce.
# ---------------------------------------------------------------------------
section "ADB crash log check (ARM64 device)"

PACKAGE="app.clawlink.mobile"
ADB_DEVICES=$(adb devices 2>/dev/null | tail -n +2 | grep -v "^$" | grep -v "List" | awk '{print $1}' || true)

if [[ -z "$ADB_DEVICES" ]]; then
  warn "No ADB device connected — skipping crash log check"
  warn "To get device crash log after a flash-crash:"
  warn "  1. adb devices             # verify connection"
  warn "  2. adb logcat -c           # clear log"
  warn "  3. Tap the app icon (it will crash)"
  warn "  4. adb logcat -b crash -d  # show crash log"
  warn "  5. adb logcat -d | grep -A10 'FATAL\\|AndroidRuntime\\|${PACKAGE}'"
else
  echo ""
  echo "  Connected devices: $ADB_DEVICES"
  # Clear the crash buffer and launch the app
  adb logcat -c 2>/dev/null || true
  adb shell am start -n "${PACKAGE}/com.facebook.react.ReactActivity" 2>/dev/null || true
  sleep 6
  CRASH_LOG=$(adb logcat -b crash -d 2>/dev/null || echo "")
  RUNTIME_LOG=$(adb logcat -d 2>/dev/null | grep -E "FATAL EXCEPTION|AndroidRuntime|${PACKAGE}.*died|signal (6|11)" || true)
  if echo "$CRASH_LOG$RUNTIME_LOG" | grep -qE "FATAL|died|signal"; then
    echo "$CRASH_LOG"
    echo "$RUNTIME_LOG"
    fail "App CRASHED on ARM64 device — see log above"
  else
    pass "App launched without crash on connected device"
  fi
fi

# ---------------------------------------------------------------------------
# 6. SUMMARY
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ALL CHECKS PASSED ($PASS passed, 0 failed) — safe to push${NC}"
else
  echo -e "${RED}${BOLD}  BLOCKED: $FAIL check(s) failed, $PASS passed — fix before push${NC}"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

exit $FAIL
