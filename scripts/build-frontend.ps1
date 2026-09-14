# Build SPA into Laravel public/ before git push (Namecheap has no Node).
# Usage (PowerShell): .\scripts\build-frontend.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root "frontend")

if (-not (Test-Path "node_modules")) {
  npm install
}

npm run build
Write-Host "Built into backend/public — commit index.html + assets/ then push."
