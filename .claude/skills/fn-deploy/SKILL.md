---
name: fn-deploy
description: Deploy the text-to-sql Edge Function to production Supabase and print the new version. Manual invocation only.
disable-model-invocation: true
---

0. Deploy order: apply pending migrations in prod first (`ai_sql_cache.chart_spec`, via MCP `apply_migration` after explicit user confirmation), then deploy; deploying first silently disables the cache (lookup/upsert errors are logged and treated as misses).
1. Run `supabase functions deploy text-to-sql`.
2. Run `supabase functions list` and report the new version.
3. Remind: secrets are unchanged by deploy (`supabase secrets set` is separate).
4. Prompt the user to smoke-test the frontend at lodgic.jonhammond.org.
