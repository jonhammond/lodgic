-- Backs a global per-minute request cap in the text-to-sql Edge Function,
-- keeping total traffic under the Gemini free-tier 15 RPM limit.

create index if not exists ai_query_log_created_at_idx
  on public.ai_query_log (created_at);

create or replace function public.count_queries_last_minute()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.ai_query_log
  where created_at > now() - interval '1 minute';
$$;

revoke execute on function public.count_queries_last_minute() from public, anon, authenticated;
grant execute on function public.count_queries_last_minute() to service_role;
