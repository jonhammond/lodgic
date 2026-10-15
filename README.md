# lodgic

Hospitality analytics demo: ask natural-language questions about a synthetic hotel portfolio; Gemini 3.5 Flash-Lite converts them to SQL, Supabase executes them read-only, and a dashboard renders live KPI tiles (with sparklines), charts, and tables.

Live demo: https://lodgic.jonhammond.org

## Stack

- **DB:** Supabase Postgres — `properties` (10 hotels across luxury–midscale segments) + `daily_metrics` (revenue, distribution, departmental cost, comp-set index and guest-experience columns) + `portfolio_daily` view, nightly segment-aware `pg_cron` data generator, hardened read-only RPC (`run_hotel_analytics`) behind a privilege-restricted role
- **API:** Supabase Edge Function `text-to-sql` (Deno) — CORS allow-list, per-IP rate limiting (20/hr), Gemini structured output, defense-in-depth SQL validation, one retry on HTTP 429 against a fallback model
- **API request:** `{prompt, property_ids?}` — optional UUID list (≤50) scopes every generated query to the selected properties
- **API response:** `{sql, chart, title, rows}` plus `caveat` and `duration_ms`
- **Frontend:** Expo / React Native Web dashboard (dark/light theme toggle, property picker, KPI sections, answer card with bar/line/table, SQL accordion, CSV export) + victory charts, static export on Vercel

## Local development

```bash
supabase start                      # local stack (needs Docker)
supabase migration up               # apply migrations; seed.sql loads on fresh setups
supabase functions serve text-to-sql --env-file supabase/functions/.env

# frontend (needs frontend/.env, see frontend/.env.example)
cd frontend && npm install && npx expo start --web   # http://localhost:8081
```

`supabase/functions/.env` (gitignored) needs `GEMINI_API_KEY` and `IP_HASH_SALT`; see `supabase/functions/.env.example`. Optional: `ALLOWED_ORIGINS` (comma-separated CORS origins beyond localhost defaults), `GEMINI_MODEL` (default `gemini-3.5-flash-lite`), `GEMINI_FALLBACK_MODEL` (default `gemini-3.1-flash-lite`; empty disables the 429 retry).

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/text-to-sql \
  -H "Authorization: Bearer <local anon key>" -H "Content-Type: application/json" \
  -d '{"prompt":"Portfolio ADR trend over the last 30 days"}'
```

Deno is not installed on the host; run `deno check/test/lint/fmt` for the Edge Function via the `denoland/deno` Docker image.

## Status

- ✅ Phase 0 — local Supabase environment
- ✅ Phase 1 — schema, cron generator, hardened RPC, rate-limit log
- ✅ Phase 2 — `text-to-sql` Edge Function (unit-tested + verified end-to-end locally)
- ✅ Phase 3 — Expo/RN Web frontend
- ✅ Phase 4 — production deploy (Supabase + Vercel) and portfolio card
- ✅ Dark dashboard redesign
- ✅ Portfolio expansion — 10 hotels, 14 operating metrics, RPC hardening
- ✅ Property filter + theme toggle
- 🔄 Open items tracked in [TODO.md](TODO.md)

Full plan: [HOSP_DATA_ANALYTICS_APP_PLAN.md](HOSP_DATA_ANALYTICS_APP_PLAN.md)
