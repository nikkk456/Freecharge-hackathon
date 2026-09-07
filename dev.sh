#!/usr/bin/env bash
# ============================================================================
# dev.sh — start the whole dev stack in one command:  ./dev.sh
#
# macOS / Linux counterpart of dev.ps1.
#
# Starts: Docker infra (Postgres + Redis + MinIO), the FastAPI API, the ARQ
# worker, and the React app.
#
#   ./dev.sh            each process in its own Terminal window (like dev.ps1)
#   ./dev.sh --inline    all three in THIS terminal, prefixed logs, Ctrl+C stops all
#   ./dev.sh --infra     Docker only, then exit
#
# The worker is what does OCR on scanned PDFs and the AI analysis. Without it a
# scanned upload sits at PARSING and an analysis sits at ANALYZING — the API
# falls back to inline OCR only when Redis itself is unreachable, not when the
# worker is merely absent.
# ============================================================================
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
api="$root/apps/api"
web="$root/apps/web"

mode="windows"
case "${1:-}" in
  --inline) mode="inline" ;;
  --infra)  mode="infra" ;;
  "")       ;;
  *) echo "usage: ./dev.sh [--inline|--infra]" >&2; exit 2 ;;
esac

die() { printf '\n\033[31m%s\033[0m\n' "$1" >&2; exit 1; }
step() { printf '\033[36m%s\033[0m\n' "$1"; }

# ---- Preflight: fail with a cause and a next action, never a bare stack trace ----
command -v docker >/dev/null || die "Docker is not installed. Install Docker Desktop (or: brew install --cask docker)."
docker info >/dev/null 2>&1  || die "Docker is installed but not running. Start Docker Desktop and re-run ./dev.sh"
[ -f "$root/.env" ]          || die "No .env at the repo root. Run:  cp .env.example .env  then paste your GEMINI_API_KEY into it."
[ -x "$api/.venv/bin/python" ] || die "No Python venv at apps/api/.venv. Run:
  cd apps/api && python3 -m venv .venv && source .venv/bin/activate && pip install -e \".[dev]\""
[ -d "$web/node_modules" ]   || die "Frontend deps not installed. Run:  cd apps/web && npm install"

# ---- 1. Infra -------------------------------------------------------------
step "[1/4] Starting infra (Postgres, Redis, MinIO)..."
docker compose -f "$root/docker-compose.yml" up -d db redis minio minio-init

# Wait for Postgres to report healthy, so the API does not start into a refused
# connection on a cold machine (first boot initialises the data directory).
printf 'waiting for postgres'
for _ in $(seq 1 60); do
  state="$(docker inspect -f '{{.State.Health.Status}}' cac-db 2>/dev/null || echo starting)"
  [ "$state" = "healthy" ] && break
  printf '.'; sleep 1
done
printf ' %s\n' "${state:-unknown}"
[ "${state:-}" = "healthy" ] || die "Postgres did not become healthy. Check: docker compose logs db"

if [ "$mode" = "infra" ]; then
  echo "Infra up. DB :5432 · Redis :6379 · MinIO :9000 (console :9001)"
  exit 0
fi

api_cmd="cd '$api' && source .venv/bin/activate && uvicorn app.main:app --reload"
worker_cmd="cd '$api' && source .venv/bin/activate && arq app.worker.settings.WorkerSettings"
web_cmd="cd '$web' && npm run dev"

# ---- 2. Separate windows (default) ---------------------------------------
open_window() {
  if [ "${TERM_PROGRAM:-}" = "iTerm.app" ]; then
    osascript >/dev/null <<OSA
tell application "iTerm"
  create window with default profile
  tell current session of current window to write text "$1"
end tell
OSA
  else
    osascript >/dev/null <<OSA
tell application "Terminal"
  do script "$1"
  activate
end tell
OSA
  fi
}

if [ "$mode" = "windows" ] && [ "$(uname)" = "Darwin" ]; then
  # One cheap probe first: if automation is denied, fall back rather than opening
  # a half-started stack across two mechanisms.
  if osascript -e 'tell application "System Events" to return 1' >/dev/null 2>&1; then
    step "[2/4] Launching API -> http://localhost:8000 (docs at /docs)"
    open_window "$api_cmd"
    step "[3/4] Launching ARQ worker (OCR + AI jobs)"
    open_window "$worker_cmd"
    step "[4/4] Launching web -> http://localhost:3000"
    open_window "$web_cmd"
    cat <<'MSG'

All started.
  App:      http://localhost:3000   (sign in: reviewer@cac.dev / reviewer123)
  API docs: http://localhost:8000/docs
  MinIO:    http://localhost:9001   (minioadmin / minioadmin)

To stop: Ctrl+C in the three windows, then `docker compose stop` for infra.
MSG
    exit 0
  fi
  echo "Terminal automation is unavailable (permission not granted) — running inline instead." >&2
fi

# ---- 3. Inline fallback: one terminal, prefixed logs, Ctrl+C stops all ----
step "[2/4] API    -> http://localhost:8000"
step "[3/4] worker -> ARQ (OCR + AI jobs)"
step "[4/4] web    -> http://localhost:3000"
echo
trap 'echo; echo "Stopping (infra left running; use: docker compose stop)"; kill 0' EXIT INT TERM

# BSD awk, not `sed -u`: macOS's sed has no line-buffering flag and aborts on -u.
esc=$(printf '\033')
prefix() { awk -v tag="$1" -v col="$2" -v e="$esc" '{ printf "%s%s%s%s[0m %s\n", e, col, tag, e, $0; fflush() }'; }

( bash -c "$api_cmd"    2>&1 | prefix "[api]   " "[35m" ) &
( bash -c "$worker_cmd" 2>&1 | prefix "[worker]" "[33m" ) &
( bash -c "$web_cmd"    2>&1 | prefix "[web]   " "[32m" ) &
wait
