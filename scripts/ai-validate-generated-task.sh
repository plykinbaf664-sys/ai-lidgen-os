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
TASK=".ai/current-task.md"
REPORT=".ai/task-validation-report.md"

mkdir -p .ai

failures=()
warnings=()

add_failure() {
  failures+=("$1")
}

extract_source_scope_tokens() {
  awk '
    /^#### Scope$/ {capture=1; next}
    capture && /^#### / {capture=0}
    capture {print}
  ' "$SOURCE" |
    grep -Eo '`[^`]+`|[A-Za-z0-9_./-]+/[A-Za-z0-9_./-]+|[A-Za-z0-9_.-]+\\.(ts|tsx|js|jsx|md|sql|json|sh)' |
    sed -E 's/^`|`$//g' |
    sort -u || true
}

extract_task_scope_tokens() {
  awk '
    /^#### Scope$/ {capture=1; next}
    capture && /^#### / {capture=0}
    capture {print}
  ' "$TASK" |
    grep -Eo '`[^`]+`|[A-Za-z0-9_./-]+/[A-Za-z0-9_./-]+|[A-Za-z0-9_.-]+\\.(ts|tsx|js|jsx|md|sql|json|sh)' |
    sed -E 's/^`|`$//g' |
    sort -u || true
}

contains_required_stage_meaning() {
  local pattern="$1"
  grep -Eiq "$pattern" "$TASK"
}

if [[ ! -s "$SOURCE" ]]; then
  add_failure "Missing or empty .ai/current-stage.md"
fi

if [[ ! -s "$TASK" ]]; then
  add_failure "Missing or empty .ai/current-task.md"
fi

for heading in "# Current Task" "## Goal" "## Business Meaning" "## Global Acceptance Criteria" "## Stages" "## What Must Not Change"; do
  if ! grep -Fxq "$heading" "$TASK" 2>/dev/null; then
    add_failure "Missing heading: $heading"
  fi
done

stage_count="$(grep -Ec "^### Stage[[:space:]]+[0-9]+[[:space:]]+" "$TASK" 2>/dev/null || echo 0)"
if [[ "$stage_count" -ne 5 ]]; then
  add_failure "Expected exactly 5 stages, got $stage_count"
fi

for n in 1 2 3 4 5; do
  if ! grep -Eq "^### Stage[[:space:]]+$n[[:space:]]+" "$TASK" 2>/dev/null; then
    add_failure "Missing Stage $n heading"
  fi
done

extra_stage_headings="$(grep -E "^### " "$TASK" 2>/dev/null | grep -Ev "^### Stage[[:space:]]+[1-5][[:space:]]+" || true)"
if [[ -n "$extra_stage_headings" ]]; then
  add_failure "Found non-stage ### headings inside generated task"
fi

if ! contains_required_stage_meaning "Architecture|Core Contract"; then
  add_failure "Stage plan missing Architecture / Core Contract meaning"
fi
if ! contains_required_stage_meaning "Ranking|Scoring|Confidence"; then
  add_failure "Stage plan missing Ranking / Scoring / Confidence meaning"
fi
if ! contains_required_stage_meaning "Provider|Integration"; then
  add_failure "Stage plan missing Provider / Integration Layer meaning"
fi
if ! contains_required_stage_meaning "Pipeline|UI"; then
  add_failure "Stage plan missing Pipeline + UI Integration meaning"
fi
if ! contains_required_stage_meaning "Quality|Audit|Diagnostics"; then
  add_failure "Stage plan missing Quality Audit / Diagnostics meaning"
fi

mapfile -t source_scope < <(extract_source_scope_tokens)
mapfile -t task_scope < <(extract_task_scope_tokens)
extra_scope=()
if [[ "${#source_scope[@]}" -gt 0 ]]; then
  for item in "${task_scope[@]}"; do
    [[ -z "$item" ]] && continue
    found=false
    for allowed in "${source_scope[@]}"; do
      if [[ "$item" == "$allowed" || "$item" == "$allowed"* || "$allowed" == "$item"* ]]; then
        found=true
        break
      fi
    done
    if [[ "$found" != "true" ]]; then
      extra_scope+=("$item")
    fi
  done
fi

if [[ "${#extra_scope[@]}" -gt 0 ]]; then
  add_failure "Generated task expands scope"
fi

for forbidden in "Apollo" "Clay" "Hunter" "People Data Labs" "Supabase schema" "fake email" "fake emails" "fake contacts" "fake people"; do
  if grep -Eiq "$forbidden" "$TASK" && ! grep -Eiq "$forbidden" "$SOURCE"; then
    non_negative_match="$(grep -Ein "$forbidden" "$TASK" | grep -Eiv "do not|don't|no |not |without|запрещ|нельзя|не " || true)"
    if [[ -n "$non_negative_match" ]]; then
      add_failure "Generated task adds forbidden or unrequested action: $forbidden"
    fi
  fi
done

if ! grep -Eiq "Do not touch .*env|env-файлы|\\.env" "$TASK"; then
  warnings+=("What Must Not Change should explicitly mention env files")
fi

if [[ "${#failures[@]}" -eq 0 ]]; then
  verdict="OK"
  next_action="Run ai-run-task.sh"
else
  verdict="FAILED"
  next_action="Fix generated current-task.md or improve generator prompt. Do not run ai-run-task.sh."
fi

{
  echo "VERDICT: $verdict"
  echo
  echo "STRUCTURE_CHECK:"
  if [[ "$stage_count" -eq 5 ]]; then
    echo "- PASS"
  else
    echo "- FAIL"
  fi
  echo
  echo "ALIGNMENT_CHECK:"
  if [[ "${#failures[@]}" -eq 0 ]]; then
    echo "- PASS"
  else
    echo "- FAIL"
  fi
  echo
  echo "STAGE_COUNT: $stage_count"
  echo
  echo "SCOPE_CHECK:"
  if [[ "${#extra_scope[@]}" -eq 0 ]]; then
    echo "- PASS"
  else
    echo "- FAIL"
  fi
  echo
  echo "MISSING_REQUIREMENTS:"
  if [[ "${#failures[@]}" -eq 0 ]]; then
    echo "- none"
  else
    printf -- "- %s\n" "${failures[@]}"
  fi
  echo
  echo "EXTRA_SCOPE:"
  if [[ "${#extra_scope[@]}" -eq 0 ]]; then
    echo "- none"
  else
    printf -- "- %s\n" "${extra_scope[@]}"
  fi
  echo
  echo "WARNINGS:"
  if [[ "${#warnings[@]}" -eq 0 ]]; then
    echo "- none"
  else
    printf -- "- %s\n" "${warnings[@]}"
  fi
  echo
  echo "NEXT_ACTION: $next_action"
} > "$REPORT"

if [[ "$verdict" == "OK" ]]; then
  exit 0
fi

exit 1
