param(
  [string]$WslDistro = "Ubuntu-22.04",
  [string]$SourcePath = "/home/guan/code-server-me",
  [string]$TargetPath = "/mnt/e/code-server-me"
)

$ErrorActionPreference = "Stop"

$syncScript = @'
set -euo pipefail

SOURCE_PATH="$1"
TARGET_PATH="$2"

mkdir -p "$TARGET_PATH"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude '.run/' \
    --exclude 'release/' \
    --exclude 'release-standalone/' \
    --exclude 'release-packages/' \
    --exclude 'coverage/' \
    --exclude '.cache/' \
    --exclude '.DS_Store' \
    "$SOURCE_PATH/" "$TARGET_PATH/"
else
  tar -C "$SOURCE_PATH" \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.run' \
    --exclude='release' \
    --exclude='release-standalone' \
    --exclude='release-packages' \
    --exclude='coverage' \
    --exclude='.cache' \
    -cf - . | tar -C "$TARGET_PATH" -xf -
fi
'@

Write-Host "Syncing $SourcePath -> $TargetPath via WSL distro $WslDistro ..."
wsl -d $WslDistro -- bash -lc "$syncScript" -- "$SourcePath" "$TargetPath"
Write-Host "Sync complete."
