-- Period the cached query covers, as reported by the structured Gemini output:
-- period_label is a short phrase ("Last 30 days"), period_source says whether the
-- question named it or the prompt's missing-period rule supplied the 30-day default.
-- Nullable, no backfill: the cache key already includes the system-prompt hash, so
-- rows written before this change are unreachable anyway.
alter table public.ai_sql_cache
  add column period_label text,
  add column period_source text check (period_source in ('question', 'default'));
