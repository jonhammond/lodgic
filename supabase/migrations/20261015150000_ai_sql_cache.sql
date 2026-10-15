-- Cache of validated, successfully executed Gemini text-to-SQL outputs keyed by
-- a hash of (system prompt version, scoped question). Hits skip the SQL
-- generation call; the stored summary is reused only when the executed rows
-- hash matches. Service_role only; clients never read it.
create table public.ai_sql_cache (
  cache_key text primary key,
  prompt text not null,
  sql text not null,
  chart text not null,
  title text not null,
  caveat text not null default '',
  model text not null,
  rows_hash text,
  summary text,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz
);

alter table public.ai_sql_cache enable row level security;
revoke all on public.ai_sql_cache from anon, authenticated;
grant select, insert, update, delete on public.ai_sql_cache to service_role;
