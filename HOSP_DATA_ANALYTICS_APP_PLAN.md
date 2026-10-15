# HOSP_DATA_ANALYTICS_APP_PLAN — Hospitality Analytics AI Demo

## Context

Portfolio demo app: users ask natural-language analytics questions about a synthetic hotel portfolio; an AI agent converts them to SQL, Supabase executes them read-only, and the UI renders KPI tiles, charts, and tables. Based on `HotelAnalyticsAppDemoPlan.md` and `README.md`, with corrections where the source doc is outdated or insecure.

**Confirmed decisions:**
- AI engine: **Google Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`, fallback `gemini-3.1-flash-lite`)** (free tier, Google AI Studio key)
- Access: **fully public**, no auth; rate limiting on the Edge Function
- Charts: **victory (web package)** via platform-specific imports — not victory-native XL (Skia-based, poor static-web support)
- Hosting: **Vercel** (static export), embedded in portfolio via `<iframe>`
- Platform: **web-only** (Expo / React Native Web)
- Seed data: **90 days** of synthetic history + nightly `pg_cron` inserts
- Supabase: production project exists, **zero tables**; local dev env not yet configured

**Project rules honored throughout:** ask before any production DB change; never `supabase db push` / `supabase db reset`; no secrets committed.

**Implementation prerequisites:** load `supabase:supabase` and `supabase:supabase-postgres-best-practices` skills before writing any SQL/migrations; load `expo:expo-overview` / `expo:expo-project-structure` before scaffolding the app; load `dataviz` before building chart components.

---

## Phase 0 — Local Supabase environment

1. Verify Supabase CLI (`supabase --version`); install/update via Homebrew if missing.
2. `supabase init` at repo root → creates `supabase/` (config.toml, migrations/, functions/).
3. `supabase link --project-ref <prod-ref>` (ref via MCP `list_projects`; user runs interactive login if needed: `! supabase login`).
4. `supabase start` (requires Docker running) → local Postgres, Studio, Edge runtime.
5. Add `.env` entries to `.gitignore` check; create `supabase/functions/.env` (local only) for `GEMINI_API_KEY`.

## Phase 1 — Database (migrations, seed, cron, RPC)

All schema as versioned migrations in `supabase/migrations/`, applied locally first with `supabase migration up`. Production apply via MCP `apply_migration` **only after explicit user confirmation** per migration batch.

**Migration 1 — schema:**
- `properties(id uuid pk, name unique, location, total_rooms, segment, base_adr, market)` — RLS enabled, `SELECT` policy for `anon`. 10 hotels (3 original + 7 added in `20261009192927_portfolio_expansion.sql`).
- `daily_metrics(id uuid pk, property_id fk, metric_date, rooms_sold, total_revenue, adr generated, occupancy_pct, revpar, UNIQUE(property_id, metric_date))` — RLS enabled, `SELECT` for `anon`. Index on `(property_id, metric_date)`.
  - Distribution: `bookings, direct_bookings, ota_bookings, gds_bookings, group_bookings, cancellations, avg_booking_window_days`.
  - Cost: `rooms_cost, fnb_cost, admin_cost, marketing_cost, maintenance_cost, utilities_cost`; generated `total_cost, gop, cpor`.
  - Market comp-set: `market_occupancy_pct, market_adr, market_revpar`; generated `mpi, ari, rgi`.
  - Guest: `nps, csat, repeat_guest_pct, rooms_cleaned, housekeeping_hours`.
  - Derived in SQL / prompt rules: direct booking ratio, channel mix, cancellation rate, flow-through, housekeeping rooms per labor hour.
- `portfolio_daily` view (security_invoker) — per-day sums and weighted averages across properties; read by the dashboard KPI sections. `SELECT` for `anon`, `authenticated`, `analytics_ro`.

**Migration 2 — data generator + cron:**
- `generate_daily_hotel_metrics(target_date date default current_date)` — parameterized by date so the same function backfills history and runs nightly. Occupancy band and ADR (`base_adr` ±15%, weekend uplift) depend on `segment`; `synth_metric_extras()` fills distribution, cost, market and guest columns with segment-driven ranges. Existing rows were backfilled once by the expansion migration.
- Enable `pg_cron`; `cron.schedule('generate-daily-hotel-data', '0 0 * * *', ...)` calling the function. (Cron only fires in production; local relies on seed.)

**Migration 3 — hardened read-only RPC** (replaces the doc's naive `LIKE 'select%'` version, which is injectable via CTE-wrapped writes, multi-statement payloads, and function-call side effects):
- Dedicated `analytics_ro` role: `NOLOGIN`, `GRANT SELECT` on the two tables only, no other privileges.
- `run_hotel_analytics(sql_query text) RETURNS jsonb`, `SECURITY DEFINER`, `SET search_path = public`:
  - Reject semicolons, reject anything not starting with `SELECT`/`WITH`.
  - Deny-list of settings/context readers (`current_setting`, `pg_settings`, `vault`...), `set_config`, second-string executors (`query_to_xml`...) and file/network functions; mirrored in `sql_guard.ts`.
  - Scrub `request.headers` / `request.cookies` / `request.jwt.claims` (PostgREST exposes the service_role token there) with `set_config(..., '', true)` before dropping privileges.
  - `SET LOCAL ROLE analytics_ro` before `EXECUTE` — real enforcement is role privileges, not string matching.
  - `SET LOCAL statement_timeout = '5s'`; cap result with an outer `LIMIT 500` wrapper.
  - `GRANT EXECUTE` to `service_role` only (Edge Function calls it); **revoke from `anon`** — clients never execute arbitrary SQL directly.
- Rate-limit table `ai_query_log(ip_hash, created_at)` + helper to count requests per IP per hour (used by Phase 2).

**Seed (`supabase/seed.sql`):** 3 original properties (idempotent, `on conflict (name) do nothing`) + 90 days of history via `generate_daily_hotel_metrics(d)` loop. Runs automatically on local `migration up` fresh setups; applied to production as an explicit one-time script (with confirmation).

**Post-apply:** run MCP `get_advisors` (security + performance) on production and resolve findings.

## Phase 2 — Edge Function `text-to-sql`

`supabase/functions/text-to-sql/index.ts` (Deno):
1. CORS headers (allow portfolio origin + localhost); handle OPTIONS.
2. Rate limit: hash caller IP, check `ai_query_log` (e.g. 20 req/hour/IP) → 429 on breach.
3. Prompt Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`, fallback `gemini-3.1-flash-lite`) (`generativelanguage.googleapis.com/v1beta/.../gemini-3.5-flash-lite:generateContent`) with schema context + system rules; request structured JSON `{sql, recommended_chart: "bar"|"line"|"kpi"|"table", report_title}` using Gemini's `responseMimeType: "application/json"` + response schema (more reliable than "no backticks" prompting).
4. Validate the returned SQL (same SELECT/WITH + no-semicolon checks, defense in depth), execute via `run_hotel_analytics` RPC with the service-role client.
5. Return `{sql, chart, title, rows}`; structured error responses (Gemini failure, SQL error, rate limit) so the UI can show friendly messages.
6. Secrets: `GEMINI_API_KEY` via `supabase secrets set` (prod) / `functions/.env` (local). Never in code.
7. Local test: `supabase functions serve text-to-sql` + curl. Deploy: `supabase functions deploy text-to-sql`.

## Phase 3 — Expo / React Native Web frontend

Scaffold inside the repo (`app/` subdirectory or repo root — decide at implementation; prefer root for simple Vercel config):
- `npx create-expo-app` (blank TS template), `expo install react-native-web react-dom @supabase/supabase-js`.
- `victory` (web) for charts. Web-only build, so no platform split is strictly required; keep chart components isolated behind a `components/charts/` boundary in case native targets come later.

**UI modules:**
- `PromptBar` — text input + submit; loading state.
- Preset chips (`SUGGESTIONS` in `App.tsx`) — 8 canned prompts covering revenue, direct booking ratio, CPOR, RGI trend and NPS/CSAT by segment.
- KPI sections (`KpiSections`) — Revenue, Distribution, Cost & Profit, Market Index, Guest Experience; collapsible, fed by `portfolio_daily`.
- `ResultCanvas` — switches on `recommended_chart`: `kpi` → metric tiles; `bar`/`line` → victory charts; `table` → scrollable data grid. Graceful empty/error states.
- `SqlAccordion` — collapsible display of the generated SQL (the demo's "show your work" feature).
- Single-screen layout, mobile-responsive (iframe may be narrow).

**Client:** `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable key via MCP `get_publishable_keys`); call Edge Function with `supabase.functions.invoke('text-to-sql', { body: { prompt } })`.

## Phase 4 — Deployment

1. `npx expo export --platform web` → `dist/`.
2. Deploy to Vercel (vercel plugin / CLI), SPA fallback config.
3. Set production CORS origin in the Edge Function to the Vercel + portfolio domains.
4. iframe embed snippet for the portfolio site.
5. Smoke-test the live URL end-to-end.

## Verification

- **DB (local):** `supabase migration up` clean on fresh local stack; `SELECT count(*) FROM daily_metrics` ≈ 900 (10 props × 90 days); RPC rejects `UPDATE…`, `DROP…`, `WITH x AS (DELETE…)…`, multi-statement input; accepts valid SELECTs.
- **Edge Function (local):** curl preset prompts → valid JSON with rows; rate limit returns 429 after threshold; bad prompt → structured error.
- **Frontend:** `npx expo start --web`; all preset chips render correct visualization type; SQL accordion shows query; error states render.
- **Production:** after confirmed migration apply — MCP `get_advisors` clean, `execute_sql` sanity counts, deployed function invoked from the Vercel URL, nightly cron verified next day via `cron.job_run_details`.
- Lint (`eslint`) + any tests pass before each commit.

## Execution notes

- Sequential phases 0→4; DB work gates everything else.
- Per model-handoff rules: implementation tasks dispatched to Sonnet subagents with plan sections + acceptance criteria; this session orchestrates and reviews.
- Production DB changes and function deploys: **ask first, every time.**
