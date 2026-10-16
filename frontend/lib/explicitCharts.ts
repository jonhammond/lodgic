import { humanize } from "../components/charts/format.ts";
import type { QueryResult } from "./api.ts";
import { colorFor, formatByUnit, unitFor } from "./resultMapping.ts";
import type { ColorKey, MetricUnit } from "./resultMapping.ts";

type Unit = MetricUnit;
type Row = Record<string, unknown>;

export type ScatterSeries = {
  kind: "scatter";
  key: string;
  title: string;
  xLabel: string;
  yLabel: string;
  xUnit: Unit;
  yUnit: Unit;
  points: { label: string; x: number; y: number }[];
};

export type PieSeries = {
  kind: "pie";
  key: string;
  title: string;
  unit: Unit;
  /** `pct` is the share of the total, 0-100. */
  slices: { label: string; value: number; pct: number }[];
};

export type StackedSeries = {
  kind: "stacked";
  key: string;
  title: string;
  unit: Unit;
  labels: string[];
  parts: { key: string; title: string; values: number[]; color: ColorKey }[];
};

export type DualAxisSeries = {
  kind: "dual";
  key: string;
  title: string;
  labels: string[];
  bar: { key: string; title: string; values: number[]; unit: Unit; color: ColorKey };
  line: { key: string; title: string; values: number[]; unit: Unit; color: ColorKey };
};

export type ExplicitSeries = ScatterSeries | PieSeries | StackedSeries | DualAxisSeries;

const PIE_MAX_SLICES = 8;
const CORRELATION_THRESHOLD = 0.5;
const ALL_COLORS: ColorKey[] = ["revenue", "adr", "revpar", "occupancy", "distribution", "cost", "market", "guest"];

const num = (v: unknown): number | null => {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Every row's value as a number, or null when any is missing or non-numeric. */
function column(rows: Row[], key: string): number[] | null {
  const out: number[] = [];
  for (const r of rows) {
    const n = num(r[key]);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

/** colorFor can repeat for related columns (direct/ota/gds all map to "distribution"); keep each part distinct. */
function distinctColors(keys: string[]): ColorKey[] {
  const used: ColorKey[] = [];
  keys.forEach((key, i) => {
    const wanted = colorFor(key, i);
    used.push(used.includes(wanted) ? (ALL_COLORS.find((c) => !used.includes(c)) ?? wanted) : wanted);
  });
  return used;
}

const labelOf = (r: Row, key: string) => String(r[key] ?? "").trim();

function mapScatter(rows: Row[], title: string, x: string, y: string, labelKey: string | null | undefined): ScatterSeries | null {
  const xs = column(rows, x);
  const ys = column(rows, y);
  if (!xs || !ys) return null;
  const first = rows[0];
  const textKey =
    labelKey ??
    Object.keys(first).find((k) => k !== x && k !== y && typeof first[k] === "string" && num(first[k]) === null);
  return {
    kind: "scatter",
    key: `${x}:${y}`,
    title,
    xLabel: humanize(x),
    yLabel: humanize(y),
    xUnit: unitFor(x),
    yUnit: unitFor(y),
    points: rows.map((r, i) => ({
      label: textKey === undefined ? String(i + 1) : labelOf(r, textKey) || String(i + 1),
      x: xs[i],
      y: ys[i],
    })),
  };
}

function mapPie(rows: Row[], title: string, x: string, y: string): PieSeries | null {
  const values = column(rows, y);
  if (!values || values.some((v) => v < 0)) return null;
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const sorted = rows
    .map((r, i) => ({ label: labelOf(r, x), value: values[i] }))
    .sort((a, b) => b.value - a.value);
  const kept = sorted.slice(0, PIE_MAX_SLICES);
  const rest = sorted.slice(PIE_MAX_SLICES);
  if (rest.length > 0) kept.push({ label: "Other", value: rest.reduce((a, s) => a + s.value, 0) });
  return {
    kind: "pie",
    key: y,
    title,
    unit: unitFor(y),
    slices: kept.map((s) => ({ ...s, pct: (s.value / total) * 100 })),
  };
}

function mapStacked(rows: Row[], title: string, x: string, ys: string[]): StackedSeries | null {
  const units = new Set(ys.map(unitFor));
  if (units.size !== 1) return null;
  const cols = ys.map((y) => column(rows, y));
  if (cols.some((c) => c === null)) return null;
  const colors = distinctColors(ys);
  return {
    kind: "stacked",
    key: ys.join("+"),
    title,
    unit: unitFor(ys[0]),
    labels: rows.map((r) => labelOf(r, x)),
    parts: ys.map((key, i) => ({ key, title: humanize(key), values: cols[i] as number[], color: colors[i] })),
  };
}

function mapDual(rows: Row[], title: string, x: string, barKey: string, lineKey: string): DualAxisSeries | null {
  const bar = column(rows, barKey);
  const line = column(rows, lineKey);
  if (!bar || !line) return null;
  const [barColor, lineColor] = distinctColors([barKey, lineKey]);
  return {
    kind: "dual",
    key: `${barKey}+${lineKey}`,
    title,
    labels: rows.map((r) => labelOf(r, x)),
    bar: { key: barKey, title: humanize(barKey), values: bar, unit: unitFor(barKey), color: barColor },
    line: { key: lineKey, title: humanize(lineKey), values: line, unit: unitFor(lineKey), color: lineColor },
  };
}

/** Maps a result carrying a validated chart_spec to a series; null (never throws) sends the caller to legacy inference. */
export function mapExplicit(result: QueryResult): ExplicitSeries | null {
  try {
    const { chart, chart_spec: spec, rows, title } = result;
    if (!spec || !Array.isArray(rows) || rows.length === 0) return null;
    const { x, y, y2, label } = spec;
    if (typeof x !== "string" || !Array.isArray(y) || y.length === 0) return null;
    const first = rows[0];
    const refs = [x, ...y, ...(y2 ? [y2] : []), ...(label ? [label] : [])];
    if (!refs.every((c) => typeof c === "string" && c in first)) return null;
    switch (chart) {
      case "scatter":
        return mapScatter(rows, title, x, y[0], label);
      case "pie":
        return mapPie(rows, title, x, y[0]);
      case "stacked_bar":
        return mapStacked(rows, title, x, y);
      case "combo":
        return y2 ? mapDual(rows, title, x, y[0], y2) : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

const argMax = (v: number[]) => v.indexOf(Math.max(...v));

function scatterFacts(s: ScatterSeries): string[] {
  const fy = (n: number) => formatByUnit(n, s.yUnit);
  const sorted = [...s.points].sort((a, b) => b.y - a.y);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const out = [`${top.label} has the highest ${s.yLabel} at ${fy(top.y)}.`];
  if (sorted.length >= 2 && top.label !== bottom.label) {
    out.push(`${bottom.label} is lowest at ${fy(bottom.y)}.`);
  }
  const r = pearson(
    s.points.map((p) => p.x),
    s.points.map((p) => p.y),
  );
  if (r !== null && Math.abs(r) >= CORRELATION_THRESHOLD) {
    out.push(`Higher ${s.xLabel} tends to ${r > 0 ? "higher" : "lower"} ${s.yLabel} (r = ${r.toFixed(2)}).`);
  }
  return out;
}

function pieFacts(s: PieSeries): string[] {
  const top = s.slices[0];
  const pct = Math.round(top.pct * 10) / 10;
  return [`${top.label} is the largest slice at ${formatByUnit(top.value, s.unit)} (${pct}% of total).`];
}

function stackedFacts(s: StackedSeries): string[] {
  const fmt = (n: number) => formatByUnit(n, s.unit);
  const totals = s.labels.map((_, i) => s.parts.reduce((a, p) => a + p.values[i], 0));
  const at = argMax(totals);
  const part = s.parts.reduce((best, p) => (p.values[at] > best.values[at] ? p : best), s.parts[0]);
  return [
    `${s.labels[at]} has the largest total at ${fmt(totals[at])}.`,
    `${part.title} is its biggest part at ${fmt(part.values[at])}.`,
  ];
}

function dualFacts(s: DualAxisSeries): string[] {
  const b = argMax(s.bar.values);
  const l = argMax(s.line.values);
  return [
    `${s.labels[b]} has the highest ${s.bar.title} at ${formatByUnit(s.bar.values[b], s.bar.unit)}.`,
    `${s.labels[l]} has the highest ${s.line.title} at ${formatByUnit(s.line.values[l], s.line.unit)}.`,
  ];
}

export function explicitFacts(series: ExplicitSeries): string[] {
  switch (series.kind) {
    case "scatter":
      return scatterFacts(series);
    case "pie":
      return pieFacts(series);
    case "stacked":
      return stackedFacts(series);
    case "dual":
      return dualFacts(series);
  }
}
