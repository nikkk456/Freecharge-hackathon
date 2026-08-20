# ============================================================================
# dev.ps1 — start the whole dev stack in one command:  .\dev.ps1
#
# Starts: Docker infra (Postgres + Redis + MinIO), the FastAPI API, and the
# React app. The API and web each open in their own PowerShell window so you can
# see their logs and stop them with Ctrl+C independently.
# ============================================================================
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "[1/3] Starting infra (Postgres, Redis, MinIO)..." -ForegroundColor Cyan
docker compose up -d db redis minio minio-init

Write-Host "[2/3] Launching API -> http://localhost:8000 (docs at /docs)" -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root\apps\api'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
)

Write-Host "[3/3] Launching web -> http://localhost:3000" -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root\apps\web'; npm run dev"
)

Write-Host ""
Write-Host "All started." -ForegroundColor Green
Write-Host "  App:      http://localhost:3000"
Write-Host "  API docs: http://localhost:8000/docs"
Write-Host "  MinIO:    http://localhost:9001  (minioadmin / minioadmin)"
Write-Host ""
Write-Host "To stop: close the two windows (Ctrl+C), then 'docker compose stop' for infra."
