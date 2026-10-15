---
name: prompt-regress
description: Regression-check Gemini text-to-SQL output (chart type, columns, row count) for the 9 preset questions against a recorded baseline. Run after any schema_prompt.ts or summary_prompt.ts change.
---

Prerequisite: the user must start the function first via `!`:
`supabase functions serve text-to-sql --env-file supabase/functions/.env`
(Claude must not reference the env file.)

- `bash .claude/skills/prompt-regress/run.sh --record` writes `baseline.json`.
- `bash .claude/skills/prompt-regress/run.sh` diffs against baseline; exit 1 on drift.

Requests are spaced 11 s apart (global 6 req/min cap); a full run takes ~100 s.
