#!/bin/bash
# Test Bedrock vision capability with US inference profiles
set -e
cd /home/ubuntu/Agentrix/backend
[ -f .env ] && export $(grep -v '^#' .env | xargs -d '\n' 2>/dev/null || true)

REGION="${AWS_REGION:-us-east-1}"
TOKEN="$AWS_BEARER_TOKEN_BEDROCK"

if [ -z "$TOKEN" ]; then
  echo "❌ AWS_BEARER_TOKEN_BEDROCK not set"
  exit 1
fi

TINY_RED_PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

test_model() {
  local NAME="$1"
  local MODEL_ID="$2"

  echo ""
  echo "═══ $NAME ($MODEL_ID) ═══"

  BODY=$(cat <<EOF
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 100,
  "messages": [{
    "role": "user",
    "content": [
      {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "$TINY_RED_PNG"}},
      {"type": "text", "text": "What color is this image? Reply with one word."}
    ]
  }]
}
EOF
)

  START=$(date +%s%3N)
  RESP=$(curl -s -w "\n__HTTP_CODE__:%{http_code}" \
    -X POST "https://bedrock-runtime.$REGION.amazonaws.com/model/$MODEL_ID/invoke" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$BODY")
  END=$(date +%s%3N)
  LATENCY=$((END - START))

  CODE=$(echo "$RESP" | grep "__HTTP_CODE__" | cut -d: -f2)
  BODY_OUT=$(echo "$RESP" | grep -v "__HTTP_CODE__")

  if [ "$CODE" = "200" ]; then
    TEXT=$(echo "$BODY_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('content',[{}])[0].get('text','(empty)')[:200])" 2>/dev/null || echo "(parse failed)")
    USAGE=$(echo "$BODY_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); u=d.get('usage',{}); print(f\"in={u.get('input_tokens',0)} out={u.get('output_tokens',0)}\")" 2>/dev/null || echo "")
    echo "  ✅ HTTP $CODE — Response: $TEXT"
    echo "  📊 Tokens: $USAGE | Latency: ${LATENCY}ms"
  else
    ERR=$(echo "$BODY_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','(no message)')[:300])" 2>/dev/null || echo "$BODY_OUT" | head -c 300)
    echo "  ❌ HTTP $CODE — Error: $ERR"
  fi
}

# Try US inference profiles for all Anthropic models
test_model "Haiku 4.5 (US profile)" "us.anthropic.claude-haiku-4-5-20251001-v1:0"
test_model "Sonnet 4 (US profile)" "us.anthropic.claude-sonnet-4-20250514-v1:0"
test_model "Opus 4.1 (US profile)" "us.anthropic.claude-opus-4-1-20250805-v1:0"
test_model "Haiku 3.5 legacy (US profile)" "us.anthropic.claude-3-5-haiku-20241022-v1:0"

# Test APAC profile if available
test_model "Sonnet 4 (APAC)" "apac.anthropic.claude-sonnet-4-20250514-v1:0"

echo ""
echo "═══ Done ═══"
