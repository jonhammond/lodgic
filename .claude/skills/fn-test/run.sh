#!/usr/bin/env bash
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../../.." && pwd)}"
docker run --rm -v "$ROOT/supabase/functions/text-to-sql:/app" -w /app denoland/deno:latest \
  sh -c "deno fmt --check . && deno lint . && deno test"
