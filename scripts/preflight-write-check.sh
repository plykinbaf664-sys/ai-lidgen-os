#!/usr/bin/env bash
set -u

export LANG=C.UTF-8
export LC_ALL=C.UTF-8
if command -v chcp.com >/dev/null 2>&1; then
  chcp.com 65001 >/dev/null 2>&1 || true
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1

STAGE_FILE=".ai/current-stage.md"
REPORT=".ai/supervisor-report.md"
FINAL=".ai/final-report.md"
WRITE_TEST=".ai/write-test.tmp"

mkdir -p .ai

write_permission_report() {
  local verdict="$1"
  local issue="$2"
  local next_action="$3"

  {
    echo "VERDICT: $verdict"
    echo "STAGE: $(head -n 1 "$STAGE_FILE" 2>/dev/null || echo unknown)"
    echo "CHECKS: not_run"
    echo "SMOKE: not_run"
    echo "QUALITY_CHECK: not_run"
    echo "PERMISSION_CHECK: FAIL"
    echo "CHANGED_FILES: not_checked"
    echo "ISSUES:"
    echo "- $issue"
    echo "NEXT_ACTION: $next_action"
  } > "$REPORT"

  {
    echo "FINAL_VERDICT: NEEDS_MANUAL_PERMISSION_FIX"
    echo "COMPLETED_STAGES: see previous report"
    echo "FAILED_STAGE: $(head -n 1 "$STAGE_FILE" 2>/dev/null || echo unknown)"
    echo "REASON: $issue"
    echo "AI_REPAIR_SKIPPED: true"
    echo "TOKEN_SAVING_REASON: permission error detected before repair loop"
    echo "NEXT_ACTION: $next_action"
    echo "FILES_CHANGED: none by this preflight"
    echo "HOW_TO_VERIFY: rerun ./scripts/preflight-write-check.sh"
  } > "$FINAL"
}

if [[ ! -s "$STAGE_FILE" ]]; then
  write_permission_report "FAILED" "Missing .ai/current-stage.md" "Create or extract a current stage before running implementation."
  exit 1
fi

if ! (printf 'write-test\n' > "$WRITE_TEST") 2>/dev/null; then
  write_permission_report "STOP_PERMISSION_REQUIRED" "Cannot write .ai/write-test.tmp" "Fix workspace permissions for .ai, then rerun ./scripts/ai-run-task.sh."
  exit 2
fi
rm -f "$WRITE_TEST"

extract_scope() {
  awk '
    /^Scope:/ {capture=1; next}
    capture && /^[A-Za-z][A-Za-z /]+:/ {capture=0}
    capture && /^### / {capture=0}
    capture {print}
  ' "$STAGE_FILE" |
    sed -E 's/^[[:space:]]*-[[:space:]]*//' |
    sed -E 's/[`"]//g' |
    sed -E 's/^[[:space:]]+|[[:space:]]+$//g' |
    grep -Ev '^(|\\.\\.\\.)$' || true
}

normalize_scope_path() {
  local line="$1"
  local token
  token="$(printf '%s\n' "$line" | awk '{print $1}')"
  token="${token%,}"
  token="${token%;}"
  printf '%s' "$token"
}

mapfile -t raw_scope < <(extract_scope)
scope_paths=()
for line in "${raw_scope[@]}"; do
  path="$(normalize_scope_path "$line")"
  [[ -z "$path" ]] && continue
  [[ "$path" == "env" || "$path" == ".env"* || "$path" == "node_modules"* || "$path" == ".next"* ]] && continue
  scope_paths+=("$path")
done

if [[ "${#scope_paths[@]}" -eq 0 ]]; then
  {
    echo "VERDICT: OK"
    echo "STAGE: $(head -n 1 "$STAGE_FILE")"
    echo "PERMISSION_CHECK: OK"
    echo "ISSUES: none"
    echo "NEXT_ACTION: continue"
  } > "$REPORT"
  exit 0
fi

for path in "${scope_paths[@]}"; do
  full="$ROOT/$path"
  if [[ -d "$full" ]]; then
    test_file="$full/.ai-write-test-$$"
    if ! (printf 'write-test\n' > "$test_file") 2>/dev/null; then
      write_permission_report "STOP_PERMISSION_REQUIRED" "Access denied writing to scope directory: $path" "Fix permissions, e.g. on Windows: icacls \"$full\" /grant %USERNAME%:F"
      exit 2
    fi
    rm -f "$test_file"
    continue
  fi

  if [[ -f "$full" ]]; then
    if [[ ! -w "$full" ]]; then
      write_permission_report "STOP_PERMISSION_REQUIRED" "Access denied writing to scope file: $path" "Fix permissions, e.g. on Windows: icacls \"$full\" /grant %USERNAME%:F"
      exit 2
    fi
    continue
  fi

  parent="$(dirname "$full")"
  if [[ ! -d "$parent" || ! -w "$parent" ]]; then
    write_permission_report "STOP_PERMISSION_REQUIRED" "Access denied or missing parent for scope path: $path" "Create the parent directory or fix permissions: $parent"
    exit 2
  fi
done

{
  echo "VERDICT: OK"
  echo "STAGE: $(head -n 1 "$STAGE_FILE")"
  echo "PERMISSION_CHECK: OK"
  echo "CHECKED_SCOPE:"
  printf -- "- %s\n" "${scope_paths[@]}"
  echo "NEXT_ACTION: continue"
} > "$REPORT"

exit 0
