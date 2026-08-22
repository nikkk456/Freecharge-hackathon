# ============================================================================
# dev.ps1 — start the whole dev stack in one command:  .\dev.ps1
#
# Starts: Docker infra (Postgres + Redis + MinIO), the FastAPI API, the ARQ
# worker, and the React app. Each opens in its own PowerShell window so you can
# see its logs and stop it with Ctrl+C independently.
#
# The worker is what does OCR on scanned PDFs (and, from Stage 2, the AI
# analysis). Without it a scanned upload sits at PARSING — the API falls back to
# running OCR inline, but that is slower and holds the request open.
# ============================================================================
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "[1/4] Starting infra (Postgres, Redis, MinIO)..." -ForegroundColor Cyan
docker compose up -d db redis minio minio-init

Write-Host "[2/4] Launching API -> http://localhost:8000 (docs at /docs)" -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root\apps\api'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
)

Write-Host "[3/4] Launching ARQ worker (OCR + AI jobs)" -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root\apps\api'; .\.venv\Scripts\Activate.ps1; arq app.worker.settings.WorkerSettings"
)

Write-Host "[4/4] Launching web -> http://localhost:3000" -ForegroundColor Cyan
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
Write-Host "To stop: close the three windows (Ctrl+C), then 'docker compose stop' for infra."
