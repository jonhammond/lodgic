---
name: prompt-regress
description: Regression-check Gemini text-to-SQL output (chart type, columns, row count) for the 9 preset questions against a recorded baseline. Run after any schema_prompt.ts or summary_prompt.ts change.
---

Prerequisite: the user must start the function first via `!`:
`supabase functions serve text-to-sql --env-file supabase/functions/.env`
(Claude must not reference the env file.)

- `bash .claude/skills/prompt-regress/run.sh --record` writes `baseline.json`.
- `bash .claude/skills/prompt-regress/run.sh` diffs against baseline; exit 1 on drift.

Requests are spaced 11 s apart (global 30 req/min cap; cache hits exempt, bypass header means every regress request counts); a full run takes ~100 s.

Budget: each run uses 9 of the 60 queries/hr per-IP cap. The script exits 2 on `rate_limited` instead of reporting drift. `RESET_LOCAL=1 bash .claude/skills/prompt-regress/run.sh` clears the local `ai_query_log` first (refuses unless DB_URL is 127.0.0.1:54322); the user runs this via `!` since the permission classifier blocks Claude from clearing the table.
