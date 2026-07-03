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
OUT=".ai/repair-result.md"
PROMPT_FILE=".ai/prompts/implement-stage.md"

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
    echo "Codex CLI not found. Set CODEX_CMD or run implementation manually."
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

has_permission_error() {
  grep -Eiq "^(VERDICT: STOP_PERMISSION_REQUIRED|VERDICT: NEEDS_MANUAL_PERMISSION_FIX|PERMISSION_CHECK: FAIL|AI_REPAIR_SKIPPED: true)|((error|fatal|failed).*(EACCES|EPERM|Access denied|Permission denied))" "$@" 2>/dev/null
}

write_permission_final() {
  local reason="$1"
  {
    echo "FINAL_VERDICT: NEEDS_MANUAL_PERMISSION_FIX"
    echo "COMPLETED_STAGES: see .ai/final-report.md from ai-run-task if available"
    echo "FAILED_STAGE: $(head -n 1 .ai/current-stage.md 2>/dev/null || echo unknown)"
    echo "REASON: $reason"
    echo "AI_REPAIR_SKIPPED: true"
    echo "TOKEN_SAVING_REASON: permission error detected before repair loop"
    echo "NEXT_ACTION: fix filesystem permissions for the paths in Scope, then rerun ./scripts/ai-run-task.sh"
    echo "FILES_CHANGED: none by repair"
    echo "HOW_TO_VERIFY: ./scripts/preflight-write-check.sh"
  } > .ai/final-report.md
}

if [[ ! -s .ai/current-stage.md ]]; then
  echo "No current stage found." | tee "$OUT"
  exit 1
fi

mkdir -p .ai

scripts/preflight-write-check.sh
preflight_code=$?
if [[ "$preflight_code" -ne 0 ]]; then
  write_permission_final "Preflight write check failed."
  exit "$preflight_code"
fi

PROJECT_STRUCTURE="$(find app components lib scripts .ai/prompts -maxdepth 2 -type f 2>/dev/null | sort | sed 's#^\./##' | head -n 160)"
SCOPE="$(awk '/^Scope:/ {capture=1; next} capture && /^[A-Za-z][A-Za-z /]+:/ {capture=0} capture && /^### / {capture=0} capture {print}' .ai/current-stage.md)"
ACCEPTANCE="$(awk '/^Acceptance Criteria:/ {capture=1; next} capture && /^[A-Za-z][A-Za-z /]+:/ {capture=0} capture && /^### / {capture=0} capture {print}' .ai/current-stage.md)"

PROMPT="$(cat "$PROMPT_FILE")

# current-stage.md
$(cat .ai/current-stage.md)

# Scope
$SCOPE

# Acceptance Criteria
$ACCEPTANCE

# Project rules summary
- Work only inside this git project.
- Do not touch .env, node_modules, .next.
- Do not commit, push, deploy, or install packages.
- Edit only files allowed by current stage Scope.

# Relevant project structure
$PROJECT_STRUCTURE
"

{
  echo "# Implement Stage Result"
  echo
} > "$OUT"
run_codex "$PROMPT" "$OUT"
impl_code=$?

if has_permission_error "$OUT"; then
  {
    echo "VERDICT: STOP_PERMISSION_REQUIRED"
    echo "STAGE: $(head -n 1 .ai/current-stage.md)"
    echo "CHECKS: not_run"
    echo "SMOKE: not_run"
    echo "QUALITY_CHECK: not_run"
    echo "PERMISSION_CHECK: FAIL"
    echo "CHANGED_FILES: $(git diff --name-only | tr '\n' ' ')"
    echo "ISSUES:"
    echo "- Permission error detected during implementation."
    echo "NEXT_ACTION: fix filesystem permissions, then rerun ./scripts/ai-run-task.sh"
  } > .ai/supervisor-report.md
  write_permission_final "Permission error detected during implementation."
  exit 2
fi

if [[ "$impl_code" -ne 0 ]]; then
  {
    echo "FINAL_VERDICT: NEEDS_MANUAL_ATTENTION"
    echo "COMPLETED_STAGES: see .ai/final-report.md from ai-run-task if available"
    echo "FAILED_STAGE: $(head -n 1 .ai/current-stage.md 2>/dev/null || echo unknown)"
    echo "REASON: Implementation command failed before stage verification."
    echo "AI_REPAIR_SKIPPED: true"
    echo "TOKEN_SAVING_REASON: implementation infrastructure failed"
    echo "NEXT_ACTION: inspect .ai/repair-result.md, fix supervisor infrastructure, then rerun ./scripts/ai-run-task.sh"
    echo "FILES_CHANGED:"
    git diff --name-only | sed 's/^/- /'
    echo "HOW_TO_VERIFY: ./scripts/check-project.sh"
  } > .ai/final-report.md
  exit "$impl_code"
fi

stage_repairs=0
MAX_STAGE_REPAIR_CYCLES="$(read_config MAX_STAGE_REPAIR_CYCLES 3)"

while true; do
  scripts/ai-supervisor-check.sh
  check_code=$?

  if grep -Eiq "^(VERDICT: OK|OK)$" .ai/supervisor-report.md 2>/dev/null || grep -A1 "^# VERDICT" .ai/supervisor-report.md 2>/dev/null | grep -q "OK"; then
    exit 0
  fi

  if has_permission_error .ai/supervisor-report.md .ai/check-result.md .ai/smoke-result.md .ai/dev-server.log; then
    write_permission_final "Permission error detected during checks. Repair skipped."
    exit 2
  fi

  if [[ "$stage_repairs" -ge "$MAX_STAGE_REPAIR_CYCLES" ]]; then
    exit "$check_code"
  fi

  scripts/ai-repair-stage.sh
  repair_code=$?
  if has_permission_error .ai/repair-result.md .ai/supervisor-report.md; then
    write_permission_final "Permission error detected during repair."
    exit 2
  fi
  if [[ "$repair_code" -ne 0 ]]; then
    {
      echo "FINAL_VERDICT: NEEDS_MANUAL_ATTENTION"
      echo "COMPLETED_STAGES: see .ai/final-report.md from ai-run-task if available"
      echo "FAILED_STAGE: $(head -n 1 .ai/current-stage.md 2>/dev/null || echo unknown)"
      echo "REASON: Repair command failed before stage verification."
      echo "AI_REPAIR_SKIPPED: false"
      echo "TOKEN_SAVING_REASON: repair infrastructure failed or Codex returned non-zero"
      echo "NEXT_ACTION: inspect .ai/repair-result.md, fix the reported issue, then rerun ./scripts/ai-run-task.sh"
      echo "FILES_CHANGED:"
      git diff --name-only | sed 's/^/- /'
      echo "HOW_TO_VERIFY: ./scripts/check-project.sh"
    } > .ai/final-report.md
    exit "$repair_code"
  fi

  stage_repairs=$((stage_repairs + 1))
done
