#!/usr/bin/env bash
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../../.." && pwd)}"
docker run --rm -v "$ROOT:/repo" -w /repo/supabase/functions/text-to-sql denoland/deno:latest \
  sh -c "deno fmt --check . && deno lint . && deno test --allow-read=/repo"
