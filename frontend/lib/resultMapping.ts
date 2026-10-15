import {
  columnRoles,
  formatCompactCurrency,
  formatCurrency,
  formatIndex,
  formatNumber,
  formatPercent,
  isDateLike,
  isNumeric,
  isPercentLikeKey,
  monthLabel,
  toNumber,
} from "../components/charts/format";
import type { QueryResult } from "./api";

export type MetricUnit = "currency" | "percent" | "index" | "number";
export type ColorKey =
  | "revenue"
  | "adr"
  | "revpar"
  | "occupancy"
  | "distribution"
  | "cost"
  | "market"
  | "guest";

export type MetricSeries = {
  kind: "time" | "category";
  key: string;
  title: string;
  note: string;
  labels: string[];
  values: number[];
  color: ColorKey;
  partialLast: boolean;
  projection: number | null;
  unit: MetricUnit;
};

export type MappedResult = {
  summary: string;
  charts: MetricSeries[];
  table: { columns: string[]; rows: Record<string, unknown>[] } | null;
};

const COLORS: ColorKey[] = ["revenue", "adr", "revpar", "occupancy"];

function colorFor(key: string, i: number): ColorKey {
  if (/revpar/i.test(key)) return "revpar";
  if (/occ/i.test(key)) return "occupancy";
  if (/adr|rate/i.test(key)) return "adr";
  if (/revenue/i.test(key)) return "revenue";
  if (/cost|cpor|gop/i.test(key)) return "cost";
  if (/mpi|ari|rgi|market/i.test(key)) return "market";
  if (/nps|csat|repeat|housekeep/i.test(key)) return "guest";
  if (/booking|cancel|direct|ota|gds|group|channel/i.test(key)) return "distribution";
  return COLORS[i % COLORS.length];
}

const INDEX_RE = /(^|[^a-z])(mpi|ari|rgi)([^a-z]|$)|index/i;

function unitFor(key: string): MetricUnit {
  if (INDEX_RE.test(key)) return "index";
  if (/pct|percent|ratio|share/i.test(key)) return "percent";
  if (/revenue|adr|revpar|price|cost|cpor|gop|income/i.test(key)) return "currency";
  if (isPercentLikeKey(key)) return "percent";
  return "number";
}

export function isAdditiveKey(key: string): boolean {
  const u = unitFor(key);
  return /revenue|cost|gop|rooms_sold|bookings|cancellations|rooms_cleaned|hours/i.test(key) && u !== "percent" && u !== "index";
}

export function formatByUnit(v: number, unit: MetricUnit): string {
  if (unit === "percent") return formatPercent(v);
  if (unit === "currency") return Math.abs(v) >= 1000 ? formatCompactCurrency(v) : formatCurrency(v);
  if (unit === "index") return formatIndex(v);
  return formatNumber(v);
}

const titleCase = (k: string) =>
  k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function mapResult(result: QueryResult, now: Date = new Date()): MappedResult {
  const { rows, chart, title } = result;
  const empty = { summary: title, charts: [], table: null };
  if (rows.length === 0) return empty;

  if (chart === "kpi") {
    if (rows.length !== 1) return empty;
    const row = rows[0];
    const k = Object.keys(row).find((c) => isNumeric(row[c]) && !isDateLike(row[c]));
    const labelKey = Object.keys(row).find((c) => {
      const v = row[c];
      return typeof v === "string" && v.trim() !== "" && !isNumeric(v) && !isDateLike(v);
    });
    const value = k === undefined ? null : formatByUnit(toNumber(row[k]), unitFor(k as string));
    const summary =
      value === null
        ? title
        : labelKey === undefined
          ? `${title}: ${value}`
          : `${title}: ${String(row[labelKey]).trim()} \u2014 ${value}`;
    return { summary, charts: [], table: null };
  }

  const tableOf = () => ({ columns: Object.keys(rows[0]), rows });

  // Time series is decided by data shape, not the LLM's chart hint: a date-like x
  // column with 2+ rows renders one bar chart per metric (README "How results map").
  const { xKey, yKeys } = columnRoles(rows);
  const xs = rows.map((r) => String(r[xKey] ?? ""));
  const dated = xs.every(isDateLike);
  if ((chart === "line" || dated) && rows.length > 1) {
    if (yKeys.length === 0) return { summary: title, charts: [], table: tableOf() };
    const monthly = dated && xs.every((x) => x.slice(8, 10) === "01");
    const labels = xs.map((x) =>
      monthly ? monthLabel(x) : dated ? `${x.slice(5, 7)}/${x.slice(8, 10)}` : x,
    );
    const curYm = now.toISOString().slice(0, 7);
    const partialLast = monthly && xs[xs.length - 1].slice(0, 7) === curYm;
    const dim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const charts = yKeys.map((key, i): MetricSeries => {
      const values = rows.map((r) => (r[key] == null ? 0 : toNumber(r[key])));
      const unit = unitFor(key);
      const projection =
        partialLast && /revenue/i.test(key)
          ? (values[values.length - 1] / Math.max(1, now.getUTCDate())) * dim
          : null;
      return {
        kind: "time",
        key,
        title: titleCase(key),
        note: partialLast ? `${monthLabel(xs[xs.length - 1])} MTD` : unit,
        labels,
        values,
        color: colorFor(key, i),
        partialLast,
        projection,
        unit,
      };
    });
    return { summary: title, charts, table: null };
  }

  if (rows.length >= 2 && rows.length <= 20 && !dated && yKeys.length >= 1) {
    const labels = xs;
    const charts = yKeys.map((key, i): MetricSeries => {
      const unit = unitFor(key);
      return {
        kind: "category",
        key,
        title: titleCase(key),
        note: unit,
        labels,
        values: rows.map((r) => (r[key] == null ? 0 : toNumber(r[key]))),
        color: colorFor(key, i),
        partialLast: false,
        projection: null,
        unit,
      };
    });
    let summary = title;
    if (charts.length === 1) {
      const c = charts[0];
      summary = isAdditiveKey(c.key)
        ? `${title}: ${formatByUnit(c.values.reduce((a, b) => a + b, 0), c.unit)}`
        : `${title}: ${c.labels[0]} \u2014 ${formatByUnit(c.values[0], c.unit)}`;
    }
    return { summary, charts, table: tableOf() };
  }

  return { summary: title, charts: [], table: tableOf() };
}
