// Validation + downgrade for the optional Gemini chart_spec (no Deno/Request deps).
import {
  type Chart,
  type ChartSpec,
  SPEC_CHARTS,
  type SpecChart,
} from "./schema_prompt.ts";

export const PIE_MAX_ROWS = 12;
export const SCATTER_MIN_ROWS = 3;

type Row = Record<string, unknown>;

export interface ExplicitFormTrigger {
  /** Wording listed in the explicit-chart-form prompt rule (lowercase). */
  phrase: string;
  pattern: RegExp;
}

/** Case-insensitive, leading word boundary, no trailing boundary ("pies", "stacked bar"). */
const trigger = (phrase: string, source = phrase): ExplicitFormTrigger => ({
  phrase,
  pattern: new RegExp(`\\b${source}`, "i"),
});

/** Phrases that explicitly request a scatter, pie, stacked bar or combo form. */
export const EXPLICIT_FORM_TRIGGERS: readonly ExplicitFormTrigger[] = [
  trigger("scatter"),
  trigger("pie"),
  trigger("donut"),
  trigger("stacked"),
  trigger("combo"),
  trigger("bar and line"),
  trigger("second axis"),
  trigger("dual axis"),
  trigger("two axes"),
  trigger("secondary axis"),
  trigger("right axis"),
  trigger("bar chart with a line"),
  trigger("bars with \u2026 line", "bars? with .{0,40}?line"),
];

/**
 * Case-insensitive match with a leading word boundary (plain substring would fire on
 * "occupied" via "pie"); the new chart kinds are never inferred.
 */
export function requestsExplicitForm(question: string): boolean {
  return EXPLICIT_FORM_TRIGGERS.some((t) => t.pattern.test(question));
}

export function isSpecChart(chart: Chart): chart is SpecChart {
  return (SPEC_CHARTS as readonly string[]).includes(chart);
}

function optionalString(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** Lenient parse of the model's chart_spec: null unless the chart takes a spec and x / y are usable. */
export function parseChartSpec(chart: Chart, raw: unknown): ChartSpec | null {
  if (!isSpecChart(chart)) return null;
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.x !== "string" || o.x === "") return null;
  if (
    !Array.isArray(o.y) || o.y.length === 0 ||
    !o.y.every((c) => typeof c === "string" && c !== "")
  ) return null;
  return {
    x: o.x,
    y: o.y as string[],
    y2: optionalString(o.y2),
    label: optionalString(o.label),
  };
}

function isNumeric(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v));
}

const clip = (col: string) => col.length > 64 ? `${col.slice(0, 64)}...` : col;

function failure(
  chart: SpecChart,
  spec: ChartSpec | null,
  rows: Row[],
): string | null {
  if (spec === null) return "no usable chart_spec";
  const first = rows[0];
  if (!first) return "no rows";
  const refs = [spec.x, ...spec.y];
  if (spec.y2) refs.push(spec.y2);
  if (spec.label) refs.push(spec.label);
  for (const col of refs) {
    if (!Object.hasOwn(first, col)) return `unknown column ${clip(col)}`;
  }
  const numeric = [...spec.y, ...(spec.y2 ? [spec.y2] : [])];
  if (chart === "scatter") numeric.push(spec.x);
  for (const col of numeric) {
    let any = false;
    for (const r of rows) {
      const v = r[col];
      if (v === null || v === undefined) continue;
      if (!isNumeric(v)) return `non-numeric column ${clip(col)}`;
      any = true;
    }
    if (!any) return `no numeric values in column ${clip(col)}`;
  }
  return null;
}

function kindFailure(
  chart: SpecChart,
  spec: ChartSpec,
  rows: Row[],
): string | null {
  switch (chart) {
    case "pie":
      return rows.length > PIE_MAX_ROWS
        ? `pie over ${PIE_MAX_ROWS} rows`
        : null;
    case "scatter":
      if (rows.length < SCATTER_MIN_ROWS) {
        return `scatter under ${SCATTER_MIN_ROWS} rows`;
      }
      return spec.y.length !== 1 ? "scatter needs exactly 1 y" : null;
    case "stacked_bar":
      return spec.y.length < 2 ? "stacked_bar needs at least 2 y" : null;
    case "combo":
      return spec.y2 ? null : "combo needs y2";
  }
}

/**
 * Checks a chart_spec against the executed rows. Legacy kinds force spec null silently;
 * a failing new kind logs {"spec_dropped": reason}, drops the spec and downgrades to bar.
 */
export function validateSpec(
  chart: Chart,
  spec: ChartSpec | null,
  rows: Row[],
): { chart: Chart; spec: ChartSpec | null; reason?: string } {
  if (!isSpecChart(chart)) return { chart, spec: null };
  const reason = failure(chart, spec, rows) ??
    kindFailure(chart, spec as ChartSpec, rows);
  if (reason === null) return { chart, spec };
  console.log(JSON.stringify({ spec_dropped: reason }));
  return { chart: "bar", spec: null, reason };
}
