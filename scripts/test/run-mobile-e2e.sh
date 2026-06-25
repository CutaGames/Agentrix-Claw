#!/usr/bin/env bash
# Mobile E2E runner — per docs §9.
#
# Requirements:
#   - Maestro CLI installed (https://maestro.mobile.dev)
#   - A connected Android device OR booted emulator  (`adb devices`)
#   - APK installed (agentrix.claw) or running via `expo start`
#
# Usage:
#   bash scripts/test/run-mobile-e2e.sh         # run all .maestro flows
#   bash scripts/test/run-mobile-e2e.sh 10-     # run flows matching "10-"
#   bash scripts/test/run-mobile-e2e.sh --tags  # only smoke-level
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MAESTRO_DIR="$REPO_ROOT/.maestro"
REPORT_DIR="$REPO_ROOT/tests/reports/mobile-e2e-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$REPORT_DIR"

FILTER="${1:-}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro CLI not found. Install: curl -Ls https://get.maestro.mobile.dev | bash"
  exit 2
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found."
  exit 2
fi

DEVICES=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')
if [ -z "$DEVICES" ]; then
  echo "No Android device attached (adb devices returned nothing useful)."
  exit 2
fi

echo "Devices: $DEVICES"
echo "Maestro flows under: $MAESTRO_DIR"
echo "Report: $REPORT_DIR"

shopt -s nullglob
pass=0
fail=0
failures=()

for flow in "$MAESTRO_DIR"/*.yaml; do
  name=$(basename "$flow")
  if [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]]; then
    continue
  fi
  echo
  echo "=== Running $name ==="
  if maestro test "$flow" --format=junit --output="$REPORT_DIR/$name.xml" 2>&1 | tee "$REPORT_DIR/$name.log"; then
    pass=$((pass+1))
  else
    fail=$((fail+1))
    failures+=("$name")
  fi
done

echo
echo "────── Mobile E2E summary ──────"
echo "Passed: $pass"
echo "Failed: $fail"
if [ ${#failures[@]} -gt 0 ]; then
  echo
  echo "Failed flows:"
  for f in "${failures[@]}"; do
    echo "  ✗ $f  (log: $REPORT_DIR/$f.log)"
  done
fi

exit $fail
