# AGENTS.md

## Project

Hospitality analytics AI demo: natural-language questions → Gemini 3.1 Flash-Lite generates SQL → executed read-only in Supabase → KPI tiles / charts / tables. Public (no auth), rate-limited, embedded in a portfolio site via iframe. Plan: `HOSP_DATA_ANALYTICS_APP_PLAN.md` (phases 0–3 done locally; 4 deploy pending; production DB untouched).

## Boundaries

- All schema work as versioned migrations in `supabase/migrations/`; apply locally with `supabase migration up`. Production apply only via MCP `apply_migration` after explicit user confirmation.
- Clients never execute SQL directly: the Edge Function (service_role) calls `run_hotel_analytics`, which runs queries as the SELECT-only `analytics_ro` role in a read-only transaction. Keep that layering intact.
- Secrets live in `supabase/functions/.env` locally (gitignored) and `supabase secrets set` in prod: `GEMINI_API_KEY`, `IP_HASH_SALT`, optional `ALLOWED_ORIGINS`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`. Names documented in `supabase/functions/.env.example`.

## Stack

- Supabase Postgres: `properties`, `daily_metrics` (RLS, anon SELECT), `ai_query_log` (rate limiting, service_role only), `ai_sql_cache` (service_role only), `pg_cron` nightly generator `generate_daily_hotel_metrics(date)`, seed = 10 properties × 90 days.
- Edge Function `supabase/functions/text-to-sql/` (Deno): CORS allow-list, salted SHA-256 IP hash, 60 req/hr/IP plus a global 30 req/min cap (`count_queries_last_minute`; cache hits exempt), Gemini structured JSON output (`{sql, recommended_chart, report_title, caveat, period_label, period_source}`; questions naming no period default to the last 30 days, `period_source` = `default`), `sql_guard.ts` validation mirroring the RPC checks, then a second non-fatal Gemini pass over the result rows producing `summary` (2–5 sentences, `summary_prompt.ts`; null on failure). `ai_sql_cache` (service_role only) stores validated SQL + summary keyed by hash(system prompt, normalized scoped question), TTL `SQL_CACHE_TTL_HOURS` (default 168); a hit skips the SQL call and reuses the summary when the rows hash matches. Header `x-cache-bypass: 1` forces a fresh generation (prompt-regress sends it). Both calls log `usageMetadata` as `{"usage":...}` lines. Tests: `deno test` in that directory.
- Frontend: `frontend/` Expo blank-TS / React Native Web, `victory` charts (imported only in `components/charts/`), design tokens in `frontend/theme/`; static export to Vercel pending.

## Core

- Local stack: `supabase start` (Docker), then `supabase migration up`; serve the function with `supabase functions serve text-to-sql --env-file supabase/functions/.env`.
- Deno not installed on host; run `deno check/test/lint/fmt` via the `denoland/deno` Docker image.
- Gemini: `gemini-3.1-flash-lite` default (`GEMINI_MODEL`), one retry on HTTP 429 with `gemini-3.5-flash-lite` (`GEMINI_FALLBACK_MODEL`, empty disables); free-tier quotas are per project and model, visible only in AI Studio. Via `generativelanguage.googleapis.com/v1beta`, key in `x-goog-api-key` header, `responseMimeType: application/json` + `responseSchema`.

## Design

- Single-screen UI: PromptBar, PresetChips, ResultCanvas (kpi/bar/**trend line**/table, chosen by data shape in `frontend/lib/resultMapping.ts`), SqlAccordion. Multi-series trends use a ranked colour ramp (`theme.trend.ramp`, assigned by average rank) and long-format results render a week-grouped, collapsible table. A long-format result carrying a rate plus its volume driver (ADR + rooms_sold, `PAIRS` in `resultMapping.ts`) renders as a `RateVolumePanel`: the selectable multi-line trend, then for the pinned (or only) property a `RateVolumeChart` combo (rooms-sold bars on a right axis, ADR line on the left). A category result with 2-3 metrics sharing a currency/percent unit (CPOR vs ADR by property, `groupSameUnit` in `resultMapping.ts`) renders a single `GroupedBarChart` (legend, flat hue per metric, no table). A category result carrying CSAT + NPS (`CATEGORY_COMBOS` in `resultMapping.ts`) renders a `ScoreComboChart` (CSAT % bars left, NPS line right). The "RevPAR vs occupancy" chip bypasses Gemini (`isRevparOccQuestion` in `lib/revparOcc.ts`), reads `daily_metrics` + `properties` via the anon client, runs the client-side engine `lib/revparEngine.ts` (Daily / 30 days / Annualised, demand-shift slider), and renders `RevparOccPanel` (stat cards, twin-panel RevPAR/occupancy chart with tier colouring, sortable leaderboard). Mobile-responsive (narrow iframe).

## Claude Code automation

- Hook `.claude/hooks/post-edit-check.sh` (PostToolUse Edit|Write): Deno fmt/check for the function, `tsc` + eslint for `frontend/`; exit 2 on failure.
- Hookify rules (`.claude/hookify.*.local.md`): block `supabase db push|reset` and force push; warn on guard/prompt edits.
- Skills: `/fn-test`, `/fn-deploy` (manual only), `/prompt-regress [--record]`.
- Agents: `sql-guard-reviewer`, `chart-reviewer` (needs Expo dev server on :8081).
- `/prompt-regress` prerequisite: start `supabase functions serve text-to-sql --env-file supabase/functions/.env` yourself via `!`.

## **Always:**

- Run linting and tests before committing
- List only human authors in git commits

## ⚠️ **Ask First:**

- Before making database changes (schema, RLS policies, Supabase Functions)
- Before pushing database changes

## ❌ **Never:**

- Force push to main
- Use `supabase db push`
- Use `supabase db reset`
- Commit secrets or .env files to the repository
