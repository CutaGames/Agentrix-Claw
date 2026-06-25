#!/bin/bash
set -euo pipefail

BASE=http://localhost:3000/api
PASS=0
FAIL=0

check() {
  local name="$1" condition="$2"
  if eval "$condition"; then
    echo "  ✅ $name"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name"
    FAIL=$((FAIL+1))
  fi
}

echo '=== Step 1: Get auth token ==='
USERID=$(PGPASSWORD=agentrix_secure_2024 psql -U agentrix -d paymind -h localhost -t -c "SELECT id FROM users LIMIT 1;" | tr -d ' \n')
echo "User ID: $USERID"

cd /home/ubuntu/Agentrix/backend
TOKEN=$(node -e "
  require('dotenv').config();
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET || 'agentrix-secret';
  const token = jwt.sign({sub: '$USERID', type: 'user'}, secret, {expiresIn: '1h'});
  process.stdout.write(token);
")
echo "Token: ${TOKEN:0:40}..."
check "Got auth token" '[ -n "$TOKEN" ]'

AUTH="Authorization: Bearer $TOKEN"

# ── Step 2: Get catalog ──
echo ''
echo '=== Step 2: GET /ai-providers/catalog ==='
CATALOG=$(curl -sf "$BASE/ai-providers/catalog" -H "$AUTH")
PCOUNT=$(echo "$CATALOG" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)
echo "  Provider count: $PCOUNT"
echo "$CATALOG" | python3 -c 'import sys,json;[print("  ",p["icon"],p["id"],"-",len(p["models"]),"models") for p in json.load(sys.stdin)]' 2>/dev/null || true
check "Catalog returns 14 providers" '[ "$PCOUNT" = "14" ]'

# ── Step 3: Get user configs (should be empty) ──
echo ''
echo '=== Step 3: GET /ai-providers/configs (expect empty) ==='
CONFIGS=$(curl -sf "$BASE/ai-providers/configs" -H "$AUTH")
CCOUNT=$(echo "$CONFIGS" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo -1)
echo "  Config count: $CCOUNT"
check "Initial configs empty" '[ "$CCOUNT" = "0" ]'

# ── Step 4: Save a config ──
echo ''
echo '=== Step 4: POST /ai-providers/configs (save anthropic) ==='
SAVE_RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/ai-providers/configs" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"providerId":"anthropic","apiKey":"sk-ant-test-12345","selectedModel":"claude-haiku-4-5"}')
SAVE_CODE=$(echo "$SAVE_RESP" | tail -1)
SAVE_BODY=$(echo "$SAVE_RESP" | sed '$d')
echo "  HTTP: $SAVE_CODE"
echo "  Body: $(echo "$SAVE_BODY" | head -c 200)"
check "Save returns 200/201" '[ "$SAVE_CODE" = "200" ] || [ "$SAVE_CODE" = "201" ]'

# ── Step 5: Verify saved config ──
echo ''
echo '=== Step 5: GET /ai-providers/configs (verify saved) ==='
CONFIGS2=$(curl -sf "$BASE/ai-providers/configs" -H "$AUTH")
CCOUNT2=$(echo "$CONFIGS2" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)
HAS_ANTH=$(echo "$CONFIGS2" | python3 -c 'import sys,json; print("yes" if any(c["providerId"]=="anthropic" for c in json.load(sys.stdin)) else "no")' 2>/dev/null || echo no)
IS_DEFAULT=$(echo "$CONFIGS2" | python3 -c 'import sys,json; print("yes" if any(c.get("isDefault") for c in json.load(sys.stdin)) else "no")' 2>/dev/null || echo no)
echo "  Config count: $CCOUNT2, has anthropic: $HAS_ANTH, isDefault: $IS_DEFAULT"
check "1 config saved" '[ "$CCOUNT2" = "1" ]'
check "Anthropic config exists" '[ "$HAS_ANTH" = "yes" ]'
check "First config auto-set as default" '[ "$IS_DEFAULT" = "yes" ]'

# ── Step 6: Upsert (update model) ──
echo ''
echo '=== Step 6: POST /ai-providers/configs (upsert: change model) ==='
UPD_RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/ai-providers/configs" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"providerId":"anthropic","apiKey":"sk-ant-test-12345","selectedModel":"claude-sonnet-4-6"}')
UPD_CODE=$(echo "$UPD_RESP" | tail -1)
UPD_BODY=$(echo "$UPD_RESP" | sed '$d')
NEW_MODEL=$(echo "$UPD_BODY" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("selectedModel","?"))' 2>/dev/null || echo '?')
echo "  HTTP: $UPD_CODE, new model: $NEW_MODEL"
check "Upsert returns 200/201" '[ "$UPD_CODE" = "200" ] || [ "$UPD_CODE" = "201" ]'
check "Model updated to claude-sonnet-4-6" '[ "$NEW_MODEL" = "claude-sonnet-4-6" ]'

# Verify still 1 config (upsert, not duplicate)
CCOUNT3=$(curl -sf "$BASE/ai-providers/configs" -H "$AUTH" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)
check "Still 1 config (upsert not duplicate)" '[ "$CCOUNT3" = "1" ]'

# ── Step 7: Test connectivity (fake key → expect graceful failure) ──
echo ''
echo '=== Step 7: POST /ai-providers/test (fake key, expect failure) ==='
TEST_RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/ai-providers/test" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"providerId":"anthropic","apiKey":"sk-ant-test-12345","model":"claude-haiku-4-5"}')
TEST_CODE=$(echo "$TEST_RESP" | tail -1)
TEST_BODY=$(echo "$TEST_RESP" | sed '$d')
TEST_OK=$(echo "$TEST_BODY" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("success","?"))' 2>/dev/null || echo '?')
echo "  HTTP: $TEST_CODE, success: $TEST_OK"
echo "  Body: $(echo "$TEST_BODY" | head -c 200)"
check "Test endpoint responds" '[ "$TEST_CODE" = "200" ] || [ "$TEST_CODE" = "201" ]'
check "Test reports failure (fake key)" '[ "$TEST_OK" = "False" ]'

# ── Step 8: Save second provider ──
echo ''
echo '=== Step 8: Save second provider (openai) ==='
curl -sf -X POST "$BASE/ai-providers/configs" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"providerId":"openai","apiKey":"sk-proj-fake","selectedModel":"gpt-5-mini"}' > /dev/null
CCOUNT4=$(curl -sf "$BASE/ai-providers/configs" -H "$AUTH" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)
echo "  Config count: $CCOUNT4"
check "2 configs after adding openai" '[ "$CCOUNT4" = "2" ]'

# ── Step 8b: Set openai as default ──
echo ''
echo '=== Step 8b: POST /ai-providers/default (set openai as default) ==='
DEF_RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/ai-providers/default" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"providerId":"openai"}')
DEF_CODE=$(echo "$DEF_RESP" | tail -1)
echo "  HTTP: $DEF_CODE"
check "Set default returns 200/201" '[ "$DEF_CODE" = "200" ] || [ "$DEF_CODE" = "201" ]'

# Verify openai is now default
OAI_DEFAULT=$(curl -sf "$BASE/ai-providers/configs" -H "$AUTH" | python3 -c 'import sys,json; cs=json.load(sys.stdin); print("yes" if any(c["providerId"]=="openai" and c.get("isDefault") for c in cs) else "no")' 2>/dev/null || echo no)
check "OpenAI is now default" '[ "$OAI_DEFAULT" = "yes" ]'

# ── Step 9: Delete deepseek ──
echo ''
echo '=== Step 9: DELETE /ai-providers/configs/anthropic ==='
DEL_RESP=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE/ai-providers/configs/anthropic" -H "$AUTH")
DEL_CODE=$(echo "$DEL_RESP" | tail -1)
echo "  HTTP: $DEL_CODE"
check "Delete returns 200" '[ "$DEL_CODE" = "200" ]'

# ── Step 10: Verify only openai remains ──
echo ''
echo '=== Step 10: Verify only openai remains ==='
CONFIGS5=$(curl -sf "$BASE/ai-providers/configs" -H "$AUTH")
CCOUNT5=$(echo "$CONFIGS5" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)
HAS_OAI=$(echo "$CONFIGS5" | python3 -c 'import sys,json; print("yes" if any(c["providerId"]=="openai" for c in json.load(sys.stdin)) else "no")' 2>/dev/null || echo no)
echo "  Remaining: $CCOUNT5, has openai: $HAS_OAI"
check "1 config remaining" '[ "$CCOUNT5" = "1" ]'
check "OpenAI config remains" '[ "$HAS_OAI" = "yes" ]'

# ── Step 11: Cleanup ──
echo ''
echo '=== Step 11: Cleanup ==='
curl -sf -X DELETE "$BASE/ai-providers/configs/openai" -H "$AUTH" > /dev/null
CFINAL=$(curl -sf "$BASE/ai-providers/configs" -H "$AUTH" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo -1)
echo "  Final config count: $CFINAL"
check "Cleanup complete (0 configs)" '[ "$CFINAL" = "0" ]'

# ── Summary ──
echo ''
echo '=========================================='
echo "  PASSED: $PASS  FAILED: $FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo '  ALL E2E TESTS PASSED ✅'
else
  echo '  SOME TESTS FAILED ❌'
fi
echo '=========================================='
exit $FAIL
