-- Declarative chart spec ({x, y[], y2?, label?}) for scatter / pie / combo / stacked_bar
-- results, as validated against the executed rows. Null for the legacy kinds
-- (bar / line / kpi / table) and for rows written before this change.
alter table public.ai_sql_cache
  add column if not exists chart_spec jsonb;
