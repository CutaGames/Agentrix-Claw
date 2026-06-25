#!/bin/bash
source /home/ubuntu/.config/agentrix/public-build.env
TOKEN=$PUBLIC_BUILD_REPO_PUSH_TOKEN

echo "=== Recent workflow runs ==="
curl -s \
  -H "Authorization: token ${TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/CutaGames/Agentrix-Claw/actions/runs?per_page=5" \
  | jq -r '.workflow_runs[] | "\(.run_number)\t\(.status)\t\(.conclusion)\t\(.head_branch)\t\(.html_url)"'

echo ""
echo "=== Latest run artifacts ==="
LATEST_RUN_ID=$(curl -s \
  -H "Authorization: token ${TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/CutaGames/Agentrix-Claw/actions/runs?per_page=1" \
  | jq -r '.workflow_runs[0].id')

echo "Latest run ID: $LATEST_RUN_ID"

curl -s \
  -H "Authorization: token ${TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/CutaGames/Agentrix-Claw/actions/runs/${LATEST_RUN_ID}/artifacts" \
  | jq -r '.artifacts[] | "\(.name)\tsize=\(.size_in_bytes)\texpired=\(.expired)\tid=\(.id)\turl=\(.archive_download_url)"'
