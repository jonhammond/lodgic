# Shading plan: ranked single-hue ramp for single-metric horizontal bars

## Context

Single-metric category results (Total Revenue by property, Direct booking ratio by property, ADR by property, …) render in `frontend/components/charts/CategoryBarChart.tsx` as a horizontal bar chart in one KPI hue. The chart already intends a sequential ramp, but it is implemented as `fillOpacity` from 0.9 to 1.0 by value (`MIN_ALPHA`, lines 12-14 and 96-101), which is visually a flat colour: every bar in the screenshot reads as the same blue.

Requested outcome: bars are shades of the metric's hue, darkest at the top and lightest at the bottom, so rank is legible from colour as well as length.

Design-method note (dataviz skill): colouring nominal bars by value re-encodes what length already shows. The brief asks for it explicitly, so the ramp is treated as a deliberate ordinal emphasis channel, kept within a readable lightness band and with value labels remaining the authoritative encoding.

## Design intent

- The ramp is the one place colour carries emphasis on this card. Everything else stays as is: text ink for value labels, recessive axes, no legend (single series).
- Shade is assigned by **rank of value** (dense rank, ties share a shade), not by row position. SQL for "by property" questions returns descending order, so rank 0 is the top row and the ramp reads dark→light top→bottom; if a result ever arrives unsorted, shade still tracks magnitude rather than becoming noise. Row order is not changed by the chart (the summary and SQL output stay consistent with what is drawn).
- Ramp endpoints are derived from the existing KPI hue, so every KPI colour (`t.kpi[color].bar`) gets a ramp without hand-listing hexes. Interpolation is linear in sRGB between a "deep" and a "faint" endpoint; `n` bars get `n` evenly spaced steps (n = 1 → the base hue).
- Mode-specific anchors (sequential ramps flip anchor in dark):
  - **Light:** deep end = hue mixed 20 % toward `#000`; faint end = hue mixed 50 % toward `t.bg.card` (`#ffffff`).
  - **Dark:** deep end = the hue itself (darkening on a dark card loses contrast); faint end = hue mixed 40 % toward `t.bg.card` (`#2a3138`). The bottom bar is dimmer rather than literally paler, which keeps emphasis at the top.
- Reference instance, revenue blue, 10 rows:

  | mode | top (rank 0) | bottom (rank 9) | bottom contrast vs card |
  |---|---|---|---|
  | light | `#264b92` | `#98afdb` | ≈ 2.2 : 1 |
  | dark | `#4c7dd9` | `#3e5f99` | ≈ 2.1 : 1 |

  Both bottoms clear the ordinal-ramp light-end floor (≥ 2 : 1). The sub-3 : 1 marks are relieved by the existing per-bar value labels in `t.text.primary`.
- Geometry untouched: `ROW_H` 26 / `BAR_W` 16 already leaves a 10 px surface gap between bars; `cornerRadius` stays.

## Changes

### 1. `frontend/lib/color.ts` (new, pure, no deps)

```ts
export function hexToRgb(hex: string): [number, number, number]
export function rgbToHex(rgb: [number, number, number]): string
export function mix(a: string, b: string, t: number): string          // sRGB lerp, t ∈ [0,1]
export function relativeLuminance(hex: string): number                // WCAG
export function contrast(a: string, b: string): number                // WCAG ratio
export function denseRankDesc(values: number[]): number[]             // ties share a rank
export function barRamp(hue: string, surface: string, scheme: "light" | "dark", n: number): string[]
```

`barRamp` returns `n` hexes from deep → faint using the anchors above (constants `LIGHT = { deepen: 0.2, fade: 0.5 }`, `DARK = { deepen: 0, fade: 0.4 }` live in this file with a comment explaining the contrast floor). Reject 8-digit hex input (the `barPartial` alpha tokens are not used here).

### 2. `frontend/components/charts/CategoryBarChart.tsx`

- Delete `MIN_ALPHA` and its comment (lines 12-14) and the `fillOpacity` style (lines 98-100).
- Read `scheme` from `useTheme()` alongside `t`.
- Compute once per render:
  ```ts
  const ranks = denseRankDesc(values);
  const ramp = barRamp(hue, t.bg.card, scheme, Math.max(...ranks) + 1);
  const data = values.map((y, i) => ({ x: n - i, y, fill: ramp[ranks[i]] }));
  ```
- Style: `data: { fill: ({ datum }) => datum.fill }`. Victory accepts a datum function for `fill`; typing follows the existing `fillOpacity` callback pattern.

### 3. Scope guards (no change, confirm while implementing)

- `GroupedBarChart` (2-3 metrics, categorical identity) and `ScoreComboChart` keep flat hues; the ramp is only for the single-series path produced by `resultMapping.ts` `kind: "category"` with one series.
- Table `revenueBar` / `adrBar` and `barPartial` tokens are untouched.

### 4. `frontend/lib/color.test.ts` (new; picked up by `npm test` → `node --test lib/*.test.ts`)

- `mix` endpoints and midpoint; `hexToRgb`/`rgbToHex` round-trip.
- `denseRankDesc([5, 9, 5, 1])` → `[1, 0, 1, 2]`.
- For every distinct `kpi[*].bar` hue in `dark` and `light` palettes (import `tokens.ts`), with `n = 10`:
  - luminance is strictly monotone from rank 0 → 9 (decreasing in light, decreasing in dark);
  - `contrast(ramp[n-1], t.bg.card) >= 2.0`;
  - `contrast(ramp[0], t.bg.card) >= 3.0`.
- `n = 1` returns `[hue]` in dark and the deepened step in light; `n = 2` returns the two anchors.

### 5. Docs

- `AGENTS.md` Design section: add one clause after "kpi/bar/trend line/table": single-metric bars take a ranked single-hue ramp (`barRamp` in `lib/color.ts`, darkest at the top).
- No `SHADING_PLAN.md` edit beyond creating it with this content.

## Verification

1. `cd frontend && npm test` — new colour tests green alongside `revparEngine.test.ts`.
2. `npx tsc --noEmit` and `npx expo lint` (the post-edit hook also runs these; exit 2 blocks on failure).
3. Palette validation from the dataviz skill, ordinal mode, on the generated 10-step revenue ramps (print them with a one-off node script in the scratchpad that imports `lib/color.ts`):
   ```
   node <dataviz-skill>/scripts/validate_palette.js "<10 hexes>" --mode light --ordinal
   node <dataviz-skill>/scripts/validate_palette.js "<10 hexes>" --mode dark --surface "#2a3138" --ordinal
   ```
   Expect PASS on monotone lightness, single hue and light-end contrast. The adjacent ΔL ≥ 0.06 check can WARN at n = 10 (the full span divided by 9 steps is ≈ 0.04); that is inherent to a per-row gradient and acceptable because labels and bar length disambiguate neighbours.
4. Visual QA with the `chart-reviewer` agent (Expo dev server on :8081) for "Revenue by property this month" and "Direct booking ratio by property, last 30 days": light and dark, desktop and narrow (< 360 px track). Check the top bar is clearly deeper than the base hue in light mode, the bottom bar is still obviously a bar on the card, and value labels remain `t.text.primary` on both panels.
5. Sanity: "Top property by occupancy" (single row) still renders a KPI tile / single full-hue bar, and "CPOR vs ADR by property" still renders the flat grouped chart.
