#!/usr/bin/env bash
set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1

STAGE_FILE=".ai/current-stage.md"
OUT=".ai/smoke-result.md"
BASE_URL="${BASE_URL:-http://localhost:${PORT:-3000}}"
TIMEOUT="${SMOKE_TIMEOUT_SECONDS:-30}"

mkdir -p .ai
: > "$OUT"

extract_section() {
  local header="$1"
  awk -v header="$header" '
    $0 ~ "^" header ":" {capture=1; next}
    capture && $0 ~ "^[A-Za-z /]+:" {capture=0}
    capture && $0 ~ "^### " {capture=0}
    capture {print}
  ' "$STAGE_FILE" |
    sed -E 's/^[[:space:]]*-[[:space:]]*//' |
    sed -E 's/^[[:space:]]+|[[:space:]]+$//g' |
    grep -Ev '^(|\\.\\.\\.)$' || true
}

check_url() {
  local label="$1"
  local url="$2"
  local body_file
  body_file="$(mktemp)"
  local status
  status="$(curl -L -sS --max-time "$TIMEOUT" -o "$body_file" -w "%{http_code}" "$url" 2>> "$OUT" || echo "000")"
  local result="PASS"
  local reason="HTTP $status"

  if [[ "$status" == "000" || "$status" =~ ^5 ]]; then
    result="FAIL"
  fi

  if grep -Eiq "Application error|Internal Server Error|__next_error__|Unhandled Runtime Error" "$body_file"; then
    result="FAIL"
    reason="$reason; Next/error marker found"
  fi

  echo "- $label $url: $result ($reason)" >> "$OUT"
  rm -f "$body_file"

  [[ "$result" == "PASS" ]]
}

echo "# Smoke Result" >> "$OUT"
echo "base_url=$BASE_URL" >> "$OUT"
echo >> "$OUT"

mapfile -t routes < <(extract_section "Routes To Check")
mapfile -t apis < <(extract_section "API To Check")

if [[ "${#routes[@]}" -eq 0 && "${#apis[@]}" -eq 0 ]]; then
  echo "Smoke-check skipped: no routes/API specified for this stage." >> "$OUT"
  echo "SMOKE_STATUS=OK" >> "$OUT"
  exit 0
fi

status=0

if [[ "${#routes[@]}" -gt 0 ]]; then
  echo "## Routes" >> "$OUT"
  for route in "${routes[@]}"; do
    [[ -z "$route" ]] && continue
    check_url "ROUTE" "${BASE_URL}${route}" || status=1
  done
fi

if [[ "${#apis[@]}" -gt 0 ]]; then
  echo "## API" >> "$OUT"
  for entry in "${apis[@]}"; do
    [[ -z "$entry" ]] && continue
    method="$(echo "$entry" | awk '{print $1}')"
    path="$(echo "$entry" | awk '{print $2}')"
    if [[ -z "$path" ]]; then
      method="GET"
      path="$entry"
    fi
    check_url "API $method" "${BASE_URL}${path}" || status=1
  done
fi

if [[ "$status" -eq 0 ]]; then
  echo "SMOKE_STATUS=OK" >> "$OUT"
else
  echo "SMOKE_STATUS=FAIL" >> "$OUT"
fi

exit "$status"
