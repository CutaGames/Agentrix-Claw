#!/usr/bin/env bash
# Smoke test ClawCore MQTT topics from a developer machine.
# Requires mosquitto-clients. Usage:
#   DEVICE_ID=esp32:aabb DST=<dst> ./client_test.sh
set -euo pipefail
HOST="${HOST:-api.agentrix.top}"
PORT="${PORT:-8883}"
DEVICE_ID="${DEVICE_ID:?DEVICE_ID required}"
DST="${DST:?DST required (raw token from pair response)}"

echo "==> Subscribing to down + ota for $DEVICE_ID ..."
mosquitto_sub --capath /etc/ssl/certs/ \
  -h "$HOST" -p "$PORT" \
  -i "$DEVICE_ID" -u "$DEVICE_ID" -P "$DST" \
  -t "agentrix/devices/$DEVICE_ID/down" \
  -t "agentrix/devices/$DEVICE_ID/ota" \
  -v &
SUB_PID=$!
trap "kill $SUB_PID 2>/dev/null || true" EXIT

sleep 1
echo "==> Publishing dummy uplink frame ..."
mosquitto_pub --capath /etc/ssl/certs/ \
  -h "$HOST" -p "$PORT" \
  -i "$DEVICE_ID" -u "$DEVICE_ID" -P "$DST" \
  -t "agentrix/devices/$DEVICE_ID/up" \
  -m '{"type":"interaction","kind":"button_press","ts":0}'

sleep 2
echo "==> Done. Check backend logs for receipt."
