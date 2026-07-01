#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
cd "$ROOT"

OUT=".ai/repair-result.md"

if grep -q "^OK$" .ai/supervisor-report.md 2>/dev/null; then
  echo "# Repair Result" > "$OUT"
  echo "Skipped: supervisor verdict is OK." >> "$OUT"
  exit 0
fi

run_codex() {
  local prompt="$1"
  if [[ -n "${CODEX_CMD:-}" ]]; then
    $CODEX_CMD exec "$prompt"
  elif command -v codex >/dev/null 2>&1; then
    codex exec "$prompt"
  else
    echo "Codex CLI not found. Set CODEX_CMD or repair manually."
    return 127
  fi
}

PROMPT="$(cat .ai/prompts/repair-stage.md)

# current-stage.md
$(cat .ai/current-stage.md)

# supervisor-report.md
$(cat .ai/supervisor-report.md)

# current-diff.patch
$(cat .ai/current-diff.patch 2>/dev/null || true)

# check-result.md
$(tail -n 160 .ai/check-result.md 2>/dev/null || true)

# smoke-result.md
$(cat .ai/smoke-result.md 2>/dev/null || true)
"

{
  echo "# Repair Result"
  echo
  run_codex "$PROMPT"
} > "$OUT" 2>&1
