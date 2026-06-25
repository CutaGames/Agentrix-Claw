param(
    [string]$ServerHost = "ubuntu@18.139.157.116",
    [string]$ServerTokenPath = "/home/ubuntu/.config/agentrix/public-build.env",
    [string]$KeyPath = "C:\Users\15279\Desktop\hq.pem"
)

$ErrorActionPreference = "Stop"

function Get-GitHubTokenFromGitCredentialManager {
    $inputData = "protocol=https`nhost=github.com`n`n"
    $credsText = $inputData | git credential fill
    if (-not $credsText) {
        throw "Unable to read GitHub credentials from git credential manager."
    }

    $passwordLine = ($credsText -split "`n" | Where-Object { $_ -like 'password=*' } | Select-Object -First 1)
    if (-not $passwordLine) {
        throw "GitHub credential helper returned no password/token."
    }

    return $passwordLine.Substring(9).Trim()
}

if (-not (Test-Path $KeyPath)) {
    throw "SSH key not found: $KeyPath"
}

$token = Get-GitHubTokenFromGitCredentialManager
$escapedToken = $token.Replace("'", "'\''")
$serverTokenDir = [System.IO.Path]::GetDirectoryName($ServerTokenPath).Replace("\", "/")

$remoteScript = @'
set -euo pipefail
mkdir -p "__SERVER_TOKEN_DIR__"
cat > "__SERVER_TOKEN_PATH__" <<'EOF'
PUBLIC_BUILD_REPO_PUSH_TOKEN='__PUBLIC_BUILD_REPO_PUSH_TOKEN__'
EOF
chmod 600 "__SERVER_TOKEN_PATH__"
source "__SERVER_TOKEN_PATH__"
git ls-remote --heads "https://x-access-token:${PUBLIC_BUILD_REPO_PUSH_TOKEN}@github.com/CutaGames/Agentrix-Claw.git" main >/dev/null
echo SERVER_PUBLIC_BUILD_TOKEN_READY
'@

$remoteScript = $remoteScript.Replace("__SERVER_TOKEN_DIR__", $serverTokenDir)
$remoteScript = $remoteScript.Replace("__SERVER_TOKEN_PATH__", $ServerTokenPath)
$remoteScript = $remoteScript.Replace("__PUBLIC_BUILD_REPO_PUSH_TOKEN__", $escapedToken)
$remoteScript = $remoteScript -replace "`r`n", "`n"

$remoteScript | ssh -o StrictHostKeyChecking=no -i $KeyPath $ServerHost bash -s