#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
cd "$ROOT"

OUT=".ai/repair-result.md"
PROMPT_FILE=".ai/prompts/implement-stage.md"

if [[ ! -s .ai/current-stage.md ]]; then
  echo "No current stage found." | tee "$OUT"
  exit 1
fi

run_codex() {
  local prompt="$1"
  if [[ -n "${CODEX_CMD:-}" ]]; then
    $CODEX_CMD exec "$prompt"
  elif command -v codex >/dev/null 2>&1; then
    codex exec "$prompt"
  else
    echo "Codex CLI not found. Set CODEX_CMD or run implementation manually."
    return 127
  fi
}

PROJECT_STRUCTURE="$(find app components lib scripts .ai -maxdepth 2 -type f 2>/dev/null | sort | sed 's#^\./##' | head -n 200)"
AGENTS_CONTENT=""
if [[ -f AGENTS.md ]]; then
  AGENTS_CONTENT="$(cat AGENTS.md)"
fi

PROMPT="$(cat "$PROMPT_FILE")

# current-task.md
$(cat .ai/current-task.md)

# current-stage.md
$(cat .ai/current-stage.md)

# AGENTS.md
$AGENTS_CONTENT

# Relevant project structure
$PROJECT_STRUCTURE
"

mkdir -p .ai
{
  echo "# Implement Stage Result"
  echo
  run_codex "$PROMPT"
} > "$OUT" 2>&1
