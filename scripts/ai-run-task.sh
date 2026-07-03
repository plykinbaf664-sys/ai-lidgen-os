#!/usr/bin/env bash
set -u

export LANG=C.UTF-8
export LC_ALL=C.UTF-8
if command -v chcp.com >/dev/null 2>&1; then
  chcp.com 65001 >/dev/null 2>&1 || true
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$ROOT" ]]; then
  echo "Not inside a git repository."
  exit 1
fi
cd "$ROOT" || exit 1

TASK=".ai/current-task.md"
FINAL=".ai/final-report.md"
STAGE=".ai/current-stage.md"

mkdir -p .ai

write_final() {
  local verdict="$1"
  local failed_stage="$2"
  local reason="$3"
  local repair_skipped="$4"
  local token_reason="$5"
  local next_action="$6"
  shift 6
  local completed=("$@")

  {
    echo "FINAL_VERDICT: $verdict"
    echo "COMPLETED_STAGES:"
    if [[ "${#completed[@]}" -eq 0 ]]; then
      echo "- none"
    else
      printf -- "- %s\n" "${completed[@]}"
    fi
    echo "FAILED_STAGE: ${failed_stage:-none}"
    echo "REASON: ${reason:-none}"
    echo "AI_REPAIR_SKIPPED: $repair_skipped"
    echo "TOKEN_SAVING_REASON: ${token_reason:-none}"
    echo "NEXT_ACTION: ${next_action:-none}"
    echo "FILES_CHANGED:"
    git diff --name-only | sed 's/^/- /'
    echo "HOW_TO_VERIFY:"
    echo "- ./scripts/check-project.sh"
    echo "- ./scripts/smoke-check.sh"
    echo "- ./scripts/stage-quality-check.sh"
  } > "$FINAL"
}

if [[ ! -f "$TASK" ]]; then
  write_final "NEEDS_MANUAL_ATTENTION" "none" "Missing .ai/current-task.md" "true" "task file missing" "Create .ai/current-task.md" 
  cat "$FINAL"
  exit 1
fi

mapfile -t stage_lines < <(grep -nE "^### Stage[[:space:]]+[0-9]+" "$TASK" | cut -d: -f1)
if [[ "${#stage_lines[@]}" -eq 0 ]]; then
  write_final "NEEDS_MANUAL_ATTENTION" "none" "No stages found in .ai/current-task.md" "true" "no stage loop possible" "Add headings like ### Stage 1 Name"
  cat "$FINAL"
  exit 1
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

completed=()

for idx in "${!stage_lines[@]}"; do
  start="${stage_lines[$idx]}"
  next=""
  if [[ "$idx" -lt $((${#stage_lines[@]} - 1)) ]]; then
    next="${stage_lines[$((idx + 1))]}"
  fi

  extract_stage "$start" "$next" > "$STAGE"
  stage_title="$(head -n 1 "$STAGE" | tr -d '\r')"
  echo "Running $stage_title"

  scripts/ai-run-stage.sh
  code=$?

  if [[ "$code" -eq 0 ]]; then
    completed+=("$stage_title")
    continue
  fi

  if grep -Eiq "^(VERDICT: STOP_PERMISSION_REQUIRED|VERDICT: NEEDS_MANUAL_PERMISSION_FIX|PERMISSION_CHECK: FAIL|AI_REPAIR_SKIPPED: true)|((error|fatal|failed).*(EACCES|EPERM|Access denied|Permission denied))" .ai/supervisor-report.md .ai/repair-result.md 2>/dev/null; then
    write_final \
      "NEEDS_MANUAL_PERMISSION_FIX" \
      "$stage_title" \
      "Permission error detected before or during repair." \
      "true" \
      "permission error detected before repair loop" \
      "Fix filesystem permissions for files in current stage Scope, then rerun ./scripts/ai-run-task.sh" \
      "${completed[@]}"
    cat "$FINAL"
    exit 2
  fi

  write_final \
    "NEEDS_MANUAL_ATTENTION" \
    "$stage_title" \
    "Stage failed. See .ai/supervisor-report.md, .ai/check-result.md, and .ai/smoke-result.md." \
    "false" \
    "stage failed after bounded implementation/repair loop" \
    "Inspect reports and rerun ./scripts/ai-run-task.sh after fixing issues." \
    "${completed[@]}"
  cat "$FINAL"
  exit "$code"
done

FINAL_CHECK=true scripts/check-project.sh >/dev/null 2>&1
final_check_code=$?

if [[ "$final_check_code" -eq 0 ]]; then
  write_final "OK" "none" "none" "false" "none" "Ready for manual review/commit." "${completed[@]}"
else
  write_final "NEEDS_MANUAL_ATTENTION" "final_check" "Final project check failed." "false" "final deterministic check failed" "Inspect .ai/check-result.md." "${completed[@]}"
fi

cat "$FINAL"
exit "$final_check_code"
