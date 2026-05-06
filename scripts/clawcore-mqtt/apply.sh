#!/usr/bin/env bash
# Apply EMQX config to a remote host.
# Usage: ./apply.sh ubuntu@host [--dry-run]
set -euo pipefail

TARGET="${1:?Usage: $0 user@host [--dry-run]}"
DRY="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> Uploading EMQX config to $TARGET ..."
scp -i "${SSH_KEY:-$HOME/.ssh/id_ed25519}" \
    "$HERE/emqx.conf" "$HERE/acl.conf" \
    "$TARGET":/tmp/clawcore-mqtt/

if [[ "$DRY" == "--dry-run" ]]; then
  echo "==> Dry-run; not reloading EMQX."
  exit 0
fi

echo "==> Installing config + reloading EMQX ..."
ssh -i "${SSH_KEY:-$HOME/.ssh/id_ed25519}" "$TARGET" bash -s <<'REMOTE'
set -euo pipefail
sudo install -o emqx -g emqx -m 0640 /tmp/clawcore-mqtt/emqx.conf /etc/emqx/emqx.conf
sudo install -o emqx -g emqx -m 0640 /tmp/clawcore-mqtt/acl.conf  /etc/emqx/acl.conf
sudo emqx ctl conf reload || sudo systemctl restart emqx
sudo systemctl status emqx --no-pager | head -5
REMOTE

echo "==> Done."
