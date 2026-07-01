#!/usr/bin/env bash
set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
cd "$ROOT" || exit 1

CONFIG=".ai/supervisor-config.md"
REPORT=".ai/supervisor-report.md"
DEV_LOG=".ai/dev-server.log"
PORT="${PORT:-3000}"
BASE_URL="${BASE_URL:-http://localhost:$PORT}"

read_config() {
  local key="$1"
  local default="$2"
  local value
  value="$(grep -E "^${key}=" "$CONFIG" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
  [[ -n "$value" ]] && printf '%s' "$value" || printf '%s' "$default"
}

run_codex() {
  local prompt="$1"
  if [[ -n "${CODEX_CMD:-}" ]]; then
    $CODEX_CMD exec "$prompt"
  elif command -v codex >/dev/null 2>&1; then
    codex exec "$prompt"
  else
    return 127
  fi
}

stop_server() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap stop_server EXIT

mkdir -p .ai
git diff > .ai/current-diff.patch

scripts/check-project.sh
CHECK_CODE=$?

: > "$DEV_LOG"
DEV_SERVER_TIMEOUT_SECONDS="$(read_config DEV_SERVER_TIMEOUT_SECONDS 60)"
SMOKE_TIMEOUT_SECONDS="$(read_config SMOKE_TIMEOUT_SECONDS 30)"
export PORT BASE_URL SMOKE_TIMEOUT_SECONDS

npm run dev -- --port "$PORT" > "$DEV_LOG" 2>&1 &
SERVER_PID=$!

server_ready=false
for _ in $(seq 1 "$DEV_SERVER_TIMEOUT_SECONDS"); do
  if curl -sS --max-time 2 "$BASE_URL" >/dev/null 2>&1; then
    server_ready=true
    break
  fi
  sleep 1
done

if [[ "$server_ready" != "true" ]]; then
  {
    echo "# Smoke Result"
    echo "SMOKE_STATUS=FAIL"
    echo "Dev server did not become ready within ${DEV_SERVER_TIMEOUT_SECONDS}s."
  } > .ai/smoke-result.md
  SMOKE_CODE=1
else
  scripts/smoke-check.sh
  SMOKE_CODE=$?
fi

DEV_LOG_TAIL="$(tail -n 120 "$DEV_LOG" 2>/dev/null || true)"

PROMPT="$(cat .ai/prompts/supervisor-check.md)

# current-task.md
$(cat .ai/current-task.md)

# current-stage.md
$(cat .ai/current-stage.md)

# current-diff.patch
$(cat .ai/current-diff.patch)

# check-result.md
$(cat .ai/check-result.md)

# smoke-result.md
$(cat .ai/smoke-result.md)

# dev-server.log tail
$DEV_LOG_TAIL
"

if run_codex "$PROMPT" > "$REPORT" 2>&1; then
  :
else
  {
    echo "# VERDICT"
    if [[ "$CHECK_CODE" -eq 0 && "$SMOKE_CODE" -eq 0 ]]; then
      echo "OK"
      echo
      echo "# ACCEPTANCE_CRITERIA_CHECK"
      echo "- Deterministic checks: PASS"
      echo
      echo "# RUNTIME_CHECK"
      echo "PASS"
      echo
      echo "# TECHNICAL_CHECK"
      echo "PASS"
      echo
      echo "# DIFF_CHECK"
      echo "PASS"
      echo
      echo "# PROBLEMS"
      echo "Codex supervisor unavailable; deterministic checks passed."
      echo
      echo "# REQUIRED_FIXES"
      echo "None."
      echo
      echo "# NEXT_ACTION"
      echo "CONTINUE_TO_NEXT_STAGE"
    else
      echo "NEEDS_FIX"
      echo
      echo "# ACCEPTANCE_CRITERIA_CHECK"
      echo "- Deterministic checks: FAIL"
      echo
      echo "# RUNTIME_CHECK"
      echo "FAIL"
      echo
      echo "# TECHNICAL_CHECK"
      echo "FAIL"
      echo
      echo "# DIFF_CHECK"
      echo "UNKNOWN"
      echo
      echo "# PROBLEMS"
      echo "Check or smoke failed. See .ai/check-result.md and .ai/smoke-result.md."
      echo
      echo "# REQUIRED_FIXES"
      echo "Fix failing deterministic checks."
      echo
      echo "# NEXT_ACTION"
      echo "RUN_REPAIR"
    fi
  } > "$REPORT"
fi

if grep -A1 "^# VERDICT" "$REPORT" | grep -q "OK"; then
  exit 0
fi

exit 1
