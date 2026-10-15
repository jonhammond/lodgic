# RevPAR vs Occupancy — interactive portfolio panel


## Context

Pressing the preset chip **"RevPAR vs occupancy"** sends the text to Gemini, which returns one portfolio row `{avg_occupancy, avg_revpar}` with `chart:"kpi"`. `mapResult` (`frontend/lib/resultMapping.ts:274-290`) keeps only the first numeric column of a single-row kpi result, so the UI shows a headline sentence and nothing else (screenshot 13.51.08).

Goal: the chip opens a deterministic, interactive **portfolio comparison panel** (mockup 14.01.01, reshaped per the decisions below): timeframe toggle, three portfolio stat cards, a sortable leaderboard table, a demand-shift slider, and a horizontal chart ranking the selected properties on RevPAR and occupancy with tier colouring.

Decisions already made with the user:
- **Data source:** chip bypasses Gemini; frontend reads `daily_metrics` + `properties` directly via the anon client (same path `lib/kpis.ts` uses). No Edge Function or migration changes.
- **Engine inputs:** period actuals. Daily = latest day's row; MTD = last 30 days; YTD = all available history (DB holds ~90 days) with the day multiplier 365.
- **Chart form:** aligned twin panels (shared property rows; RevPAR bars left, occupancy bars right). No dual-axis overlay.
- **Toggle scope:** panel-only. `KpiSections` untouched.

Facts from exploration that shape the design:
- `properties`: `id,name,location,total_rooms,segment` (anon SELECT). `daily_metrics`: `property_id,metric_date,rooms_sold,total_revenue,occupancy_pct,revpar,adr` (+ many others; anon SELECT via RLS). No `rooms_available` column; capacity = `properties.total_rooms`. 10 properties, 2225 rooms, ~90 days of history, generated nightly by pg_cron.
- Selected properties live in App state `selectedIds` (`frontend/App.tsx:49`), toggled by `PropertyPicker`; `propertyIds` is `null` when all are selected (`App.tsx:174`).
- Existing horizontal Victory bar pattern with inverted rows, wrapped name axis, direct value labels: `frontend/components/charts/CategoryBarChart.tsx`. Shared helpers: `niceDomain`, `tickLabel` (`charts/scale.ts`), `formatCurrency/formatPercent/formatNumber` (`charts/format.ts`), `formatExact/formatByUnit` (`lib/resultMapping.ts:101-111`).
- Stat card with sparkline: `components/KpiCard.tsx` (`label,value,delta,priorLabel,series,colors`). `Sparkline` renders an empty svg for <2 points, so it is safe to reuse.
- Theme: `theme/tokens.ts` — `t.kpi.revpar.bar` (violet), `t.kpi.occupancy.bar` (pink), `t.kpi.adr.bar` (green), `t.delta.down` (red), `t.trend.volume` (neutral bar), `t.text.*`, `radius`, `space.breakpoint=640`, `type`, `tabular`.
- No segmented control or slider component exists; no slider dependency installed. `victory` 37.3.6, `react-native-web` 0.21, Expo 57, React 19. No test runner in `frontend/`; Node 24 on host (native TS type stripping, `node --test`).
- Victory API (context7, v37): `VictoryChart horizontal`, `VictoryBar barWidth/cornerRadius/labels/labelComponent={<VictoryLabel dx textAnchor/>}`, per-datum `style.data.fill: ({datum}) => ...`, `VictoryAxis dependentAxis tickValues tickFormat`, `VictoryLine` for a reference line, `VictoryContainer responsive={false}` for fixed pixel sizing (the codebase already passes explicit `width/height`).

## Design

### Layout (desktop ≥640px; narrow stacks each row vertically)

```
┌ ResultBlock ──────────────────────────────────────────────────────────────┐
│ RevPAR vs occupancy · 10 properties · Month to date (30 days)              │
│ Portfolio RevPAR $183.66 at 74.8% occupancy.                 [one-line headline]
│                                                                            │
│ [Daily | MTD | YTD]   Sort by [RevPAR | Occupancy]   Market demand ──●── 100% │
│                                                                            │
│ ┌ 74.8% Occupancy ┐ ┌ $245.63 ADR ┐ ┌ $183.66 RevPAR ┐   (KpiCard ×3, Grid) │
│                                                                            │
│ ┌ Chart card ──────────────────────────────────────────────────────────┐   │
│ │ Property          RevPAR                      Occupancy             │   │
│ │ Sovereign Manor   ████████████ $286.10        ███████   55.0%       │   │
│ │ Azure Bay Villas  ███████████  $275.40        ████████  61.2%       │   │
│ │ …                 ¦ target $183 (dashed)                            │   │
│ │ Metro Center      ████         $103.00        █████████ 71.0%       │   │
│ │                   $0        $300              0%        100%        │   │
│ │ ■ Above target  ■ Below target  ■ Critical (<85% of target)         │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│ ┌ Leaderboard ─────────────────────────────────────────────────────────┐   │
│ │ Property        Rooms   Occupancy ▾   ADR      RevPAR ▾   Tier       │   │
│ │ Sovereign Manor    60      55.0%     $520.00   $286.00   ● Above     │   │
│ │ …                                                                    │   │
│ │ Portfolio        2225      74.8%     $245.63   $183.66               │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
```

Design principles (frontend-design + dataviz skills):
- One filter row above everything it scopes; all three sections re-compute from the same engine output so numbers always agree.
- The chart is the hero; controls, cards, and table stay quiet (neutral segmented controls, no blue fills). Boldness is spent on tier colour in the RevPAR panel only. Occupancy bars are a single neutral hue.
- Status colour never alone: tier also appears as a legend row, a dashed target line, and a `● Tier` text cell in the table.
- Thin bars (16px, 2px corner), direct value labels at bar ends (mono 10px, text ink, never series colour), recessive axes. Existing `CategoryBarChart` conventions.
- Copy in sentence case, plain verbs: "Daily", "Month to date", "Year to date", "Sort by", "Market demand", "Above target", "Below target", "Critical".

### Calculation engine (`frontend/lib/revparEngine.ts`, pure, no RN imports)

```ts
export type Timeframe = "daily" | "mtd" | "ytd";
export const DAYS: Record<Timeframe, number> = { daily: 1, mtd: 30, ytd: 365 };

type DailyRow = { property_id; metric_date; rooms_sold; total_revenue; occupancy_pct };
type PropertyBase = { id; name; segment; rooms; occupancy /*0..1*/; adr; days /*rows used*/ };
type PropertyCalc = PropertyBase & { roomsAvailable; roomsSold; revenue; revpar; tier: "above"|"below"|"critical" };
type Portfolio = { rooms; roomsAvailable; roomsSold; revenue; occupancy; adr; revpar; target };

baseInputs(rows, properties, timeframe, latestDate): PropertyBase[]
  window = daily → [latestDate]; mtd → latest 30 dates; ytd → latest 365 dates (all 90 available)
  per property: occupancy = Σrooms_sold / (rooms × nDaysInWindowWithData); adr = Σtotal_revenue / Σrooms_sold (0 if no sales)
compute(base, timeframe, demandShift /*0.5..1.5*/): { rows: PropertyCalc[]; portfolio: Portfolio }
  occ = min(1, occupancy × demandShift)
  roomsAvailable = rooms × DAYS[timeframe]
  roomsSold = roomsAvailable × occ
  revenue = roomsSold × adr
  revpar = revenue / roomsAvailable   (== adr × occ)
  portfolio = sums → occupancy = ΣroomsSold/ΣroomsAvailable; adr = Σrevenue/ΣroomsSold; revpar = Σrevenue/ΣroomsAvailable
  target = portfolio.revpar; tier: revpar ≥ target → above; < 0.85×target → critical; else below
sortRows(rows, key: "revpar"|"occupancy"|"adr"|"rooms"|"name", dir)
```
Portfolio figures are room-weighted (ratios of sums), matching `portfolio_daily` and `schema_prompt.ts` conventions; the card label says "Portfolio occupancy" rather than "average" to stay honest. The YTD note reads "annualised from N days of data" when N < 365.

### Data (`frontend/lib/revparOcc.ts`)

`fetchRevparOccData(now = new Date())` → `{ rows: DailyRow[]; latestDate: string }`. One paged `daily_metrics` select (`property_id,metric_date,rooms_sold,total_revenue,occupancy_pct`), `gte metric_date now-365d`, ordered, `range()` paging copied from `lib/kpis.ts:415-429`. Fetch **all** properties once; filter by `selectedIds` in memory so picker changes are instant. Properties come from App state (`properties`), extended to also select `segment` in `lib/properties.ts` (needed for the table's segment column? — **not** needed by the requirement; skip segment, keep `Property` type unchanged).

### State and routing (`frontend/App.tsx`)

- Add `panel: "revparOcc" | null` to `State`; actions `OPEN_PANEL` (sets `panel`, clears `result`, `status:"idle"`) and existing `SUCCESS` clears `panel`.
- In `submit`: if `isRevparOccQuestion(text)` (`/^\s*revpar\s+(vs\.?|versus)\s+occupancy\s*$/i`, exported from `lib/revparOcc.ts`), dispatch `OPEN_PANEL` and return before `runQuery`. The selection-empty guard still applies.
- `ResultBlock` renders `<RevparOccPanel properties selectedIds />` when `state.panel` is set, instead of `AnswerCard` + charts + table. `mapped` is null in this mode.
- Header: `canExport` also true in panel mode (exports the leaderboard rows via existing `downloadCsv`, filename `revpar-vs-occupancy-<timeframe>.csv`); `canToggleSql` stays false (no SQL). The panel exposes its current rows through a ref or a small `onRowsChange` callback — use `onRowsChange` to keep it simple.

### Components

| File | Purpose |
|---|---|
| `components/SegmentedControl.tsx` | Generic `{options:{key,label}[], value, onChange, label}`; `Pressable` row with `accessibilityRole="radio"` + `accessibilityState.checked`; track `t.bg.chip`, selected segment `t.bg.card` + `t.border.strong`, `radius.input`; `type.label14`. Used twice. |
| `components/RangeSlider.tsx` | `{label, value, min, max, step, format, onChange}`. Web: native `<input type="range">` rendered via `react-native-web`'s `unstable_createElement`, `accentColor: t.accent.blue`, `aria-label`, keyboard-native. Non-web fallback: `−`/`+` `Button`s. Value readout in mono tabular text. |
| `components/revpar/RevparOccPanel.tsx` | Owns `timeframe` ("mtd" default), `sort` (`{key:"revpar",dir:"desc"}`), `demandShift` (1.0), fetch status. `useEffect` fetch on mount; `useMemo` engine over `(rows, properties, selectedIds, timeframe, demandShift)`; renders header + filter row + cards + chart + table; loading uses `Skeleton`, errors reuse the `AnswerCard` error style text. |
| `components/revpar/RevparOccCards.tsx` | Three `KpiCard`s in `Grid minWidth={220}`: occupancy (`t.kpi.occupancy`), ADR (`t.kpi.adr`), RevPAR (`t.kpi.revpar`). `series` = per-day portfolio value over the window (computed from rows, so the sparkline is real data). `delta` = change vs demandShift 1.0 when the slider ≠ 100%, `priorLabel:"baseline"`; otherwise null. |
| `components/charts/RevparOccChart.tsx` | Twin horizontal Victory panels in one `Card`. Left chart: name axis (reuse `wrapLabel`, `WIDE/NARROW` gutters, `ROW_H`) + RevPAR bars, fill by tier, `VictoryLine` dashed vertical reference at `target`, direct `$` labels. Right chart: no name axis, occupancy bars in `t.trend.volume`, domain `[0,1]`, direct `%` labels. Same `height`, same `data.x = n - i`, rows follow `sort`. Width split ≈ 55/45 after the name gutter; `<480px` stacks the two panels with the name axis on both. Legend row below (three swatches + text). |
| `components/revpar/RevparOccTable.tsx` | Leaderboard: `Property · Rooms · Occupancy · ADR · RevPAR · Tier`; every numeric header is a `Pressable` with `accessibilityRole="button"` and a `▴/▾` glyph on the active column; clicking toggles dir (`Occupancy` and `RevPAR` are the ones the requirement names; others sort too at no cost). Footer row = portfolio totals. Styling mirrors `PropertyTable` rows (`t.border.row`, mono tabular numerics, `radius.card`). Rows = selected properties only. |

Shared helpers extracted from `CategoryBarChart.tsx` into `components/charts/rows.ts`: `wrapLabel`, `ROW_H`, `ROW_H_WRAPPED`, `BAR_W`, `WIDE`, `NARROW`, `LABEL_FONT`, `VALUE_CHAR_W`. `CategoryBarChart` imports them (behaviour unchanged).

Sort semantics: the "Sort by" segmented control and the table headers write the same `sort` state; both the chart rows and the table follow it. Default is RevPAR descending, which satisfies "chart sorted automatically by highest RevPAR".

### Theme (`frontend/theme/tokens.ts`)

Add `tier: { above: string; below: string; critical: string }` to `Palette` and both palettes:
- dark: `above: accents.violet` (as `t.kpi.revpar.bar`), `below: "#5b6670"` (`trend.mid`), `critical: delta.down "#ff8fa8"`.
- light: `above: "#7b57c8"`, `below: "#aab3bb"`, `critical: delta.down "#c4204f"`.
Validate with the dataviz script before committing:
`node /private/tmp/claude-501/bundled-skills/2.1.301/50c75913d8a059752c382a813c7f48fe/dataviz/scripts/validate_palette.js "#7b57c8,#aab3bb,#c4204f" --mode light` and the dark triple with `--mode dark`; adjust `below` to the nearest passing neutral if the normal-vision floor fails.

### Docs

- `AGENTS.md`: Stack bullet — seed is now 10 properties × 90 days; Design bullet — add the RevPAR vs occupancy panel sentence (chip bypasses Gemini, client-side engine, twin-panel chart).
- `.claude/skills/prompt-regress/questions.json` keeps the question (the Edge Function path still works for typed variants); no baseline change.

## Implementation steps

0. Plan lives in `RevPARvsOccPlan.md` (this file).
1. `lib/revparEngine.ts` + `lib/revparEngine.test.ts` (TDD, `node --test lib/revparEngine.test.ts`; Node 24 strips types natively). Cases: daily/mtd/ytd windows, truncated history, demand clamp at 100%, zero-sales ADR, portfolio weighting, tier cut-offs, sort stability. Add `"test": "node --test lib/*.test.ts"` to `package.json` scripts.
2. `lib/revparOcc.ts`: fetch + `isRevparOccQuestion`.
3. `theme/tokens.ts` tier tokens; run the palette validator.
4. `components/charts/rows.ts` extraction; `CategoryBarChart.tsx` imports it (`tsc` clean).
5. `SegmentedControl.tsx`, `RangeSlider.tsx`.
6. `RevparOccCards.tsx`, `RevparOccTable.tsx`, `charts/RevparOccChart.tsx`.
7. `RevparOccPanel.tsx`; wire `App.tsx` state/routing/export.
8. `AGENTS.md` updates.

Execution per model-handoff: steps 1–7 as Sonnet executor subagents (1→2→3/4/5 parallel→6 parallel→7), each ending with `npx tsc --noEmit` and `npx expo lint`; review on the main session.

## Verification

- `cd frontend && npx tsc --noEmit && npx expo lint && npm test` (the PostToolUse hook also runs tsc + eslint on every edit).
- Palette validator passes for the tier triple in both modes.
- Manual, with `npx expo start --web` on :8081: press the chip → panel renders without a network call to the Edge Function (check Network tab); switch Daily/MTD/YTD → rooms available = rooms × 1/30/365 in the footer; slider to 120% → occupancy rises, capped at 100%, cards show "+x% vs baseline"; sort by Occupancy → chart rows and table reorder together; header click toggles direction; deselect properties in the picker → chart, cards, and table shrink to the selection; Export downloads the leaderboard CSV.
- `chart-reviewer` agent on "RevPAR vs occupancy" at desktop and 390px widths, light and dark: no label collisions at the bar ends, name axis wraps to ≤2 lines, legend and target line legible.
- Regression: another preset (e.g. "ADR by property, last 30 days") still routes through Gemini and renders as before; `/prompt-regress` unchanged.
