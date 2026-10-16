# Plan: user-requested chart forms (scatter, pie, combo, stacked bar)

## Context

**Question asked:** if a user prompts for a chart the current logic does not model (scatter, pie, bar+line combo, stacked bar), can Gemini figure it out?

**Answer: not today, and not by itself.** The pipeline gives Gemini a closed vocabulary and the frontend mostly ignores it:

- `recommended_chart` is `enum: bar|line|kpi|table` (`supabase/functions/text-to-sql/schema_prompt.ts:1`, `index.ts:56-73`); the server rejects anything else (`index.ts:298`).
- `mapResult` (`frontend/lib/resultMapping.ts:329`) treats the hint as advisory. Only `kpi` and `line` branch; everything else is inferred from row shape (`detectLongFormat`, `columnRoles`) plus three hard-coded pairings (`PAIRS`, `CATEGORY_COMBOS`, `groupSameUnit`).
- `App.tsx:369-381` switches on five `kind` values; there is no scatter/pie/stacked component and no way to bind columns to axes.

So "scatter of ADR vs occupancy by property" produces correct SQL but renders two category bar charts. Gemini cannot emit React/Victory code at runtime (no eval path, and there should not be one). What it *can* do reliably with `gemini-3.1-flash-lite` structured output is (a) choose from an extended enum and (b) bind result columns to chart roles. That is the design: **a declarative chart spec, rendered by a small set of generic Victory components, used only when the user asks for a form or the data cannot fit the existing charts.** Existing charts stay the default (user requirement).

Docs consulted (context7): Victory 37 (`VictoryScatter`, `VictoryPie` standalone, `VictoryStack`, dual-axis via two `dependentAxis` + normalised `y`, `VictoryVoronoiContainer` tooltips), Gemini structured output (`responseSchema` OpenAPI subset: `OBJECT`, `ARRAY`, `enum`, `nullable`; keep schemas shallow), Expo SDK 57 (`react-native-svg` 15.15.4 bundled, `victory` web build runs on react-native-web as today).

## Design

### 1. Contract: `chart` enum + optional `chart_spec`

Edge Function response (and `QueryResult` in `frontend/lib/api.ts`) gains:

```ts
chart: "bar" | "line" | "kpi" | "table" | "scatter" | "pie" | "combo" | "stacked_bar"
chart_spec?: {
  x: string;          // category / label / x-metric column
  y: string[];        // 1+ value columns (scatter: exactly 1; pie: 1; stacked: 2+; combo: bar column)
  y2?: string | null; // combo only: right-axis line column
  label?: string | null; // scatter only: point label column (e.g. name)
}
```

Spec is **only** populated for the four new kinds. Legacy kinds keep `chart_spec: null` so every existing path (prompt-regress baseline, cache rows, `mapResult`) is untouched.

### 2. Backend (`supabase/functions/text-to-sql/`)

- `schema_prompt.ts`: extend `CHARTS`; add `ChartSpec` to `GeminiOutput`. Prompt rules, scoped per the drift memory (phrasings listed explicitly, appended at the end of the unnumbered `Rules:` bullet list at `:92-120` so earlier bullets win):
  - *Explicit form*: the question names "scatter", "pie"/"donut"/"share of", "stacked", or "combo"/"bar and line"/"on a second axis" → honour it, shape the SQL for it, fill `chart_spec` with the exact column aliases used in the SQL.
  - *No fit*: two ratio metrics compared per property with no time axis and different units (e.g. ADR vs occupancy) → `scatter`. Parts-of-whole in one period (channel mix, cost breakdown) with no property axis → `pie`; with a property axis → `stacked_bar`.
  - Otherwise unchanged: existing rules and `recommended_chart` behaviour stay as-is. State explicitly that `chart_spec` is null for bar/line/kpi/table.
  - SQL shape per kind: scatter = `name, <x_metric>, <y_metric>` one row per property; pie = `<label>, <value>` ≤ 8 rows; stacked_bar = `name, <part1>, <part2>, ...` wide format; combo = `<x>, <bar_metric>, <line_metric>`.
- `index.ts`:
  - `RESPONSE_SCHEMA`: `recommended_chart` enum extended; add `chart_spec: { type: "OBJECT", nullable: true, properties: { x: STRING, y: ARRAY<STRING>, y2: STRING nullable, label: STRING nullable }, required: [x, y] }`. Not in top-level `required`.
  - Parse validation (`index.ts:295-301`): accept spec only when `chart` is one of the four new kinds and `x`/`y` are non-empty strings; otherwise set `chart_spec = null`.
  - **Post-execution check** (new `validateSpec(spec, rows)` in `sql_guard.ts` or a new `chart_spec.ts`): every referenced column must exist in `rows[0]`; `y`/`y2` columns numeric in the first row; pie ≤ 12 rows; scatter ≥ 3 rows. On failure: `chart_spec = null`, `chart` downgraded (`scatter|pie|combo|stacked_bar → bar`; a `<label>, <value>` result already renders a category bar via inference, so `table` would be a worse fallback for pie) so the frontend takes the legacy inference path. Log a `{"spec_dropped": reason}` line.
  - Cache: `ai_sql_cache.chart` is `text not null` with **no CHECK constraint** (`supabase/migrations/20261015150000_ai_sql_cache.sql:9`); `ai_query_log` has no chart column. The only schema change is `supabase/migrations/<ts>_ai_sql_cache_chart_spec.sql`: `alter table ai_sql_cache add column chart_spec jsonb;`. Write/read it alongside `chart` (`index.ts:409`, `:471`, `:541`, `:560`). Rows written before the change have `chart_spec` null → legacy path, no special handling; the prompt edit changes the cache key anyway, so all rows are effectively flushed on deploy. **Apply locally with `supabase migration up`; prod only via MCP `apply_migration` after explicit confirmation** (AGENTS.md rule). Sequence in prod: migration first, then `/fn-deploy`.
  - Summary pass (`summary_prompt.ts`) unchanged.
- Tests (`deno test`): spec validation cases (missing column, non-numeric, row-count limits, legacy kinds force null), downgrade mapping, `RESPONSE_SCHEMA` enum contains all eight kinds.

### 3. Frontend mapping (`frontend/lib/`)

- `api.ts`: extend `QueryResult` as in §1.
- New `lib/explicitCharts.ts` exporting `mapExplicit(result): ExplicitSeries | null` and the types below; keeps `resultMapping.ts` focused on inference. Reuse from `resultMapping.ts`: `formatByUnit` (already exported, `:128`), `colorFor` (`:95`) and `unitFor` (`:109`) — export the latter two. `unitLabel`/`humanize`/`toNumber`/`isNumeric` do not exist there: implement numeric coercion locally (pattern: `num` in `lib/kpis.ts:100`) and derive series titles from column aliases the same way `resultMapping.ts` does for category keys.

```ts
type ScatterSeries = { kind: "scatter"; key; title; xLabel; yLabel; xUnit; yUnit;
  points: { label: string; x: number; y: number }[] };
type PieSeries     = { kind: "pie"; key; title; unit; slices: { label: string; value: number; pct: number }[] };
type StackedSeries = { kind: "stacked"; key; title; unit; labels: string[];
  parts: { key; title; values: number[]; color: ColorKey }[] };
type DualAxisSeries= { kind: "dual"; key; title; labels: string[];
  bar: { key; title; values; unit; color }; line: { key; title; values; unit; color } };
```

- `mapResult` (`resultMapping.ts:329`): insert **one early branch** after the `rows.length === 0` guard: `if (result.chart_spec) { const ex = mapExplicit(result); if (ex) return { headline: title, facts: explicitFacts(ex), charts: [ex], pair: null, table: tableOf() }; }`. Any mapping failure returns `null` and falls through to today's inference, so the UI never breaks on a bad spec. `MappedResult.charts` union gains the four new types.
- Facts: scatter = top/bottom on y and Pearson-style "higher X tends to higher Y" only if |r| ≥ 0.5; pie = largest slice + share; stacked = largest total + its biggest part; dual = max bar + max line.
- Tests: new `lib/explicitCharts.test.ts` and `lib/resultMapping.test.ts` (node:test, run by `npm test` → `node --test lib/*.test.ts`): each kind maps; missing column → null → legacy path; legacy results with `chart_spec: null` produce identical output to today (snapshot a few fixtures).

### 4. Frontend components (`frontend/components/charts/`)

All follow the conventions of the existing files (theme tokens from `frontend/theme/`, `barRamp` from `lib/color.ts`, responsive width, light/dark). Victory only imported here.

- `ScatterChart.tsx`: `VictoryChart` + `VictoryScatter` + `VictoryVoronoiContainer`/`VictoryTooltip` (label = property name + both values via `formatByUnit`); axes titled from `xLabel`/`yLabel`; points coloured by y-rank via `barRamp`; `VictoryLabel` names only when ≤ 10 points and width ≥ 480, otherwise tooltip only.
- `PieChart.tsx`: standalone `VictoryPie` (donut: `innerRadius`, `padAngle`, `cornerRadius`), `colorScale` from `barRamp` deepest-first, legend as a flat list with value + % (no in-slice labels on narrow widths), slices beyond 8 grouped into "Other" in the mapper.
- `StackedBarChart.tsx`: `VictoryStack` of one `VictoryBar` per part, horizontal when > 6 categories (mirror `CategoryBarChart` orientation rule), legend per part, flat hue per part (same approach as `GroupedBarChart`).
- `DualAxisChart.tsx`: generalise the pattern already in `ScoreComboChart`/`RateVolumeChart`: bars on left axis, line on right, two `dependentAxis` with normalised `y` and `tickFormat` by unit (per Victory docs multi-axis pattern). Do **not** modify `ScoreComboChart`/`RateVolumeChart`; `CATEGORY_COMBOS`/`PAIRS` keep their bespoke rendering.
- `App.tsx:369-381`: add the four `kind` cases; `Grid minWidth` 480 for `scatter|dual|stacked`, 280 for `pie`.

### 5. Docs and tooling

- `AGENTS.md` Design section: one bullet for explicit chart forms and the fallback rule. README "How results map" likewise.
- `/prompt-regress`: baseline should not change (new rules are phrasing-scoped). `run.sh:55-56` diffs only `{question, chart, columns, period_source, error}`, so the extra `chart_spec` response field does not affect the comparison. Run it after the prompt edit; do **not** `--record` unless the only diffs are alias noise (memory: alias renames are regress noise). Add 4 non-baseline spot questions to the plan's verification list rather than the preset baseline.
- `.claude/hooks/post-edit-check.sh` already runs Deno fmt/check + tsc/eslint on edit; hookify warns on prompt/guard edits (expected).

### 6. Metrics glossary (reference doc + prompt vocabulary)

Nothing in the repo explains the business meaning of the columns; Gemini resolves hotelier phrasing ("lead time", "penetration", "A&G", "POM", "comp set", "channel share", "rooms per hour") from training alone.

- New `docs/metrics-glossary.md` (`docs/` does not exist yet): human source of truth. One entry per column in `METRIC_COLUMNS` (`schema_prompt.ts:23+`): meaning for a hotel management company, formula/aggregation rule, unit, direction (higher/lower is better), common synonyms, natural pairings (ADR+rooms_sold, CPOR+occupancy, GOP margin+RevPAR, direct share+revenue). The earlier field walkthrough was not recorded (lost on `/clear`; `.remember/` holds only a one-line note), so author it fresh from `METRIC_COLUMNS` plus STR/USALI conventions. This is its own execution step.
- `schema_prompt.ts`: add a compact `Vocabulary:` block (≈15 lines, ≈400 tokens) after the schema and before `Rules:`: `term, term -> column or formula` only. No prose. Add one `Direction:` line (higher-is-better / lower-is-better lists) exported as `METRIC_DIRECTION` and reused in `summary_prompt.ts` so summaries frame movements correctly.
- Test: extend `schema_prompt_test.ts` so every `METRIC_COLUMNS` entry appears in the glossary doc (read via `Deno.readTextFile`) and every vocabulary term in the prompt maps to a column in `METRIC_COLUMNS`; prevents drift between doc and prompt.
- Cost note: changing `SYSTEM_PROMPT` invalidates `ai_sql_cache` (key hashes the prompt) and requires `/prompt-regress`. Do this in the same prompt edit as §2 so there is one regress run and one cache flush.

## Files

Backend: `supabase/functions/text-to-sql/schema_prompt.ts`, `index.ts`, new `chart_spec.ts` (+ `chart_spec_test.ts`), new migration `supabase/migrations/<ts>_ai_sql_cache_chart_spec.sql`.
Frontend: `frontend/lib/api.ts` (widen `chart` union at `:6`), `frontend/lib/resultMapping.ts` (early branch + export `colorFor`/`unitFor`), new `frontend/lib/explicitCharts.ts` (+ tests), new `frontend/components/charts/{ScatterChart,PieChart,StackedBarChart,DualAxisChart}.tsx`, `frontend/App.tsx`.
Docs: `AGENTS.md`, `README.md`, new `docs/metrics-glossary.md`; `supabase/functions/text-to-sql/summary_prompt.ts` (direction line), `schema_prompt_test.ts`.

## Execution order

1. Backend contract + `chart_spec.ts` validation/downgrade + tests (`/fn-test`).
2. Migration (local `supabase migration up`); wire cache read/write of `chart_spec`.
3. Frontend types + `explicitCharts.ts` + tests (`npm test` in `frontend/`).
4. Components + `App.tsx` `kind` cases and `minWidth` expression (`App.tsx:369`); `npx tsc --noEmit`, `npx expo lint`.
5. Glossary doc + `schema_prompt_test.ts` drift test.
6. Prompt rules + vocabulary block + direction line last (one prompt edit, one cache flush, regress runs against finished code); `/prompt-regress`.
7. AGENTS.md / README bullets.
8. Prod: confirm with user → `apply_migration` → `/fn-deploy` → Vercel deploy.

Sonnet executors per step (model-handoff); Haiku for lookups; review stays here.

## Verification

- `deno test` passes; `node --test lib/*.test.ts` passes; tsc + eslint clean.
- `/prompt-regress`: 9 presets unchanged (chart, columns, period_source).
- Local function served; ask via the UI (or curl with `x-cache-bypass: 1`):
  - "Scatter plot of ADR vs occupancy by property, last 30 days" → `chart: scatter`, spec `{x: adr, y: [occupancy_pct], label: name}`, ScatterChart renders.
  - "Pie chart of channel mix last month" → `pie`, ≤ 8 slices, legend with %.
  - "Stacked bar of departmental costs by property" → `stacked_bar`, one part per `*_cost` column.
  - "Revenue bars with occupancy line by property" → `combo`, dual axis.
  - "Top properties by RevPAR" → still `bar`, `chart_spec: null`, identical render to today.
  - Forced bad spec (unit test and a curl with a hand-edited cached row) → downgrade path renders legacy bars/table, `spec_dropped` logged.
- Cache hit on each new question returns the same `chart`/`chart_spec`.
- `chart-reviewer` agent on the four questions: desktop + mobile, light + dark (needs Expo dev server on :8081).
- `sql-guard-reviewer` on the `index.ts`/`chart_spec.ts`/`schema_prompt.ts` diff before commit.
