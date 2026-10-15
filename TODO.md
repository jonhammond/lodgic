# TODO


## ADR rate/volume charts (2026-10-15 leftovers)

- [ ] Trend ramp contrast: several `theme.trend.ramp` colours fall under 3:1 against the card when used as the 2.5px line in `RateVolumeChart` (light: `#26c4ac`, `#58a0ea`, `#e66fa6`, `#f08c3a`; dark: `#3356c4`, `#7e3bb0`, `#b5265f`, `#c44711`). Rework the shared ramp or give the combo line a contrast-safe variant.
- [ ] `PropertyTable` at 360px clips the second metric column (Rooms Sold) when a long-format result carries two metrics; property names also wrap. Pre-existing, now visible on the ADR preset.
- [ ] Single-property result: trend and combo lines use the market accent, but the table's ADR bar uses `ramp[0]` via `seriesOrder`. Align the colour source.
- [ ] Summary stage: Gemini sometimes writes "over the last 10 days" for a 30-day query and quotes a peak ADR that differs from the table. Tighten `summary_prompt.ts` (state the period from the rows, quote exact values).
- [ ] Deploy the `schema_prompt.ts` change with `/fn-deploy` after commit; production still runs the old prompt.
