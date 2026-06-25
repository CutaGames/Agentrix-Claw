#!/bin/bash
# Test Bedrock vision capability across Claude models
# Run on production: AWS_BEARER_TOKEN_BEDROCK is set in env

set -e
cd /home/ubuntu/Agentrix/backend
# Source .env if it exists
[ -f .env ] && export $(grep -v '^#' .env | xargs -d '\n' 2>/dev/null || true)

REGION="${AWS_REGION:-us-east-1}"
TOKEN="$AWS_BEARER_TOKEN_BEDROCK"

if [ -z "$TOKEN" ]; then
  echo "❌ AWS_BEARER_TOKEN_BEDROCK not set"
  exit 1
fi

# Tiny 1×1 red PNG (base64) for vision test
TINY_RED_PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

test_model() {
  local NAME="$1"
  local MODEL_ID="$2"
  local TEST_TYPE="$3"  # "text" or "vision"

  echo ""
  echo "═══ $NAME ($MODEL_ID) — $TEST_TYPE ═══"

  if [ "$TEST_TYPE" = "vision" ]; then
    BODY=$(cat <<EOF
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 100,
  "messages": [{
    "role": "user",
    "content": [
      {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "$TINY_RED_PNG"}},
      {"type": "text", "text": "What color is this 1x1 image? Reply in one word."}
    ]
  }]
}
EOF
)
  else
    BODY='{"anthropic_version":"bedrock-2023-05-31","max_tokens":50,"messages":[{"role":"user","content":"Reply with the word PONG"}]}'
  fi

  RESP=$(curl -s -w "\n__HTTP_CODE__:%{http_code}" \
    -X POST "https://bedrock-runtime.$REGION.amazonaws.com/model/$MODEL_ID/invoke" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$BODY")

  CODE=$(echo "$RESP" | grep "__HTTP_CODE__" | cut -d: -f2)
  BODY_OUT=$(echo "$RESP" | grep -v "__HTTP_CODE__")

  if [ "$CODE" = "200" ]; then
    TEXT=$(echo "$BODY_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('content',[{}])[0].get('text','(empty)')[:200])" 2>/dev/null || echo "(parse failed)")
    echo "  ✅ HTTP $CODE — Response: $TEXT"
  else
    ERR=$(echo "$BODY_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','(no message)')[:300])" 2>/dev/null || echo "$BODY_OUT" | head -c 300)
    echo "  ❌ HTTP $CODE — Error: $ERR"
  fi
}

# Test 1: Haiku 4.5 text
test_model "Haiku 4.5" "anthropic.claude-haiku-4-5-20251001-v1:0" "text"

# Test 2: Haiku 4.5 vision (this is what we need!)
test_model "Haiku 4.5" "anthropic.claude-haiku-4-5-20251001-v1:0" "vision"

# Test 3: Sonnet 4 vision (US inference profile)
test_model "Sonnet 4" "us.anthropic.claude-sonnet-4-20250514-v1:0" "vision"

# Test 4: Claude 3.5 Sonnet vision (older but known good)
test_model "Claude 3.5 Sonnet" "anthropic.claude-3-5-sonnet-20241022-v2:0" "vision"

echo ""
echo "═══ Done ═══"
