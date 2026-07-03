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

SOURCE=".ai/current-stage.md"
FINAL=".ai/final-report.md"

mkdir -p .ai

write_final_failure() {
  local reason="$1"
  local next_action="$2"
  {
    echo "FINAL_VERDICT: NEEDS_MANUAL_ATTENTION"
    echo "COMPLETED_STAGES:"
    echo "- none"
    echo "FAILED_STAGE: current-stage generation/validation"
    echo "REASON: $reason"
    echo "AI_REPAIR_SKIPPED: true"
    echo "TOKEN_SAVING_REASON: generation/validation failed before implementation"
    echo "NEXT_ACTION: $next_action"
    echo "FILES_CHANGED:"
    git diff --name-only | sed 's/^/- /'
    echo "HOW_TO_VERIFY:"
    echo "- ./scripts/ai-generate-current-task.sh"
    echo "- ./scripts/ai-validate-generated-task.sh"
  } > "$FINAL"
}

if [[ ! -f "$SOURCE" ]]; then
  write_final_failure "Missing .ai/current-stage.md" "Create .ai/current-stage.md and rerun ./scripts/ai-run-current-stage.sh"
  cat "$FINAL"
  exit 1
fi

if [[ ! -s "$SOURCE" ]]; then
  write_final_failure ".ai/current-stage.md is empty" "Fill .ai/current-stage.md and rerun ./scripts/ai-run-current-stage.sh"
  cat "$FINAL"
  exit 1
fi

SOURCE_STAGE_CONTENT="$(cat "$SOURCE")"
restore_source_stage() {
  printf '%s\n' "$SOURCE_STAGE_CONTENT" > "$SOURCE"
}
trap restore_source_stage EXIT

scripts/ai-generate-current-task.sh
generate_code=$?
if [[ "$generate_code" -ne 0 ]]; then
  write_final_failure "current-task generation failed" "Inspect .ai/task-generation-report.md"
  cat "$FINAL"
  exit "$generate_code"
fi

scripts/ai-validate-generated-task.sh
validate_code=$?
if [[ "$validate_code" -ne 0 ]]; then
  write_final_failure "generated current-task validation failed" "Inspect .ai/task-validation-report.md. Do not run ai-run-task.sh until validation is OK."
  cat "$FINAL"
  exit "$validate_code"
fi

if ! grep -q "^VERDICT: OK" .ai/task-validation-report.md 2>/dev/null; then
  write_final_failure "generated current-task validation did not return OK" "Inspect .ai/task-validation-report.md"
  cat "$FINAL"
  exit 1
fi

scripts/ai-run-task.sh
exit_code=$?
restore_source_stage
trap - EXIT
exit "$exit_code"
