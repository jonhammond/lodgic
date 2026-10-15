# NPS and CSAT by segment: ordered, clickable, timeframe-aware drill-down

## Context

The "NPS and CSAT by segment" chip currently round-trips Gemini (`App.tsx:154` → `runQuery` → `resultMapping.ts` `CATEGORY_COMBOS` → `ScoreComboChart`). Gemini decides segment order (arbitrary), nothing is clickable, and the window is whatever SQL Gemini writes. Requested outcome:

1. Segments ordered left→right: Luxury, Upper Upscale, Upscale, Upper Midscale, Midscale.
2. Each segment clickable → second chart below: NPS and CSAT per hotel in that segment (screenshot 1: CSAT % bars left axis, NPS line + markers right axis, hotels alphabetical, legend below).
3. Each hotel bar in the second chart clickable → third chart below: the hotel's CSAT % and NPS over the period, alongside the segment average and the average of the portfolio properties currently selected in the picker (screenshot 2: single 0–100 axis, solid hotel lines, dashed average lines, end-value labels, legend above).
4. Timeframe selector above the first chart: Daily / 30 days / Annualised, same control as RevPAR vs occupancy; default 30 days when the prompt names no range.

Approach: mirror the RevPAR precedent. Route the question to a client-side panel that reads `daily_metrics` + `properties` via the anon client, computes rooms-sold-weighted NPS/CSAT in a pure engine, and renders three stacked charts. Gemini is bypassed for this question only. Decision (confirmed): any other range wording ("last 7 days") falls through to Gemini unchanged.

## Design plan (frontend-design pass)

**Subject.** Guest-sentiment drill-down for a hotel portfolio analyst: compare segments, find the hotel that drags or lifts a segment, then see whether that hotel is converging on or diverging from its peers over time.

**Tokens (reuse, no new palette).**
- CSAT: `t.kpi.guest` (pink). Bars `guest.bar`; selected bar `guest.line`; unselected bars 55 % alpha once something is selected.
- NPS: `t.kpi.market.line` (violet), 2.5 px stroke, 3.5 px dots with `t.bg.card` ring (already in `ScoreComboChart`).
- Trend chart scope encoding (hue = metric, dash = scope, so identity is never colour-alone):
  - hotel: solid 2.5 px + 3 px markers + end label with `paintOrder: "stroke"` halo (pattern at `RevparOccChart.tsx:111-118`)
  - segment average: dashed `6,4`, 2 px, no markers
  - selected-portfolio average: dashed `2,3`, 1.5 px, no markers
- Surfaces/text: `t.bg.card`, `t.text.primary / dim / tick`, `t.border.axis`.
- Type: Instrument Sans 700 13 px chart titles, Instrument Sans 400 10 px category labels, IBM Plex Mono 10/11 px ticks and notes (`fonts`, `tabular` in `theme/tokens.ts`).

**Layout.**
```
┌ panel (gap: space.gap) ─────────────────────────────────────────────┐
│ NPS and CSAT by segment                                   (16px/500) │
│ Rooms-sold-weighted over the latest 30 days to 14 Oct 2026. (13px)   │
│ [ Daily | 30 days | Annualised ]            ← SegmentedControl        │
│ ┌ Card 1: CSAT and NPS by segment ────────── "% of 5-pt CSAT · NPS" ┐│
│ │ 100%(5.0) ┤  ▇      ▇      ▇      ▇      ▇            80 │        ││
│ │           ┤   ●──────●──────●──────●──────●           60 │        ││
│ │   0%      └──────────────────────────────────────────  0 │        ││
│ │           Luxury  Upper   Upscale  Upper   Midscale   ← Pressable ││
│ │                   Upscale          Midscale              label row││
│ │ ■ CSAT % (left axis)  ─ NPS score (right axis)                    ││
│ └───────────────────────────────────────────────────────────────────┘│
│ ┌ Card 2: Hotels in Upscale ────────────────── "3 hotels, 30 days" ┐│ when a segment
│ │ same combo chart, hotels alphabetical, Pressable label row        ││ is selected
│ │ [All segments]                                                    ││
│ └───────────────────────────────────────────────────────────────────┘│
│ ┌ Card 3: Palm Grove Hotel, last 30 days ─── "daily, rooms-weighted"┐│ when a hotel
│ │ ─ Hotel CSAT %  ─ Hotel NPS  ╌ Upscale avg  ┄ Selected portfolio  ││ is selected
│ │ 100 ┤                                           ━━━━━━━━━━●  92%  ││
│ │  80 ┤   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╌╌╌╌╌╌╌╌╌╌╌╌  84%  ││
│ │  60 ┤         ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌━━━━━━━━●  70   ││
│ │   0 └──────────────────────────────────────────────────────────── ││
│ │      15 Sep        22 Sep        29 Sep        6 Oct      14 Oct  ││
│ │ [All hotels]                                                      ││
│ └───────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```
Left-aligned throughout; cards full width (not `Grid`), so the charts stack on every width. Narrow (<360 px) uses the existing `NARROW_PAD`; the trend legend wraps to two rows.

**Principles.**
- The memorable element is the category label row acting as the control in cards 1 and 2: names are real buttons under the bars (whole-slot hit target, hover underline, selected = primary text + 2 px underline in the bar colour). No dropdowns, no chip strips.
- Selection reads in the data, not in chrome: selected bar saturates, siblings recede. Nothing animates except the next card appearing.
- The trend chart is one axis. CSAT % and NPS both live on 0–100 (NPS is seeded 20–75; the domain extends to the data minimum if NPS goes negative). Hue says which metric, dash says whose.
- Copy is sentence case, one job per line: title, one explanatory sentence, control, chart. Cards 2 and 3 each carry one text button that steps back up ("All segments", "All hotels").

**Self-critique vs the generic default.** A generic pass would add a dropdown filter row, stat tiles and a six-colour ramp for the trend. Dropped all three: the selector mirrors RevPAR exactly, clickable labels replace dropdowns, no tiles were requested, and the trend uses two hues × three dashes instead of a ramp so "hotel vs peers" is legible in print and for colour-blind readers. Deviation from the dataviz skill's "no dual axis" rule in cards 1 and 2 is deliberate: the brief's screenshot and the existing `ScoreComboChart` both specify CSAT-left / NPS-right, and both axes already share Victory's 0–100 domain with NPS mapped by `niceCeil` steps. Card 3 follows the rule (single axis, as in screenshot 2).

## Implementation

### 1. `frontend/lib/properties.ts` — expose segment
- `Property` gains `segment: string`; select `id,name,location,total_rooms,segment`. Additive; `PropertyPicker`, `RevparOccPanel` unaffected.

### 2. `frontend/lib/npsCsat.ts` — question routing + fetch
- `isNpsCsatQuestion(text): Timeframe | null`. Regex, case-insensitive, anchored:
  - head: `(nps (and|&|vs\.?|versus|/) csat | csat (and|&|vs\.?|versus|/) nps) by segment`
  - optional tail after `[,:]? (for|over|in)?`:
    - `yesterday|today|daily|latest day|last day` → `"daily"`
    - `(the )?(last|past|trailing) 30 days|30 days|this month|month to date|mtd` → `"mtd"`
    - `(the )?(last|past|trailing) (365 days|12 months|year)|annual(i[sz]ed)?|yearly|this year|year to date|ytd` → `"ytd"`
  - no tail → `"mtd"`; any other tail → `null` (Gemini path).
- `fetchNpsCsatData(now = new Date())` → `{ rows: GuestRow[], latestDate }`, `GuestRow = { property_id, metric_date, rooms_sold, nps, csat }`. Copy the paging loop from `revparOcc.ts:23-51` (365-day window, `.range()` pages of 1000, `n0` coercion). Optional tidy: lift that loop into `lib/dailyMetrics.ts` `fetchDailyMetrics<T>(columns, map)` and have `revparOcc.ts` call it; skip if it widens the diff beyond taste.

### 3. `frontend/lib/npsCsatEngine.ts` — pure, node-tested
- `SEGMENT_ORDER = ["luxury","upper_upscale","upscale","upper_midscale","midscale"] as const`; `SEGMENT_LABEL` → "Luxury", "Upper Upscale", "Upscale", "Upper Midscale", "Midscale".
- Export `windowDates(dates, timeframe, latestDate): Set<string>` extracted from `revparEngine.ts:52-56` (daily → `[latestDate]`, else latest `DAYS[tf]` distinct dates ≤ latest). `baseInputs` calls it; behaviour unchanged.
- `weighted(rows): { nps, csat, roomsSold, days }` — `sum(x*rooms_sold)/sum(rooms_sold)` exactly as `schema_prompt.ts:86`; zero rooms → 0.
- `propertyScores(rows, properties, timeframe, latestDate): PropertyScore[]` `{ id, name, segment, nps, csat, roomsSold, days }`, sorted by name.
- `segmentScores(scores): SegmentScore[]` in `SEGMENT_ORDER`, weighted by `roomsSold`; segments with no properties omitted (order preserved). `{ segment, label, nps, csat, hotels, roomsSold }`.
- `comboSeries(labels, nps[], csat[], title, key): ComboSeries` → `bar.values = csat*20`, `bar.raw = csat`, `bar.color "guest"`, `line.color "market"` (same shape `resultMapping.ts:495-502` builds).
- `trendBuckets(rows, timeframe, latestDate): { key: string; label: string; dates: Set<string>; partial: boolean }[]`:
  - `daily` and `mtd`: one bucket per date over the latest 30 distinct dates (Daily still shows the trailing 30 days for context; the header says so — assumption, see Verification 5).
  - `ytd`: one bucket per calendar month across the latest 365 distinct dates, label `MMM yyyy`, last bucket `partial` when the month is incomplete.
- `guestTrend(rows, properties, buckets, hotelId, segment, selectedIds): GuestTrend` → `{ labels, partialLast, hotel: {csat[], nps[]}, segment: {...}, portfolio: {...} }` each per-bucket `weighted(...)` over the matching property set (hotel; all properties in `segment` ∩ selected; all selected). `null` entries for buckets with zero rooms so Victory breaks the line.

### 4. `frontend/components/charts/ScoreComboChart.tsx` — selectable mode (additive props)
- Props: `series`, `selectedIndex?: number | null`, `onSelect?: (i: number) => void`, `note?: string`, `footer?: ReactNode`.
- When `onSelect` is set:
  - Hide Victory x tick labels (`tickFormat={() => ""}`), shrink `pad.bottom` to 10, and render a label row of `Pressable` cells below the SVG: left spacer `pad.left`, right spacer `pad.right`, each cell `flex: 1`, `accessibilityRole="button"`, `accessibilityLabel={\`Show ${label}\`}`, `accessibilityState={{ selected }}`, `Text numberOfLines={2}` in `X_TICK_FONT`, `t.text.dim` → `t.text.primary` when selected/hovered, 2 px underline `View` in `barColor.bar` when selected, cursor pointer on web.
  - Bar fill: `selectedIndex === i ? barColor.line : barColor.bar`, `fillOpacity 0.55` on non-selected bars while `selectedIndex != null`; `events={[{ target: "data", eventHandlers: { onClick: (_, p) => onSelect(p.datum.x - 1) } }]}` on `VictoryBar` plus `style.data.cursor: "pointer"` (Victory events guide; `VictoryVoronoiContainer` handles move events only, so bar `onClick` still fires).
- Without `onSelect` the component renders exactly as today (Gemini combo path unchanged).

### 5. `frontend/components/charts/GuestTrendChart.tsx` — new, card 3
- Props `{ title, note, trend: GuestTrend, hotelName, segmentLabel, footer?: ReactNode }`.
- `VictoryChart` with `VictoryVoronoiContainer voronoiDimension="x"` crosshair tooltip listing the six values for the hovered bucket (reuse `TrendLineChart.tsx:180-215` hover plumbing: wrapping `Pressable` for `onHoverOut`, `onActivated` → hover index, `VictoryTooltip` styled as in `ScoreComboChart.tsx:131-140`).
- Single left `VictoryAxis` 0–100 (`niceDomain` from `charts/scale.ts`, extended below 0 only if NPS is negative), horizontal grid `t.border.axis`, x axis ticks via `pickTickValues` (`charts/ticks.ts`) so 30 daily labels thin to ~5.
- Six `VictoryLine`s in the dash/hue scheme above; `VictoryScatter` markers on the two hotel lines only; `VictoryLabel` end labels for the hotel lines (`92%`, `70`) with halo; last bucket drawn with `partialLast` styling from `TrendLineChart` if `partial`.
- Legend row above the plot (as in screenshot 2): swatch = 16×3 line sample drawn with the series dash via a `View` border style (`borderStyle: "dashed"/"dotted"` on web) — six items, wrapping.
- Export rows for the panel: one row per bucket `{ period, hotel_csat, hotel_nps, segment_csat, segment_nps, portfolio_csat, portfolio_nps }`.

### 6. `frontend/components/guest/NpsCsatPanel.tsx` (+ `index.ts`)
- Props `{ properties, selectedIds, initialTimeframe: Timeframe, onRowsChange }` — mirrors `RevparOccPanel` (`components/revpar/RevparOccPanel.tsx:80-140`).
- State: `data` (loading/error/ready with Retry via `attempt`), `timeframe` (init from prop), `segment: Segment | null`, `hotelId: string | null`.
- Memos: `selected` properties → `propertyScores` → `segmentScores`; `hotels = scores.filter(s => s.segment === segment)`; `buckets` → `guestTrend` for `hotelId`. Resets: segment change clears `hotelId`; picker change that removes the segment or hotel clears the dependent selection; timeframe change keeps both.
- Header: title "NPS and CSAT by segment"; body `Rooms-sold-weighted over the latest ${daysUsed} days to ${latestDate}.` (Daily → `for ${latestDate}; trend shows the trailing 30 days.`).
- `SegmentedControl label="Timeframe"` with the same `TIMEFRAMES` as RevPAR (`Daily`, `30 days`, `Annualised`); move that constant to `revparEngine.ts` or duplicate (3 lines).
- Card 1: `ScoreComboChart` with `onSelect`/`selectedIndex` over segments, note `"% of 5-point CSAT · NPS -100..100"`.
- Card 2 (when `segment`): `ScoreComboChart` title `Hotels in ${label}`, note `${n} hotels, ${timeframeLabel}`, hotels alphabetical, `onSelect` → `hotelId`, footer text button "All segments" → `setSegment(null)`.
- Card 3 (when `hotelId`): `GuestTrendChart` title `${hotelName}, ${timeframeLabel}`, note `daily` / `monthly` + `rooms-sold-weighted`, footer "All hotels" → `setHotelId(null)`.
- `onRowsChange`: card 3 rows when a hotel is selected (`nps-csat-${slug(hotel)}-${timeframe}.csv`), otherwise property-level rows `{ segment, property, nps, csat, rooms_sold, days }` (`nps-csat-by-segment-${timeframe}.csv`).
- Loading: `Skeleton`; error: message + Retry `Button` (copy `RevparOccPanel.tsx:169-193`).

### 7. `frontend/App.tsx` — route the question
- `State.panel: "revparOcc" | "npsCsat" | null`; add `panelTimeframe: Timeframe`; `OPEN_PANEL` carries `{ panel, timeframe? }` (reducer at `App.tsx:109-110`).
- `submit` (`App.tsx:260-263`): after the RevPAR check, `const tf = isNpsCsatQuestion(text); if (tf) { dispatch({ type: "OPEN_PANEL", panel: "npsCsat", timeframe: tf }); return; }`.
- Render (`App.tsx:324-331`): `panel === "npsCsat" ? <NpsCsatPanel key={panelSeq} initialTimeframe={panelTimeframe} … /> : <RevparOccPanel … />`.
- `SUGGESTIONS` text unchanged.

### 8. Tests — `frontend/lib/npsCsatEngine.test.ts`, `frontend/lib/npsCsat.test.ts` (node:test, like `revparEngine.test.ts`)
- Segment output order equals `SEGMENT_ORDER` regardless of input order; empty segments omitted.
- Weighting: two days with rooms 10/30 and nps 40/80 → 70; zero rooms → 0.
- Windows: daily uses only `latestDate`; mtd the latest 30 distinct dates; ytd all available when fewer than 365.
- Buckets: mtd → 30 daily buckets; ytd → calendar months, last `partial` when `latestDate` is not month-end.
- `guestTrend`: hotel series equals its own rows; segment series excludes unselected properties; portfolio series covers all selected; zero-rooms bucket → `null`.
- Parser: chip text → `"mtd"`; `"… by segment, yesterday"` → `"daily"`; `"… last 12 months"` → `"ytd"`; `"… last 7 days"` → `null`; `"CSAT vs NPS by segment"` → `"mtd"`; unrelated text → `null`.
- `windowDates` extraction: existing `revparEngine.test.ts` still passes.

## Verification
1. `cd frontend && npm test && npx tsc --noEmit && npx expo lint` (post-edit hook also runs these).
2. `npx expo start --web`; click the chip: panel opens on **30 days**, segments in the fixed order, no request to the Edge Function (devtools network).
3. Click "Upscale": card 2 shows the three upscale hotels alphabetical, pink bars, violet NPS line + markers, right-axis NPS ticks; selected segment bar saturated, others dimmed; "All segments" clears it.
4. Click a hotel bar or its label: card 3 shows six lines on one 0–100 axis, hotel lines solid with markers and end labels, segment average dashed, portfolio average dotted; hover tooltip lists all six values; "All hotels" clears it.
5. Switch Daily / 30 days / Annualised: all cards recompute; Annualised card 3 shows 12 monthly points with the last one marked partial; Daily keeps the trailing-30-day trend and says so in the header.
6. Deselect properties in the picker: portfolio average in card 3 changes; removing the selected hotel clears card 3; removing a whole segment removes it from card 1 and clears cards 2–3.
7. Type "NPS and CSAT by segment, yesterday" → panel opens on Daily. Type "…, last 7 days" → Gemini path, old `ScoreComboChart` (no selector, nothing clickable).
8. Export CSV: property rows normally, trend rows when a hotel is selected.
9. `chart-reviewer` agent on the chip question at desktop and 360 px, light and dark, with a segment and a hotel selected.
10. `/prompt-regress` unaffected (it calls the Edge Function directly; the chip's baseline entry stays valid for free-text questions that still reach Gemini).
