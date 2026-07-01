#!/usr/bin/env bash
set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$ROOT" ]]; then
  echo "Not inside a git repository."
  exit 1
fi
cd "$ROOT" || exit 1

CONFIG=".ai/supervisor-config.md"
TASK=".ai/current-task.md"
PLAN=".ai/stage-plan.md"
FINAL=".ai/final-report.md"

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

if [[ ! -f "$TASK" ]]; then
  echo "Missing .ai/current-task.md"
  exit 1
fi

if grep -q "Опиши итоговую цель задачи" "$TASK"; then
  {
    echo "# FINAL_VERDICT"
    echo "NEEDS_MANUAL_ATTENTION"
    echo
    echo "# COMPLETED_STAGES"
    echo "None."
    echo
    echo "# FAILED_OR_RISKY_ITEMS"
    echo "- .ai/current-task.md is still a template."
    echo
    echo "# WHAT_TO_COMMIT"
    echo "Nothing."
    echo
    echo "# NEXT_STEP"
    echo "Fill .ai/current-task.md with a real task before running autonomous development."
  } > "$FINAL"
  cat "$FINAL"
  exit 0
fi

MAX_STAGE_REPAIR_CYCLES="$(read_config MAX_STAGE_REPAIR_CYCLES 3)"
MAX_TOTAL_REPAIR_CYCLES="$(read_config MAX_TOTAL_REPAIR_CYCLES 8)"
STOP_IF_SAME_ERROR_REPEATS="$(read_config STOP_IF_SAME_ERROR_REPEATS 2)"

mapfile -t stages < <(grep -n "^### Stage" "$TASK" | cut -d: -f1)
if [[ "${#stages[@]}" -eq 0 ]]; then
  echo "No stages found in .ai/current-task.md"
  exit 1
fi

if [[ ! -s "$PLAN" ]]; then
  PLAN_PROMPT="Create a concise stage plan from this task. Return only stage titles and acceptance summary.

$(cat "$TASK")"
  if ! run_codex "$PLAN_PROMPT" > "$PLAN" 2>/dev/null; then
    {
      echo "# Stage Plan"
      grep "^### Stage" "$TASK"
    } > "$PLAN"
  fi
fi

extract_stage() {
  local start_line="$1"
  local next_line="$2"
  if [[ -n "$next_line" ]]; then
    sed -n "${start_line},$((next_line - 1))p" "$TASK"
  else
    sed -n "${start_line},\$p" "$TASK"
  fi
}

total_repairs=0
completed=()
last_error=""
same_error_count=0

for idx in "${!stages[@]}"; do
  start="${stages[$idx]}"
  next=""
  if [[ "$idx" -lt $((${#stages[@]} - 1)) ]]; then
    next="${stages[$((idx + 1))]}"
  fi

  extract_stage "$start" "$next" > .ai/current-stage.md
  stage_title="$(head -n 1 .ai/current-stage.md)"
  echo "Running $stage_title"

  scripts/ai-run-stage.sh

  stage_repairs=0
  while true; do
    scripts/ai-supervisor-check.sh
    check_code=$?

    if [[ "$check_code" -eq 0 ]] && grep -A1 "^# VERDICT" .ai/supervisor-report.md | grep -q "OK"; then
      completed+=("$stage_title")
      break
    fi

    current_error="$(grep -A8 "^# PROBLEMS" .ai/supervisor-report.md 2>/dev/null | tr -d '\r' | head -n 8)"
    if [[ "$current_error" == "$last_error" ]]; then
      same_error_count=$((same_error_count + 1))
    else
      same_error_count=1
      last_error="$current_error"
    fi

    if [[ "$same_error_count" -ge "$STOP_IF_SAME_ERROR_REPEATS" ]]; then
      echo "Stopping: same error repeated $same_error_count times."
      break 2
    fi

    if [[ "$stage_repairs" -ge "$MAX_STAGE_REPAIR_CYCLES" || "$total_repairs" -ge "$MAX_TOTAL_REPAIR_CYCLES" ]]; then
      echo "Stopping: repair limit reached."
      break 2
    fi

    scripts/ai-repair-stage.sh
    stage_repairs=$((stage_repairs + 1))
    total_repairs=$((total_repairs + 1))
  done
done

FINAL_CHECK=true scripts/check-project.sh >/dev/null 2>&1 || true

{
  echo "# FINAL_VERDICT"
  if [[ "${#completed[@]}" -eq "${#stages[@]}" ]] && grep -q "CHECK_STATUS=OK" .ai/check-result.md; then
    echo "OK"
  else
    echo "NEEDS_MANUAL_ATTENTION"
  fi
  echo
  echo "# COMPLETED_STAGES"
  if [[ "${#completed[@]}" -eq 0 ]]; then
    echo "None."
  else
    printf -- "- %s\n" "${completed[@]}"
  fi
  echo
  echo "# FAILED_OR_RISKY_ITEMS"
  if [[ "${#completed[@]}" -eq "${#stages[@]}" ]]; then
    echo "None detected by stage loop."
  else
    echo "- Stage loop stopped before all stages completed."
  fi
  echo
  echo "# WHAT_TO_COMMIT"
  echo "Review git diff and commit only after manual approval."
  echo
  echo "# NEXT_STEP"
  echo "Inspect .ai/supervisor-report.md, .ai/check-result.md, and .ai/smoke-result.md."
} > "$FINAL"

cat "$FINAL"
