#!/bin/bash
# Test Haiku 4.5 vision with a real-world image
set -e
cd /home/ubuntu/Agentrix/backend
[ -f .env ] && export $(grep -v '^#' .env | xargs -d '\n' 2>/dev/null || true)

REGION="${AWS_REGION:-us-east-1}"
TOKEN="$AWS_BEARER_TOKEN_BEDROCK"

# Generate a 64x64 solid red PNG using Python
python3 << 'PYEOF' > /tmp/red-square.b64
import base64, struct, zlib

def make_png(width, height, rgb):
    def chunk(tag, data):
        length = struct.pack('>I', len(data))
        crc = struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
        return length + tag + data + crc

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    raw = b''
    for y in range(height):
        raw += b'\x00' + bytes(rgb) * width
    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

png = make_png(64, 64, [220, 30, 30])  # solid red
print(base64.b64encode(png).decode())
PYEOF

RED_PNG=$(cat /tmp/red-square.b64)
echo "Generated red square: $(echo $RED_PNG | wc -c) chars base64"

BODY=$(cat <<EOF
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 200,
  "messages": [{
    "role": "user",
    "content": [
      {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "$RED_PNG"}},
      {"type": "text", "text": "Describe this image in 2-3 sentences. What is the main color and shape?"}
    ]
  }]
}
EOF
)

echo ""
echo "═══ Haiku 4.5 vision test on 64×64 red square ═══"

RESP=$(curl -s -w "\n__HTTP_CODE__:%{http_code}" \
  -X POST "https://bedrock-runtime.$REGION.amazonaws.com/model/us.anthropic.claude-haiku-4-5-20251001-v1:0/invoke" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$BODY")

CODE=$(echo "$RESP" | grep "__HTTP_CODE__" | cut -d: -f2)
BODY_OUT=$(echo "$RESP" | grep -v "__HTTP_CODE__")

if [ "$CODE" = "200" ]; then
  TEXT=$(echo "$BODY_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('content',[{}])[0].get('text','(empty)'))")
  USAGE=$(echo "$BODY_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); u=d.get('usage',{}); print(f\"in={u.get('input_tokens',0)} out={u.get('output_tokens',0)}\")")
  echo "✅ HTTP 200"
  echo "Response: $TEXT"
  echo "Tokens: $USAGE"
else
  echo "❌ HTTP $CODE"
  echo "$BODY_OUT" | head -c 500
fi

rm -f /tmp/red-square.b64
