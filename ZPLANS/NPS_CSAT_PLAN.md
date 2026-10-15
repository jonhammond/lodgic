# NPS + CSAT combo chart for the "NPS and CSAT by segment" preset

## Context

The preset chip "NPS and CSAT by segment" (`frontend/App.tsx:134-143` SUGGESTIONS) returns 5 rows `{segment, csat, nps}` (baseline `.claude/skills/prompt-regress/baseline.json:95-103`, chart `bar`). `mapResult` (`frontend/lib/resultMapping.ts:413-440`) treats this as a generic category result and renders two separate `CategoryBarChart`s (CSAT 1-5, NPS) side by side. The user wants one combo chart per the screenshot: CSAT as **% bars** on the left axis (ticks `80% (4.0)`, i.e. csat / 5 * 100 with the 5-point equivalent), NPS score as a **line on the right axis**, one x position per segment.

Revised 2026-10-15 at implementation: CSAT bars use `kpi.guest.bar` and the NPS line `kpi.market.line` (no `trend.guest` token exists; `trend.volume` fails 3:1 in light mode); helpers live in `components/charts/`, not `lib/`; no frontend README exists.

Decisions (confirmed): keep the 5-segment SQL (frontend-only, no `schema_prompt.ts` / baseline change); CSAT scaled as percent of 5.

Data facts: `daily_metrics.csat numeric(3,2)` 0..5 (generator 3.6-4.8), `nps numeric(5,1)` -100..100 (generator 20-75). `segment` values: luxury, upper_upscale, upscale, upper_midscale, midscale.

## Changes

### 1. `frontend/lib/resultMapping.ts` — detect the score combo in the category branch

- Add type and export:
  ```ts
  export type ComboSeries = {
    kind: "combo";
    key: string;            // `${barKey}+${lineKey}`
    title: string;          // "CSAT and NPS"
    labels: string[];       // humanized segment names ("Upper Upscale")
    bar: { key: string; label: string; values: number[]; unit: "percent"; raw: number[]; rawUnit: MetricUnit };
    line: { key: string; label: string; values: number[]; unit: MetricUnit; color: ColorKey };
  };
  ```
  Widen `MappedResult.charts` to `(MetricSeries | TrendSeries | ComboSeries)[]`.
- Add `const CATEGORY_COMBOS = [{ bar: /csat/i, line: /(^|_)nps($|_)/i, barScale: 20 }]` next to `PAIRS` (line 225) and a `findCombo(yKeys)` mirroring `findPair`.
- In the category branch (`rows.length >= 2 && rows.length <= 20 && !dated`): if `findCombo(yKeys)` matches, build one `ComboSeries`: `bar.values = csat * 20` (percent of 5), `bar.raw = csat`, `line.values = nps`, `color: "guest"`, labels via `humanize(x)` when `xKey` is `segment`. Remaining yKeys (if any) still become `MetricSeries` after the combo. `facts`: reuse `categoryFacts` with a synthetic `MetricSeries` built from `bar` (raw 1-5 values, unit `number`) so the leader fact reads "Luxury — 4.6"; headline stays `title`. Keep `table: tableOf()` (two metrics, exact values).
- Nothing else in `mapResult` changes; `pair` / long-format paths untouched.

### 2. New `frontend/components/charts/ScoreComboChart.tsx`

Modelled on `RateVolumeChart.tsx` (dual-axis trick: both axes share Victory's y domain; secondary values are mapped onto the primary gridlines). Props: `{ series: ComboSeries }`. Differences from RateVolumeChart:

- **Primary (left) = bars, percent.** Domain fixed `lo = 0`, `hi = 100`, ticks `[0,20,40,60,80,100]`. Left tick format: `` `${v}% (${(v / 20).toFixed(1)})` ``; widen `PAD.left` to ~64 (narrow ~56) so `100% (5.0)` fits.
- **Secondary (right) = NPS line.** `nLo = min(0, floor(minNps/step)*step)`, `nStep = niceCeil((maxNps - nLo) / 5)`, `nHi = nLo + nStep*5`; `toY(nps) = (nps - nLo)/(nHi - nLo)*100`; right `tickFormat = v => formatNumber(nLo + v/100*(nHi-nLo))`. Reuse `niceCeil` from `scale.ts`, `pickTickValues` from `ticks.ts`, `formatNumber`/`formatPercent` from `format.ts`.
- Bars: `VictoryBar` x = i+1, y = csat%, fill `t.trend.volume` / `volumeActive` on hover (same tokens as RateVolumeChart), `barWidth` = min(28, (plotW - GAP*(n-1))/n). Line: `VictoryLine` + small `VictoryScatter` markers (screenshot shows dots) stroked with `t.trend.guest.line` (via `trendColor`/theme token for `guest`).
- X axis: category labels; for n ≤ 6 show every label, wrap with `wrapLabel` from `CategoryBarChart.tsx` at ~12 chars on narrow widths.
- Tooltip (Voronoi on x, blacklist line): `[label, "CSAT 92% (4.6)", "NPS 63"]`.
- Legend under the chart: `CSAT % (left axis)` bar swatch, `NPS score (right axis)` line swatch; header note `"% of 5-point CSAT · NPS -100..100"`.
- Card/title/legend styles copied from RateVolumeChart (`styles.card/header/legend`).

### 3. `frontend/App.tsx` canvas (lines 306-318)

- Import `ScoreComboChart`; in the `mapped.charts.map` switch add `s.kind === "combo" ? <ScoreComboChart key={s.key} series={s} />`.
- Grid `minWidth`: treat `combo` like `trend` (480) so it takes the full row.

### 4. Docs

- `AGENTS.md` Design bullet: add one clause "a category result carrying CSAT + NPS (`CATEGORY_COMBOS` in `resultMapping.ts`) renders a `ScoreComboChart` (CSAT % bars left, NPS line right)". Update frontend README "How results map" if it lists the chart kinds.

## Not changing

- `schema_prompt.ts`, `summary_prompt.ts`, prompt-regress baseline (SQL output unchanged: 5 rows, columns csat/nps/segment).
- `RateVolumeChart` / `RateVolumePanel` / `PAIRS` (ADR + rooms_sold path).

## Verification

1. `cd frontend && npx tsc --noEmit && npx expo lint` (post-edit hook also runs these).
2. Local stack: `supabase start`, `supabase functions serve text-to-sql --env-file supabase/functions/.env`, `npx expo start --web`; click "NPS and CSAT by segment".
   - One card: 5 bars (CSAT %, 72-96% range), NPS line with markers, left ticks `0% (0.0)` … `100% (5.0)`, right ticks round NPS values, table below with raw csat/nps.
   - Hover a bar: tooltip shows segment, `CSAT 92% (4.6)`, `NPS 63`.
3. Run the `chart-reviewer` agent with the question "NPS and CSAT by segment" (desktop + mobile width, light + dark): no label overlap at 360px, left-axis labels not clipped.
4. Regression: ask "ADR by property, last 30 days" (RateVolumePanel still renders) and "Top properties by revenue" (CategoryBarChart unchanged).
