# TODO

## ADR rate/volume charts (2026-10-15 leftovers)

- [ ] Trend ramp contrast: several `theme.trend.ramp` colours fall under 3:1 against the card when used as the 2.5px line in `RateVolumeChart` (light: `#26c4ac`, `#58a0ea`, `#e66fa6`, `#f08c3a`; dark: `#3356c4`, `#7e3bb0`, `#b5265f`, `#c44711`). Rework the shared ramp or give the combo line a contrast-safe variant.
- [ ] `PropertyTable` at 360px clips the second metric column (Rooms Sold) when a long-format result carries two metrics; property names also wrap. Pre-existing, now visible on the ADR preset.
- [ ] Single-property result: trend and combo lines use the market accent, but the table's ADR bar uses `ramp[0]` via `seriesOrder`. Align the colour source.
- [ ] Summary stage: Gemini sometimes writes "over the last 10 days" for a 30-day query and quotes a peak ADR that differs from the table. Tighten `summary_prompt.ts` (state the period from the rows, quote exact values). On "CPOR vs ADR by property" it also reports the column sums ($2,904.16 / $1,686.00) as "average" ADR / CPOR.
- [ ] Light-mode bar contrast (also throttles the new `barRamp`: light green/amber ramps clamp to ~0.13 total lightness span, rank barely legible from shade until these hues are lifted): `accents.green` (`#2acc8a`, ~2.1:1) and `accents.amber` (`#e0a526`, ~2.2:1) fall under 3:1 on the white card. Shared by `CategoryBarChart`, `MetricBarChart` and the new `GroupedBarChart` (ADR + CPOR bars); dark mode passes (~6:1). Consider light-only `kpi.adr.bar` / `kpi.cost.bar` overrides in `theme/tokens.ts`.
- [ ] Dark-mode guest pink (also throttles the new `barRamp` in dark for occupancy/guest bars): `kpi.guest.bar` (`accents.pink` `#d6286a`) is ~2.7:1 on the dark card `#2a3138`; used by the new `ScoreComboChart` CSAT bars and the occupancy/guest KPI tiles. Add a dark-only lift (e.g. `#f58ab8` from the ramp) in `theme/tokens.ts`.
- [ ] Run `npx expo export -p web` once as a smoke test before the Phase 4 deploy (the NPS/CSAT panel's `lib/npsCsat.ts` uses a dynamic `import("./supabase")`).
- [ ] Deploy the `schema_prompt.ts` change with `/fn-deploy` after commit; production still runs the old prompt. Order: apply `20261015210000_ai_sql_cache_period.sql` to prod first (MCP `apply_migration`, ask-first), then `/fn-deploy`; the deployed function selects and upserts the new `period_label` / `period_source` columns.
