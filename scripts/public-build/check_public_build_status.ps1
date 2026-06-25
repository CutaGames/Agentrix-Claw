param(
    [string]$RunId,
    [string]$Branch = "build142-phase0-hardening",
    [string]$Repo = "CutaGames/Agentrix-Claw",
    [string]$ServerHost = "ubuntu@47.130.176.148",
    [string]$KeyPath = "C:\Users\15279\Desktop\hq.pem",
    [string]$ServerTokenPath = "/home/ubuntu/.config/agentrix/public-build.env"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $KeyPath)) {
    throw "SSH key not found: $KeyPath"
}

$remoteScript = @'
set -euo pipefail
source "__SERVER_TOKEN_PATH__"

if [ -z "${PUBLIC_BUILD_REPO_PUSH_TOKEN:-}" ]; then
  echo "Missing PUBLIC_BUILD_REPO_PUSH_TOKEN in __SERVER_TOKEN_PATH__" >&2
  exit 1
fi

REPO="__REPO__"
BRANCH="__BRANCH__"
RUN_ID="__RUN_ID__"
API="https://api.github.com/repos/${REPO}"
AUTH_HEADER="Authorization: Bearer ${PUBLIC_BUILD_REPO_PUSH_TOKEN}"
UA="Agentrix-Public-Build-Checker"

fetch() {
  curl -fsS -H "$AUTH_HEADER" -H "Accept: application/vnd.github+json" -H "User-Agent: $UA" "$1"
}

if [ -z "$RUN_ID" ]; then
  fetch "${API}/actions/runs?branch=${BRANCH}&per_page=10" > /tmp/agentrix-public-runs.json
  RUN_ID=$(jq -r '[.workflow_runs[] | select(.name == "Build → Test → Release APK")][0].id // .workflow_runs[0].id // empty' /tmp/agentrix-public-runs.json)
fi

if [ -z "$RUN_ID" ]; then
  echo "No public build run found for branch ${BRANCH}" >&2
  exit 1
fi

fetch "${API}/actions/runs/${RUN_ID}" > /tmp/agentrix-public-run.json
fetch "${API}/actions/runs/${RUN_ID}/jobs?per_page=100" > /tmp/agentrix-public-jobs.json
fetch "${API}/actions/runs/${RUN_ID}/artifacts" > /tmp/agentrix-public-artifacts.json

echo "=== run ==="
jq -r '{id, name, status, conclusion, head_branch, head_sha, html_url, created_at, updated_at}' /tmp/agentrix-public-run.json

echo "=== jobs ==="
jq -r '.jobs[] | {id, name, html_url, status, conclusion, started_at, completed_at, active_step: ([.steps[]? | select(.status == "in_progress") | .name][0] // null), failed_steps: [.steps[]? | select(.conclusion == "failure") | .name]}' /tmp/agentrix-public-jobs.json

echo "=== artifacts ==="
jq -r '.artifacts[]? | {name, size_in_bytes, expired, archive_download_url}' /tmp/agentrix-public-artifacts.json

echo "=== public apk downloads ==="
for url in "https://agentrix.top/downloads/clawlink-agent.apk" "https://agentrix.top/downloads/ClawLink-latest.apk"; do
  header_file="/tmp/agentrix-apk-headers.$$"
  code=$(curl -sSL -I -o "$header_file" -w '%{http_code}' "$url" || echo 000)
  length=$(awk -F': ' 'tolower($1)=="content-length" {value=$2} END {gsub(/\r/, "", value); print value}' "$header_file")
  modified=$(awk -F': ' 'tolower($1)=="last-modified" {value=$2} END {gsub(/\r/, "", value); print value}' "$header_file")
  type=$(awk -F': ' 'tolower($1)=="content-type" {value=$2} END {gsub(/\r/, "", value); print value}' "$header_file")
  rm -f "$header_file"
  printf '%s\tstatus=%s\tsize=%s\tlast_modified=%s\tcontent_type=%s\n' "$url" "$code" "${length:-unknown}" "${modified:-unknown}" "${type:-unknown}"
done
'@

$remoteScript = $remoteScript.Replace("__SERVER_TOKEN_PATH__", $ServerTokenPath)
$remoteScript = $remoteScript.Replace("__REPO__", $Repo)
$remoteScript = $remoteScript.Replace("__BRANCH__", $Branch)
$remoteScript = $remoteScript.Replace("__RUN_ID__", $RunId)
$remoteScript = $remoteScript -replace "`r`n", "`n"

$encodedScript = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
ssh -o StrictHostKeyChecking=no -i $KeyPath $ServerHost "echo $encodedScript | base64 -d | bash"

if ($LASTEXITCODE -ne 0) {
    throw "Public build status check failed."
}