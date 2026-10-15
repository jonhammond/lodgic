# TODO

- [ ] Re-enable the per-IP hourly rate limit in `supabase/functions/text-to-sql/index.ts`: set `HOURLY_RATE_LIMIT_ENABLED = true` (currently `false`, disabled for prompt-regress and model testing). Limit is `RATE_LIMIT_PER_HOUR = 20`. Redeploy `text-to-sql` after.
