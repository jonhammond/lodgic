# AGENTS.md

## Project

Hospitality analytics demo: NL question → Gemini generates SQL → read-only execution in Supabase → KPI tiles / charts / tables. Public, no auth, rate-limited, iframed into a portfolio site. Prod: frontend on Vercel (lodgic.jonhammond.org), Edge Function + schema in the production Supabase project. Open items: `TODO.md`.

## Boundaries

- Schema changes only as migrations in `supabase/migrations/`; apply locally with `supabase migration up`, in prod only via MCP `apply_migration` after explicit user confirmation.
- Clients never run SQL. Edge Function (service_role) → `run_hotel_analytics` → SELECT-only `analytics_ro` role in a read-only transaction. Keep this layering.
- Secrets: `supabase/functions/.env` locally (gitignored), `supabase secrets set` in prod. Names in `supabase/functions/.env.example`: `GEMINI_API_KEY`, `IP_HASH_SALT`; optional `ALLOWED_ORIGINS`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`.

## Stack

- Postgres: `properties`, `daily_metrics` (RLS, anon SELECT); `ai_query_log`, `ai_sql_cache` (service_role only); `pg_cron` nightly `generate_daily_hotel_metrics(date)`; seed 10 properties × 90 days.
- Edge Function `supabase/functions/text-to-sql/` (Deno): CORS allow-list; salted SHA-256 IP hash; 60 req/hr/IP + global 30 req/min (`count_queries_last_minute`, cache hits exempt); Gemini structured JSON `{sql, recommended_chart, report_title, caveat, period_label, period_source}` (no period named → last 30 days, `period_source=default`); `sql_guard.ts` mirrors the RPC checks; second non-fatal Gemini pass over rows → `summary` (2–5 sentences, `summary_prompt.ts`, null on failure). Cache keyed by hash(system prompt, normalized scoped question), TTL `SQL_CACHE_TTL_HOURS` (default 168); a hit skips the SQL call and reuses the summary when the rows hash matches; header `x-cache-bypass: 1` forces regeneration (prompt-regress sends it). Both Gemini calls log `{"usage":...}` lines. Tests: `deno test` in that dir.
- Gemini: `gemini-3.1-flash-lite` (`GEMINI_MODEL`); one retry on 429 with `gemini-3.5-flash-lite` (`GEMINI_FALLBACK_MODEL`, empty disables). `generativelanguage.googleapis.com/v1beta`, key in `x-goog-api-key`, `responseMimeType: application/json` + `responseSchema`. Free-tier quotas are per project + model, visible only in AI Studio.
- Frontend `frontend/`: Expo blank-TS / React Native Web; `victory` imported only in `components/charts/`; design tokens in `frontend/theme/`; mobile-responsive (narrow iframe).

## Commands

- Local: `supabase start`, `supabase migration up`, `supabase functions serve text-to-sql --env-file supabase/functions/.env` (also the `/prompt-regress` prerequisite; start it yourself via `!`).
- No Deno on host: run `deno check/test/lint/fmt` via the `denoland/deno` Docker image.

## Design

Single screen: PromptBar, PresetChips, ResultCanvas, SqlAccordion. ResultCanvas picks kpi / bar / trend line / table by data shape (`frontend/lib/resultMapping.ts`):

- Single-metric category bars: ranked single-hue ramp, deepest on top (darker in light, brighter in dark), contrast-clamped at the faint end (`barRamp`, `frontend/lib/color.ts`).
- Multi-series trends: ranked ramp `theme.trend.ramp` assigned by average rank; long-format results get a week-grouped collapsible table.
- Rate + volume driver (ADR + rooms_sold, `PAIRS`): `RateVolumePanel` = selectable multi-line trend, then `RateVolumeChart` combo for the pinned/only property (rooms-sold bars right axis, ADR line left).
- 2–3 same-unit metrics by category (`groupSameUnit`, e.g. CPOR vs ADR): single `GroupedBarChart`, legend, flat hue per metric, no table.
- CSAT + NPS by category (`CATEGORY_COMBOS`): `ScoreComboChart` (CSAT % bars left, NPS line right).
- "RevPAR vs occupancy" chip bypasses Gemini (`isRevparOccQuestion`, `lib/revparOcc.ts`): reads `daily_metrics` + `properties` via the anon client, runs `lib/revparEngine.ts` (Daily / 30 days / Annualised, demand-shift slider), renders `RevparOccPanel` (stat cards, twin RevPAR/occupancy chart with tier colouring, sortable leaderboard).

## Claude Code automation

- Hook `.claude/hooks/post-edit-check.sh` (PostToolUse Edit|Write): Deno fmt/check for the function, `tsc` + eslint for `frontend/`; exit 2 on failure.
- Hookify (`.claude/hookify.*.local.md`): blocks `supabase db push|reset` and force push; warns on guard/prompt edits.
- Skills: `/fn-test`, `/fn-deploy` (manual only), `/prompt-regress [--record]`. Agents: `sql-guard-reviewer`, `chart-reviewer` (needs Expo dev server on :8081).

## Rules

- **Always:** lint and test before committing; human authors only in commits.
- **Ask first:** database changes (schema, RLS, Edge Functions) and pushing them.
- **Never:** force push to main; `supabase db push`; `supabase db reset`; commit secrets or `.env` files.
