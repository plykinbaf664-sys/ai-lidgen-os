#!/usr/bin/env bash
set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1

CONFIG=".ai/supervisor-config.md"
OUT=".ai/check-result.md"
FINAL_CHECK="${FINAL_CHECK:-false}"

read_config() {
  local key="$1"
  local default="$2"
  if [[ -f "$CONFIG" ]]; then
    local value
    value="$(grep -E "^${key}=" "$CONFIG" | tail -n 1 | cut -d= -f2- || true)"
    [[ -n "$value" ]] && printf '%s' "$value" && return
  fi
  printf '%s' "$default"
}

detect_pm() {
  if [[ -f pnpm-lock.yaml ]]; then
    echo "pnpm"
  elif [[ -f yarn.lock ]]; then
    echo "yarn"
  else
    echo "npm"
  fi
}

has_script() {
  local script="$1"
  node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['$script'] ? 0 : 1)" >/dev/null 2>&1
}

run_step() {
  local name="$1"
  shift
  echo "## $name" >> "$OUT"
  echo "\`\`\`" >> "$OUT"
  "$@" >> "$OUT" 2>&1
  local code=$?
  echo "\`\`\`" >> "$OUT"
  echo "exit_code=$code" >> "$OUT"
  echo >> "$OUT"
  return "$code"
}

mkdir -p .ai
: > "$OUT"

PM="$(detect_pm)"
BUILD_ON_EVERY_STAGE="$(read_config BUILD_ON_EVERY_STAGE false)"

echo "# Check Result" >> "$OUT"
echo "package_manager=$PM" >> "$OUT"
echo "final_check=$FINAL_CHECK" >> "$OUT"
echo >> "$OUT"

status=0

if [[ -f tsconfig.json ]]; then
  if [[ "$PM" == "pnpm" ]]; then
    run_step "TypeScript" pnpm exec tsc --noEmit || status=1
  elif [[ "$PM" == "yarn" ]]; then
    run_step "TypeScript" yarn tsc --noEmit || status=1
  else
    run_step "TypeScript" npx tsc --noEmit || status=1
  fi
else
  echo "## TypeScript" >> "$OUT"
  echo "Skipped: no tsconfig.json" >> "$OUT"
fi

if has_script lint; then
  if [[ "$PM" == "pnpm" ]]; then
    run_step "Lint" pnpm run lint || status=1
  elif [[ "$PM" == "yarn" ]]; then
    run_step "Lint" yarn lint || status=1
  else
    run_step "Lint" npm run lint || status=1
  fi
else
  echo "## Lint" >> "$OUT"
  echo "Skipped: no lint script" >> "$OUT"
fi

if [[ "$BUILD_ON_EVERY_STAGE" == "true" || "$FINAL_CHECK" == "true" ]]; then
  if has_script build; then
    if [[ "$PM" == "pnpm" ]]; then
      run_step "Build" pnpm run build || status=1
    elif [[ "$PM" == "yarn" ]]; then
      run_step "Build" yarn build || status=1
    else
      run_step "Build" npm run build || status=1
    fi
  else
    echo "## Build" >> "$OUT"
    echo "Skipped: no build script" >> "$OUT"
  fi
else
  echo "## Build" >> "$OUT"
  echo "Skipped: BUILD_ON_EVERY_STAGE=false and FINAL_CHECK=false" >> "$OUT"
fi

if [[ "$status" -eq 0 ]]; then
  echo "CHECK_STATUS=OK" >> "$OUT"
else
  echo "CHECK_STATUS=FAIL" >> "$OUT"
fi

exit "$status"
