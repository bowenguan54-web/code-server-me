param(
  [string]$HostAddress = "127.0.0.1",
  [int]$Port = 8000,
  [switch]$NoReload
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

Write-Host "Starting AlgoLib backend at $HostAddress`:$Port"
if ($NoReload) {
  python -m uvicorn algo_service.main:app --host $HostAddress --port $Port
} else {
  Write-Host "Reload watches only algo_service/ so saving algorithm files will not restart uvicorn."
  python -m uvicorn algo_service.main:app --host $HostAddress --port $Port --reload --reload-dir algo_service
}
