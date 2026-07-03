#!/usr/bin/env bash
set -u

export LANG=C.UTF-8
export LC_ALL=C.UTF-8
if command -v chcp.com >/dev/null 2>&1; then
  chcp.com 65001 >/dev/null 2>&1 || true
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
cd "$ROOT" || exit 1

OUT=".ai/repair-result.md"

mkdir -p .ai

has_permission_error() {
  grep -Eiq "^(VERDICT: STOP_PERMISSION_REQUIRED|VERDICT: NEEDS_MANUAL_PERMISSION_FIX|PERMISSION_CHECK: FAIL|AI_REPAIR_SKIPPED: true)|((error|fatal|failed).*(EACCES|EPERM|Access denied|Permission denied))" "$@" 2>/dev/null
}

if grep -Eiq "^(VERDICT: OK|OK)$" .ai/supervisor-report.md 2>/dev/null; then
  {
    echo "VERDICT: OK"
    echo "Repair skipped: supervisor verdict is OK."
  } > "$OUT"
  exit 0
fi

if has_permission_error .ai/supervisor-report.md .ai/check-result.md .ai/smoke-result.md .ai/dev-server.log; then
  {
    echo "VERDICT: STOP_PERMISSION_REQUIRED"
    echo "AI_REPAIR_SKIPPED: true"
    echo "TOKEN_SAVING_REASON: permission error detected before repair prompt"
    echo "NEXT_ACTION: fix filesystem permissions for files in current stage Scope"
  } > "$OUT"
  exit 2
fi

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
    echo "Codex CLI not found. Set CODEX_CMD or repair manually."
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

extract_scope_paths() {
  awk '
    /^Scope:/ {capture=1; next}
    capture && /^[A-Za-z][A-Za-z /]+:/ {capture=0}
    capture && /^### / {capture=0}
    capture {print}
  ' .ai/current-stage.md |
    sed -E 's/^[[:space:]]*-[[:space:]]*//' |
    sed -E 's/[`"]//g' |
    awk '{print $1}' |
    grep -Ev '^(|\\.\\.\\.)$' || true
}

mapfile -t scope_paths < <(extract_scope_paths)
if [[ "${#scope_paths[@]}" -gt 0 ]]; then
  SCOPED_DIFF="$(git diff -- "${scope_paths[@]}" 2>/dev/null | head -n 260 || true)"
else
  SCOPED_DIFF="$(git diff -- . 2>/dev/null | head -n 260 || true)"
fi

SUPERVISOR_SUMMARY="$(
  awk '
    /^VERDICT:/ {capture=1}
    capture {print}
  ' .ai/supervisor-report.md 2>/dev/null | tail -n 120
)"

PROMPT="$(cat .ai/prompts/repair-stage.md)

# current-stage.md
$(cat .ai/current-stage.md)

# supervisor-report summary
$SUPERVISOR_SUMMARY

# scoped git diff excerpt
$SCOPED_DIFF

# check-result tail
$(tail -n 140 .ai/check-result.md 2>/dev/null || true)

# smoke-result tail
$(tail -n 140 .ai/smoke-result.md 2>/dev/null || true)

# dev-server.log tail
$(tail -n 140 .ai/dev-server.log 2>/dev/null || true)
"

{
  echo "# Repair Result"
  echo
} > "$OUT"
run_codex "$PROMPT" "$OUT"
code=$?

if has_permission_error "$OUT"; then
  {
    echo "VERDICT: STOP_PERMISSION_REQUIRED"
    echo "AI_REPAIR_SKIPPED: true"
    echo "TOKEN_SAVING_REASON: permission error detected during repair"
    echo "NEXT_ACTION: fix filesystem permissions for files in current stage Scope"
  } >> "$OUT"
  exit 2
fi

exit "$code"
