#!/bin/bash
# Smoke test World Engine routes on production
BASE=http://localhost:3000

ROUTES=(
  "/api/health"
  "/api/v1/world-engine/enabled"
  "/api/v1/world-engine/quota/status"
  "/api/v1/world-engine/assets"
  "/api/v1/marketplace/world-assets"
  "/api/admin/world-engine/cost-summary"
  "/api/admin/world-engine/go-live-dashboard"
)

echo "═══ World Engine Route Smoke Test ═══"
echo "Base: $BASE"
echo ""

PASS=0
FAIL=0

for route in "${ROUTES[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${route}")
  # Expect 200 (public) or 401 (auth required) — both mean route exists
  if [[ "$code" == "200" || "$code" == "401" || "$code" == "403" ]]; then
    echo "  ✅ ${code} ${route}"
    PASS=$((PASS+1))
  else
    echo "  ❌ ${code} ${route} (expected 200/401/403)"
    FAIL=$((FAIL+1))
  fi
done

echo ""
echo "Total: $((PASS+FAIL)) | Passed: $PASS | Failed: $FAIL"

if [[ $FAIL -eq 0 ]]; then
  echo "✅ All routes registered."
  exit 0
else
  echo "❌ Some routes missing."
  exit 1
fi
