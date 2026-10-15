import {
  columnRoles,
  formatCompactCurrency,
  formatCurrency,
  formatIndex,
  formatNumber,
  formatPercent,
  humanize,
  isDateLike,
  isNumeric,
  isPercentLikeKey,
  isWeeklySpacing,
  monthLabel,
  toNumber,
  unitLabel,
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

export type TrendSeries = {
  kind: "trend";
  key: string;
  title: string;
  note: string;
  unit: MetricUnit;
  labels: string[];
  series: { name: string; values: (number | null)[]; rank: "top" | "bottom" | "mid"; order: number }[];
  reference: { y: number; label: string } | null;
};

/** A rate metric (ADR) paired with its volume driver (rooms sold): the UI renders the
 *  rate as a selectable multi-line trend and, for the selected property, a bar+line combo. */
export type RateVolumePair = { rate: TrendSeries; volume: TrendSeries };

/** 2-3 same-unit metrics over one category axis (CPOR vs ADR by property): one grouped bar chart. */
export type GroupedSeries = {
  kind: "grouped";
  key: string;
  title: string;
  note: string;
  unit: MetricUnit;
  labels: string[];
  series: { key: string; title: string; values: number[]; color: ColorKey }[];
};

export type MappedResult = {
  headline: string;
  facts: string[];
  charts: (MetricSeries | TrendSeries | GroupedSeries)[];
  pair: RateVolumePair | null;
  table: {
    columns: string[];
    rows: Record<string, unknown>[];
    groupBy?: string;
    seriesOrder?: Record<string, number>;
  } | null;
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

/** Full-precision variant for places that replace a table: currency keeps cents, no compacting. */
export function formatExact(v: number, unit: MetricUnit): string {
  if (unit === "currency") return formatCurrency(v);
  return formatByUnit(v, unit);
}

export function formatByUnit(v: number, unit: MetricUnit): string {
  if (unit === "percent") return formatPercent(v);
  if (unit === "currency") return Math.abs(v) >= 1000 ? formatCompactCurrency(v) : formatCurrency(v);
  if (unit === "index") return formatIndex(v);
  return formatNumber(v);
}

const lbl = (s: string) => s.trim();

function timeFacts(c: Pick<MetricSeries, "values" | "labels" | "unit">): string[] {
  const v = c.values;
  if (v.length < 2) return [];
  const fmt = (n: number) => formatByUnit(n, c.unit);
  const last = v.length - 1;
  let pct = "";
  if (v[0] !== 0) {
    const p = Math.round(((v[last] - v[0]) / Math.abs(v[0])) * 100);
    pct = ` (${p >= 0 ? "+" : ""}${p}%)`;
  }
  const hi = v.indexOf(Math.max(...v));
  const lo = v.indexOf(Math.min(...v));
  return [
    `${fmt(v[0])} on ${lbl(c.labels[0])} to ${fmt(v[last])} on ${lbl(c.labels[last])}${pct}.`,
    `Peak ${fmt(v[hi])} on ${lbl(c.labels[hi])}; low ${fmt(v[lo])} on ${lbl(c.labels[lo])}.`,
  ];
}

/** 2-3 category metrics sharing a currency or percent unit collapse into one grouped bar chart;
 *  mixed units and plain numbers keep one panel per metric plus the table. */
function groupSameUnit(charts: MetricSeries[], title: string): GroupedSeries | null {
  if (charts.length < 2 || charts.length > 3) return null;
  const unit = charts[0].unit;
  if (unit !== "currency" && unit !== "percent") return null;
  if (!charts.every((c) => c.unit === unit)) return null;
  const used: ColorKey[] = [];
  const series = charts.map((c) => {
    const color = used.includes(c.color) ? (COLORS.find((k) => !used.includes(k)) ?? c.color) : c.color;
    used.push(color);
    return { key: c.key, title: c.title, values: c.values, color };
  });
  return {
    kind: "grouped",
    key: charts.map((c) => c.key).join("+"),
    title,
    note: unitLabel(unit),
    unit,
    labels: charts[0].labels,
    series,
  };
}

function categoryFacts(c: MetricSeries, xKey: string): string[] {
  const fmt = (n: number) => formatByUnit(n, c.unit);
  const sorted = c.labels
    .map((label, i) => ({ label: lbl(label), value: c.values[i] }))
    .sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const out = [`${top.label} leads at ${fmt(top.value)}.`];
  if (sorted.length >= 2 && top.label !== bottom.label) {
    out.push(`${bottom.label} is lowest at ${fmt(bottom.value)}.`);
  }
  const sum = sorted.reduce((a, r) => a + r.value, 0);
  out.push(
    isAdditiveKey(c.key)
      ? `Portfolio total ${fmt(sum)} across ${sorted.length} ${/^name$|property/i.test(xKey) ? "properties" : humanize(xKey).toLowerCase() + " groups"}.`
      : `Average ${fmt(sum / sorted.length)}; spread ${fmt(top.value - bottom.value)}.`,
  );
  return out;
}

function trendFacts(c: TrendSeries): string[] {
  const fmt = (n: number) => formatByUnit(n, c.unit);
  const out: string[] = [];
  const mean = (vs: (number | null)[]) => {
    const nn = vs.filter((v): v is number => v !== null);
    return nn.length ? nn.reduce((a, b) => a + b, 0) / nn.length : 0;
  };
  const top = c.series.find((s) => s.rank === "top");
  const bottom = c.series.find((s) => s.rank === "bottom");
  if (top && bottom) {
    out.push(
      `${top.name} averaged ${fmt(mean(top.values))} over ${c.labels.length} ${c.note.startsWith("weekly") ? "weeks" : "periods"}; ${bottom.name} lowest at ${fmt(mean(bottom.values))}.`,
    );
  }
  if (c.reference) {
    const ref = c.reference.y;
    const latest = c.series
      .map((s) => s.values[c.labels.length - 1])
      .filter((v): v is number => v != null);
    out.push(
      `${latest.filter((v) => v > ref).length} of ${c.series.length} properties above market fair share in the latest week.`,
    );
  }
  return out;
}

function singleTrendFacts(c: TrendSeries): string[] {
  const pts = c.series[0].values
    .map((v, i) => ({ v, label: c.labels[i] }))
    .filter((p): p is { v: number; label: string } => p.v !== null);
  const facts = timeFacts({
    values: pts.map((p) => p.v),
    labels: pts.map((p) => p.label),
    unit: c.unit,
  });
  return facts;
}

function rankSeries(
  entries: { name: string; values: (number | null)[] }[],
): TrendSeries["series"] {
  const means = entries.map((e) => {
    const nn = e.values.filter((v): v is number => v !== null);
    return nn.length ? nn.reduce((a, b) => a + b, 0) / nn.length : NaN;
  });
  let hi = -1;
  let lo = -1;
  means.forEach((m, i) => {
    if (Number.isNaN(m)) return;
    if (hi < 0 || m > means[hi]) hi = i;
    if (lo < 0 || m < means[lo]) lo = i;
  });
  const ranked = entries.length >= 2 && hi !== lo;
  const idx = entries.map((_, i) => i);
  idx.sort((a, b) => {
    const na = Number.isNaN(means[a]);
    const nb = Number.isNaN(means[b]);
    if (na || nb) return na === nb ? a - b : na ? 1 : -1;
    return means[b] - means[a] || a - b;
  });
  const order = new Array<number>(entries.length);
  idx.forEach((orig, pos) => {
    order[orig] = pos;
  });
  return entries.map((e, i) => ({
    name: e.name,
    values: e.values,
    order: order[i],
    rank: ranked && i === hi ? "top" : ranked && i === lo ? "bottom" : "mid",
  }));
}

const PAIRS: { rate: RegExp; volume: RegExp }[] = [{ rate: /adr/i, volume: /rooms_sold/i }];

function findPair(valueKeys: string[]): { rateKey: string; volumeKey: string } | null {
  for (const p of PAIRS) {
    const rateKey = valueKeys.find((k) => p.rate.test(k));
    const volumeKey = valueKeys.find((k) => p.volume.test(k));
    if (rateKey && volumeKey && rateKey !== volumeKey) return { rateKey, volumeKey };
  }
  return null;
}

function detectLongFormat(
  rows: Record<string, unknown>[],
  minNames = 2,
): { dateKey: string; nameKey: string; valueKeys: string[] } | null {
  if (rows.length < 2) return null;
  const cols = Object.keys(rows[0]);
  const dateCols = cols.filter((k) => rows.every((r) => isDateLike(r[k])));
  if (dateCols.length !== 1) return null;
  const dateKey = dateCols[0];
  const isNumCol = (k: string) =>
    rows.every((r) => r[k] == null || (isNumeric(r[k]) && !isDateLike(r[k])));
  const textCols = cols.filter(
    (k) => k !== dateKey && !isNumCol(k) && rows.every((r) => typeof r[k] === "string"),
  );
  if (textCols.length !== 1) return null;
  const nameKey = textCols[0];
  if (new Set(rows.map((r) => String(r[nameKey]).trim())).size < minNames) return null;
  const valueKeys = cols.filter((k) => k !== dateKey && k !== nameKey && isNumCol(k));
  if (valueKeys.length < 1) return null;
  if (new Set(rows.map((r) => String(r[dateKey]))).size < 2) return null;
  const seen = new Set<string>();
  for (const r of rows) {
    const id = `${String(r[dateKey])}\u0000${String(r[nameKey]).trim()}`;
    if (seen.has(id)) return null;
    seen.add(id);
  }
  return { dateKey, nameKey, valueKeys };
}

function tableFacts(rows: Record<string, unknown>[]): string[] {
  return [`${rows.length} rows \u00d7 ${Object.keys(rows[0]).length} columns.`];
}

export function mapResult(result: QueryResult, now: Date = new Date()): MappedResult {
  const { rows, chart, title } = result;
  const empty: MappedResult = { headline: title, facts: [], charts: [], pair: null, table: null };
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
    const headline =
      value === null
        ? title
        : labelKey === undefined
          ? `${title}: ${value}`
          : `${title}: ${String(row[labelKey]).trim()} \u2014 ${value}`;
    return { headline, facts: [], charts: [], pair: null, table: null };
  }

  const tableOf = () => ({ columns: Object.keys(rows[0]), rows });

  // A single property still keeps the long-format shape when the result is a
  // rate/volume pair, so the selectable trend and its companion chart render.
  let long = detectLongFormat(rows);
  if (!long) {
    const one = detectLongFormat(rows, 1);
    if (one && findPair(one.valueKeys)) long = one;
  }
  if (long) {
    const { dateKey, nameKey, valueKeys } = long;
    const dates = [...new Set(rows.map((r) => String(r[dateKey])))].sort();
    const dateIdx = new Map(dates.map((d, i) => [d, i]));
    const names = [...new Set(rows.map((r) => String(r[nameKey]).trim()))];
    const monthlyLong = dates.every((d) => d.slice(8, 10) === "01");
    const labels = dates.map((d) =>
      monthlyLong ? monthLabel(d) : `${d.slice(5, 7)}/${d.slice(8, 10)}`,
    );
    const weekly = isWeeklySpacing(dates);
    const all = valueKeys.map((key): TrendSeries => {
      const unit = unitFor(key);
      const byName = new Map(names.map((n) => [n, new Array<number | null>(dates.length).fill(null)]));
      for (const r of rows) {
        const v = r[key];
        byName.get(String(r[nameKey]).trim())![dateIdx.get(String(r[dateKey]))!] =
          v == null ? null : toNumber(v);
      }
      return {
        kind: "trend",
        key,
        title: humanize(key),
        note: weekly ? `weekly \u00b7 ${unitLabel(unit)}` : unitLabel(unit),
        unit,
        labels,
        series: rankSeries(names.map((n) => ({ name: n, values: byName.get(n)! }))),
        reference: unit === "index" ? { y: 100, label: "Market fair share" } : null,
      };
    });
    const pairKeys = findPair(valueKeys);
    const pair: RateVolumePair | null = pairKeys
      ? {
          rate: all.find((c) => c.key === pairKeys.rateKey)!,
          volume: all.find((c) => c.key === pairKeys.volumeKey)!,
        }
      : null;
    const charts = pair ? all.filter((c) => c !== pair.rate && c !== pair.volume) : all;
    const lead = pair?.rate ?? all[0];
    const seriesOrder: Record<string, number> = {};
    lead.series.forEach((s) => {
      seriesOrder[s.name] = s.order;
    });
    return {
      headline: title,
      facts: lead.series.length >= 2 ? trendFacts(lead) : singleTrendFacts(lead),
      charts,
      pair,
      table: { ...tableOf(), groupBy: dateKey, seriesOrder },
    };
  }

  // Time series is decided by data shape, not the LLM's chart hint: a date-like x
  // column with 2+ rows renders one bar chart per metric (README "How results map").
  const { xKey, yKeys } = columnRoles(rows);
  const xs = rows.map((r) => String(r[xKey] ?? ""));
  const dated = xs.every(isDateLike);
  if ((chart === "line" || dated) && rows.length > 1) {
    if (yKeys.length === 0) return { headline: title, facts: tableFacts(rows), charts: [], pair: null, table: tableOf() };
    const monthly = dated && xs.every((x) => x.slice(8, 10) === "01");
    const labels = xs.map((x) =>
      monthly ? monthLabel(x) : dated ? `${x.slice(5, 7)}/${x.slice(8, 10)}` : x,
    );
    const curYm = now.toISOString().slice(0, 7);
    const partialLast = monthly && xs[xs.length - 1].slice(0, 7) === curYm;
    const dim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const charts = yKeys.map((key, i): MetricSeries | TrendSeries => {
      const unit = unitFor(key);
      if (unit === "index") {
        return {
          kind: "trend",
          key,
          title: humanize(key),
          note: unitLabel(unit),
          unit,
          labels,
          series: rankSeries([
            { name: humanize(key), values: rows.map((r) => (r[key] == null ? null : toNumber(r[key]))) },
          ]),
          reference: { y: 100, label: "Market fair share" },
        };
      }
      const values = rows.map((r) => (r[key] == null ? 0 : toNumber(r[key])));
      const projection =
        partialLast && /revenue/i.test(key)
          ? (values[values.length - 1] / Math.max(1, now.getUTCDate())) * dim
          : null;
      return {
        kind: "time",
        key,
        title: humanize(key),
        note: partialLast ? `${monthLabel(xs[xs.length - 1])} MTD` : unitLabel(unit),
        labels,
        values,
        color: colorFor(key, i),
        partialLast,
        projection,
        unit,
      };
    });
    const first = charts[0];
    return {
      headline: title,
      facts:
        first.kind === "trend"
          ? singleTrendFacts(first)
          : timeFacts(first),
      charts,
      pair: null,
      table: null,
    };
  }

  if (rows.length >= 2 && rows.length <= 20 && !dated && yKeys.length >= 1) {
    const labels = xs;
    const charts = yKeys.map((key, i): MetricSeries => {
      const unit = unitFor(key);
      return {
        kind: "category",
        key,
        title: humanize(key),
        note: unitLabel(unit),
        labels,
        values: rows.map((r) => (r[key] == null ? 0 : toNumber(r[key]))),
        color: colorFor(key, i),
        partialLast: false,
        projection: null,
        unit,
      };
    });
    const grouped = groupSameUnit(charts, title);
    if (grouped) {
      return {
        headline: title,
        facts: charts.flatMap((c) => categoryFacts(c, xKey).slice(0, 1)),
        charts: [grouped],
        pair: null,
        table: null,
      };
    }
    let headline = title;
    if (charts.length === 1) {
      const c = charts[0];
      headline = isAdditiveKey(c.key)
        ? `${title}: ${formatByUnit(c.values.reduce((a, b) => a + b, 0), c.unit)}`
        : `${title}: ${c.labels[0]} \u2014 ${formatByUnit(c.values[0], c.unit)}`;
    }
    // A single-metric category chart carries exact labels and the total itself; a table would repeat it row for row.
    const table = charts.length === 1 ? null : tableOf();
    return { headline, facts: categoryFacts(charts[0], xKey), charts, pair: null, table };
  }

  return { headline: title, facts: tableFacts(rows), charts: [], pair: null, table: tableOf() };
}
