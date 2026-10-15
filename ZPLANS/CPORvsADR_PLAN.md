# Grouped bar chart for same-unit multi-metric category results

## Context

The preset "CPOR vs ADR by property" returns `(name, adr, cpor)` × 10 rows. `mapResult` (`frontend/lib/resultMapping.ts:380-406`) emits one `CategoryBarChart` panel per numeric column and attaches a `PropertyTable` whenever there is more than one panel, so the user sees two side-by-side bar charts plus a table that repeats the same numbers. The goal is a single grouped horizontal bar chart (two bars per property, legend for ADR / CPOR) and no table.

Decision: group only when 2–3 numeric columns share the same `currency` or `percent` unit. Mixed-unit results ("RevPAR vs occupancy") and plain-number results ("NPS and CSAT by segment") keep the current two-panel + table rendering. Bounded change: existing flow, three files.

## Changes

### 1. `frontend/lib/resultMapping.ts`

- Add a `GroupedSeries` type and include it in `MappedResult.charts`:
  ```ts
  export type GroupedSeries = {
    kind: "grouped";
    key: string;          // joined metric keys, used as React key
    title: string;        // result title
    note: string;         // unitLabel(unit)
    unit: MetricUnit;
    labels: string[];     // category labels (xs)
    series: { key: string; title: string; values: number[]; color: ColorKey }[];
  };
  ```
- In the category branch (after `charts` is built at L382-396), before the headline/table logic: if `charts.length` is 2 or 3, every `unit` is identical, and that unit is `"currency"` or `"percent"`, return
  `{ headline: title, facts: categoryFacts(charts[0], xKey), charts: [grouped], table: null }`.
- Colour: reuse `colorFor(key, i)` per series; if two series resolve to the same `ColorKey`, replace the later one with the first unused entry of `COLORS` so bars within a group are always distinguishable.
- Existing single-metric and mixed-unit paths unchanged.

### 2. New `frontend/components/charts/GroupedBarChart.tsx`

Horizontal grouped bars in one `Card`, modelled on `CategoryBarChart.tsx`:

- Export `WIDE`, `NARROW`, `NARROW_W`, `LABEL_FONT` from `CategoryBarChart.tsx` (already exports `wrapLabel`) and reuse them, plus `niceDomain`/`tickLabel` from `./scale` and `formatByUnit`/`formatExact` from `resultMapping`.
- Header: title left, `note` right (same styles). Below it a legend row (swatch + series title) copied from the `TrendLineChart.tsx:378-405` legend pattern, with a rounded swatch filled with `t.kpi[color].bar`.
- Chart: `VictoryChart horizontal` with `VictoryGroup offset={BAR + GAP}` wrapping one `VictoryBar` per series. Shared dependent domain = `niceDomain(0, max over all series values, 4)`. Row height = `series.length * (BAR + GAP) + 10` (bump when a label wraps, as `CategoryBarChart` does). Each bar carries a value label (`formatExact` wide, `formatByUnit` narrow) with `dx={4}`; right gutter sized from the widest label as in `CategoryBarChart.tsx:62-64`.
- Flat fill per series (`fillOpacity: 1`); the single-hue opacity ramp from `CategoryBarChart` is dropped because two hues already encode the series.
- Rows inverted (`x: n - i`) so row 0 is on top. Verify in the browser that the within-group bar order matches the legend order; reverse the `series` array passed to `VictoryGroup` if Victory draws the first series lowest.

### 3. `frontend/App.tsx:304-316`

Add a `s.kind === "grouped" ? <GroupedBarChart key={s.key} series={s} />` branch in the `Grid` map. Grep `kind === "` across `frontend/` for any other narrowing on the chart union (e.g. `Grid minWidth` at L305) and extend it; a lone grouped panel should take the full grid row (check `useGridColumns` with one child).

## Verification

1. Hook runs `tsc` + eslint on each edit; both must pass.
2. Start the Expo dev server (`npx expo start` in `frontend/`, port 8081).
3. Run the `chart-reviewer` agent with "CPOR vs ADR by property": one chart, two bars per property, legend, exact value labels, no table, no label overlap at desktop and mobile, light and dark.
4. Regression check in the browser: "RevPAR vs occupancy" and "NPS and CSAT by segment" still render two panels plus a table; "Top property by occupancy" still renders a single panel, no table.
5. No frontend test runner exists; no backend/prompt changes, so `/prompt-regress` is not needed.
