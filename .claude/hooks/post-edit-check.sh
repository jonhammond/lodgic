#!/usr/bin/env bash
# PostToolUse(Edit|Write): typecheck/format-check the edited file.
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
FILE="$(jq -r '.tool_input.file_path // empty' 2>/dev/null)"
[ -z "$FILE" ] && exit 0

case "$FILE" in
  "$ROOT"/supabase/functions/text-to-sql/*.ts)
    OUT="$(docker run --rm -v "$ROOT/supabase/functions/text-to-sql:/app" -w /app denoland/deno:latest sh -c "deno fmt --check . && deno check index.ts" 2>&1)"
    RC=$?
    ;;
  */node_modules/*|*/dist/*) exit 0 ;;
  "$ROOT"/frontend/*.ts|"$ROOT"/frontend/*.tsx)
    OUT="$(cd "$ROOT/frontend" && npx tsc --noEmit 2>&1 && npx eslint "$FILE" 2>&1)"
    RC=$?
    ;;
  *) exit 0 ;;
esac

if [ "$RC" -ne 0 ]; then
  printf '%s\n' "$OUT" >&2
  exit 2
fi
exit 0
