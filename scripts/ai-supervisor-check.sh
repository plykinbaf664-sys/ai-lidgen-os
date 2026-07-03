#!/usr/bin/env bash
set -u

export LANG=C.UTF-8
export LC_ALL=C.UTF-8
if command -v chcp.com >/dev/null 2>&1; then
  chcp.com 65001 >/dev/null 2>&1 || true
fi

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
  local output_file="$2"
  local prompt_file=".ai/codex-prompt-$$.tmp"
  local trace_file=".ai/codex-trace-$$.tmp"
  printf '%s' "$prompt" > "$prompt_file"
  if [[ -n "${CODEX_CMD:-}" ]]; then
    $CODEX_CMD exec --output-last-message "$output_file" - < "$prompt_file" > "$trace_file" 2>&1
  elif command -v codex >/dev/null 2>&1; then
    codex exec --output-last-message "$output_file" - < "$prompt_file" > "$trace_file" 2>&1
  else
    rm -f "$prompt_file"
    rm -f "$trace_file"
    return 127
  fi
  local code=$?
  rm -f "$prompt_file"
  if [[ "$code" -ne 0 && -s "$trace_file" ]]; then
    cat "$trace_file" > "$output_file"
  fi
  rm -f "$trace_file"
  return "$code"
}

stop_server() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap stop_server EXIT

has_permission_error() {
  grep -Eiq "^(VERDICT: STOP_PERMISSION_REQUIRED|VERDICT: NEEDS_MANUAL_PERMISSION_FIX|PERMISSION_CHECK: FAIL|AI_REPAIR_SKIPPED: true)|((error|fatal|failed).*(EACCES|EPERM|Access denied|Permission denied))" "$@" 2>/dev/null
}

write_report() {
  local verdict="$1"
  local checks="$2"
  local smoke="$3"
  local quality="$4"
  local permission="$5"
  local issues="$6"
  local next_action="$7"

  {
    echo "VERDICT: $verdict"
    echo "STAGE: $(head -n 1 .ai/current-stage.md 2>/dev/null || echo unknown)"
    echo "CHECKS: $checks"
    echo "SMOKE: $smoke"
    echo "QUALITY_CHECK: $quality"
    echo "PERMISSION_CHECK: $permission"
    echo "CHANGED_FILES:"
    git diff --name-only | sed 's/^/- /'
    echo "ISSUES:"
    echo "$issues"
    echo "NEXT_ACTION: $next_action"
  } > "$REPORT"
}

mkdir -p .ai
git diff > .ai/current-diff.patch

scripts/check-project.sh
CHECK_CODE=$?
if has_permission_error .ai/check-result.md; then
  write_report "STOP_PERMISSION_REQUIRED" "not_run" "not_run" "not_run" "FAIL" "- Permission error in check-project." "Fix filesystem permissions; AI repair skipped."
  exit 2
fi

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

scripts/stage-quality-check.sh
QUALITY_CODE=$?

if has_permission_error .ai/smoke-result.md "$DEV_LOG" .ai/check-result.md; then
  write_report "STOP_PERMISSION_REQUIRED" "FAIL" "FAIL" "FAIL" "FAIL" "- Permission error detected during smoke/dev/quality checks." "Fix filesystem permissions; AI repair skipped."
  exit 2
fi

CHECK_STATUS=$([[ "$CHECK_CODE" -eq 0 ]] && echo "PASS" || echo "FAIL")
SMOKE_STATUS=$([[ "$SMOKE_CODE" -eq 0 ]] && echo "PASS" || echo "FAIL")
QUALITY_STATUS=$([[ "$QUALITY_CODE" -eq 0 ]] && echo "PASS" || echo "FAIL")

extract_scope_paths() {
  awk '
    /^#### Scope$/ || /^Scope:/ {capture=1; next}
    capture && /^#### / {capture=0}
    capture && /^[A-Za-z][A-Za-z /]+:/ {capture=0}
    capture && /^### / {capture=0}
    capture {print}
  ' .ai/current-stage.md |
    grep -Eo '`[^`]+`|[A-Za-z0-9_./-]+/[A-Za-z0-9_./-]+|[A-Za-z0-9_.-]+\.(ts|tsx|js|jsx|md|sql|json|sh)' |
    sed -E 's/^`|`$//g' |
    sort -u || true
}

mapfile -t scope_paths < <(extract_scope_paths)
DEV_LOG_TAIL="$(tail -n 80 "$DEV_LOG" 2>/dev/null || true)"
if [[ "${#scope_paths[@]}" -gt 0 ]]; then
  DIFF_HEAD="$(git diff -- "${scope_paths[@]}" 2>/dev/null | head -n 260 || true)"
else
  DIFF_HEAD="$(git diff -- . ':(exclude).ai/current-diff.patch' 2>/dev/null | head -n 260 || true)"
fi
CHECK_TAIL="$(tail -n 140 .ai/check-result.md 2>/dev/null || true)"
SMOKE_TAIL="$(tail -n 140 .ai/smoke-result.md 2>/dev/null || true)"

PROMPT="$(cat .ai/prompts/supervisor-check.md)

# current-stage.md
$(cat .ai/current-stage.md)

# git diff excerpt
$DIFF_HEAD

# check-result tail
$CHECK_TAIL

# smoke-result tail
$SMOKE_TAIL

# dev-server.log tail
$DEV_LOG_TAIL
"

if run_codex "$PROMPT" "$REPORT"; then
  :
else
  if [[ "$CHECK_CODE" -eq 0 && "$SMOKE_CODE" -eq 0 && "$QUALITY_CODE" -eq 0 ]]; then
    write_report "OK" "$CHECK_STATUS" "$SMOKE_STATUS" "$QUALITY_STATUS" "OK" "- Codex supervisor unavailable; deterministic checks passed." "CONTINUE_TO_NEXT_STAGE"
  else
    write_report "NEEDS_FIX" "$CHECK_STATUS" "$SMOKE_STATUS" "$QUALITY_STATUS" "OK" "- Deterministic checks failed. See .ai/check-result.md and .ai/smoke-result.md." "RUN_REPAIR"
  fi
fi

if grep -Eiq "^(VERDICT: OK|OK)$" "$REPORT" || grep -A1 "^# VERDICT" "$REPORT" 2>/dev/null | grep -q "OK"; then
  exit 0
fi

exit 1
