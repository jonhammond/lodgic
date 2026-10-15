#!/usr/bin/env bash
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="http://127.0.0.1:54321/functions/v1/text-to-sql"
RECORD=0
[ "${1:-}" = "--record" ] && RECORD=1

command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }
command -v curl >/dev/null || { echo "curl required" >&2; exit 1; }

ANON_KEY="$(supabase status -o env 2>/dev/null | sed -n 's/^ANON_KEY=//p' | tr -d '"')"
[ -z "$ANON_KEY" ] && { echo "could not read ANON_KEY (is the local stack running?)" >&2; exit 1; }

RESULT="[]"
N="$(jq length "$DIR/questions.json")"
for i in $(seq 0 $((N - 1))); do
  Q="$(jq -r ".[$i]" "$DIR/questions.json")"
  RESP="$(curl -s -X POST "$URL" \
    -H "Authorization: Bearer $ANON_KEY" -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg p "$Q" '{prompt:$p}')")"
  ENTRY="$(printf '%s' "$RESP" | jq -c --arg q "$Q" \
    '{question:$q, chart:(.chart // null), title:(.title // null),
      columns:((.rows // [])[0] // {} | keys), rowCount:((.rows // []) | length),
      error:(.error // null)}' 2>/dev/null)" || ENTRY="$(jq -nc --arg q "$Q" '{question:$q,error:"invalid response"}')"
  RESULT="$(printf '%s' "$RESULT" | jq -c --argjson e "$ENTRY" '. + [$e]')"
  echo "[$((i + 1))/$N] $Q" >&2
  [ "$i" -lt $((N - 1)) ] && sleep 11
done

if [ "$RECORD" -eq 1 ]; then
  printf '%s' "$RESULT" | jq . > "$DIR/baseline.json"
  echo "baseline recorded: $DIR/baseline.json"
  exit 0
fi

[ -f "$DIR/baseline.json" ] || { echo "no baseline.json; run with --record" >&2; exit 1; }
DRIFT=0
for i in $(seq 0 $((N - 1))); do
  A="$(jq -c ".[$i] | {question,chart,columns,error}" "$DIR/baseline.json")"
  B="$(printf '%s' "$RESULT" | jq -c ".[$i] | {question,chart,columns,error}")"
  if [ "$A" != "$B" ]; then
    DRIFT=1
    echo "DRIFT: baseline=$A current=$B"
  fi
done
[ "$DRIFT" -eq 0 ] && echo "no drift"
exit "$DRIFT"
