#!/bin/bash
# Test bridge probe endpoint
BASE="https://agentrix.top"

TOKEN=$(curl -sk -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"e2e_runner@agentrix.top","password":"Test123456!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

echo "Token len: ${#TOKEN}"

# Test bridge probe with localhost:9999 (should get 400/timeout quickly)
echo ""
echo "=== Bridge probe (invalid URL - expects fast failure) ==="
RESULT=$(curl -sk -X POST "$BASE/api/openclaw/bridge/probe" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"url":"http://127.0.0.1:9999"}' \
  -m 8 -w "\nHTTP:%{http_code}")
echo "$RESULT"

# Test bridge probe with missing URL (expects 400)
echo ""
echo "=== Bridge probe (missing URL - expects 400) ==="
RESULT=$(curl -sk -X POST "$BASE/api/openclaw/bridge/probe" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' \
  -m 5 -w "\nHTTP:%{http_code}")
echo "$RESULT"
