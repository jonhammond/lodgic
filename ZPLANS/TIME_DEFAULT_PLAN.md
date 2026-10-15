# Explicit default time window + period caption

## Context

`schema_prompt.ts` tells Gemini how to express relative dates (`:89`) but never says what window to use when a question names none. "Top property by occupancy", "CPOR vs ADR by property" and "NPS and CSAT by segment" therefore get an ad hoc window per generation, and the UI never shows which window was applied. The user asked about a Daily / 30 days / Annualised picker on every answer; after discussion (picker needs a re-run per toggle, "Annualised" is a run-rate extrapolation specific to `revparEngine.ts`, SQL placeholder variant adds guard surface) the agreed scope is **option 1**: a deterministic 30-day default, and every answer reports the period it covers. No interactive control.

Prior incident (memory `schema-prompt-drift`): Flash-Lite generalises any rule mentioning daily granularity or a 30-day window to neighbouring presets. The new rule must be worded narrowly and verified with `/prompt-regress` in check mode before recording.

## Design

- Gemini structured output gains `period_label` (short phrase: "Last 30 days", "Last 60 days", "Month to date", "Yesterday") and `period_source` (`"question" | "default"`).
- The cache row stores both (two nullable columns, new migration, **ask-first**). Cache key already includes the system-prompt hash, so the prompt change makes old rows unreachable; null-tolerant on hit anyway.
- Frontend shows the period in the AnswerCard meta line: `Last 30 days (default) · 10 rows · 412 ms`. RevPAR panel branch is untouched (own timeframe control).

## Steps

### 1. Prompt rule: `supabase/functions/text-to-sql/schema_prompt.ts`

Insert after line 89 (avoid the words "daily" and any bucketing language):

```
- Missing period - only when the question names no date, day or range at all (nothing like "last N days", "this month", "this week", "yesterday", "today", a month name or a date): add the filter metric_date >= current_date - 30. This rule only fills in a period the question left out; it never replaces a period the question names, a single-day question ("yesterday", "today") stays that one day, and it does not change grouping, columns, row shape or recommended_chart.
```

Insert after line 99 (`caveat:`):

```
- period_label: the period the query actually covers, as a short phrase such as "Last 30 days", "Last 60 days", "Month to date", "Yesterday". period_source: "question" when the question named the period, "default" when the missing-period rule supplied it.
```

Export beside `CHARTS`:

```ts
export const PERIOD_SOURCES = ["question", "default"] as const;
export type PeriodSource = (typeof PERIOD_SOURCES)[number];
export function parsePeriod(out: unknown): { period_label: string | null; period_source: PeriodSource | null }
```

`parsePeriod` is lenient: trimmed non-empty string or null; enum member or null. Never fails the request.

### 2. Edge Function: `supabase/functions/text-to-sql/index.ts`

- `RESPONSE_SCHEMA` (`:49-57`): add `period_label: { type: "STRING" }`, `period_source: { type: "STRING", enum: [...PERIOD_SOURCES] }`, both in `required`.
- `GeminiOutput` (`:172`) and `CacheRow` (`:179`): add `period_label: string | null; period_source: PeriodSource | null`.
- `callGemini` parse (`:276-284`): `Object.assign(out, parsePeriod(out))` after the existing shape checks.
- Cache select (`:381`): append `period_label, period_source`. Cache-hit `gen` (`:447`): include both, re-validated via `parsePeriod(cached)`.
- Upsert (`:514`) and response JSON (`:532`): include both fields.
- Update the header comment (`:2`) and the structured-output tuple in `AGENTS.md`.
- `summary_prompt.ts` untouched.

### 3. Migration (ASK FIRST before `supabase migration up`; prod untouched)

New `supabase/migrations/20261015210000_ai_sql_cache_period.sql`:

```sql
alter table public.ai_sql_cache
  add column period_label text,
  add column period_source text check (period_source in ('question', 'default'));
```

Nullable, no backfill. Restart `supabase functions serve` after applying.

### 4. Frontend

- `frontend/lib/api.ts` `QueryResult` (`:5-14`): add `period_label?: string | null; period_source?: "question" | "default" | null`.
- `frontend/components/AnswerCard.tsx`: add props `period: string | null`, `periodSource: "question" | "default" | null`. In the `meta` array (`:40-45`) prepend `period ? (periodSource === "default" ? \`${period} (default)\` : period) : null`. Existing `styles.meta` / `t.text.subtle` apply; wraps naturally on narrow widths.
- `frontend/App.tsx` (`:333-346`): pass `period={result?.period_label ?? null}` and `periodSource={result?.period_source ?? null}`.
- `resultMapping.ts`: no change.

### 5. Tests

- `schema_prompt_test.ts`: prompt contains `current_date - 30` and `names no date`; prompt describes `period_label` / `period_source`; `PERIOD_SOURCES` equals `["question","default"]`; `parsePeriod` cases (valid pass-through, blank label → null, unknown source → null, missing fields → nulls).
- `cache_test.ts`: no change (prompt-in-key already covered).
- `.claude/skills/prompt-regress/run.sh`: record `period_label` and `period_source` in the ENTRY jq; add `period_source` to the diff projection (`{question,chart,columns,period_source,error}`); keep `period_label` out of the diff like `title`. Update SKILL.md. **Edit only after the first check run** (step 6.3).

### 6. Verification

1. `/fn-test` passes (fmt, lint, deno test via Docker).
2. User confirms migration; `supabase migration up`; restart `supabase functions serve text-to-sql --env-file supabase/functions/.env` via `!`.
3. `/prompt-regress` check mode with run.sh unmodified: expect no drift. Canaries: "RevPAR vs occupancy" (kpi, 2 cols), "Top property by occupancy" (bar, name/occupancy_pct), "CPOR vs ADR by property" (bar), "NPS and CSAT by segment" (bar), "RGI trend, last 60 days" (still 60-day weekly). Any drift → reword the rule, do not record.
4. Apply step 5 run.sh edits, `/prompt-regress --record`, `git diff` the baseline: `period_source` = "default" for the no-range presets, "question" for the rest; `chart`/`columns`/`rowCount` identical. Two runs = 18 of the 60/hr cap.
5. Cache round-trip with curl: second response `cached: true` with identical period fields.
6. Frontend: post-edit hook (`tsc` + eslint); `npx expo start`; check "Top property by occupancy" → "Last 30 days (default) · …", "Total revenue yesterday" → "Yesterday · …", "RGI trend, last 60 days" → "Last 60 days · …", RevPAR chip → no caption; narrow viewport. Optional `chart-reviewer`.
7. Commit (human author only), run lint/tests first.

## Critical files

- `supabase/functions/text-to-sql/schema_prompt.ts`
- `supabase/functions/text-to-sql/index.ts`
- `supabase/migrations/20261015210000_ai_sql_cache_period.sql` (new, ask-first)
- `frontend/components/AnswerCard.tsx`, `frontend/App.tsx`, `frontend/lib/api.ts`
- `.claude/skills/prompt-regress/run.sh`, `AGENTS.md`
