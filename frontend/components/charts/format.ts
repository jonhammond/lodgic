import type { Palette } from "../../theme/tokens";

type Row = Record<string, unknown>;

/** Series colour shared by the trend chart and its companions: ranked ramp when multi, market accent when single. */
export function trendColor(
  t: Palette,
  s: { order: number },
  multi: boolean,
): string {
  return multi ? (t.trend.ramp[s.order] ?? t.trend.mid) : t.kpi.market.line;
}

const NUM_RE = /^-?\d+(\.\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

export function isNumeric(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") return NUM_RE.test(v.trim());
  return false;
}

export function toNumber(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

export function isDateLike(v: unknown): boolean {
  return typeof v === "string" && DATE_RE.test(v);
}

export function formatNumber(v: unknown): string {
  if (!isNumeric(v)) return String(v ?? "");
  return toNumber(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatDecimal(v: number, decimals: number): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Index values (MPI/ARI/RGI): one decimal, no unit, e.g. 104.2. */
export function formatIndex(v: number): string {
  return formatDecimal(v, 1);
}

export function formatDateTick(v: unknown): string {
  const s = String(v);
  return isDateLike(s) ? `${s.slice(5, 7)}/${s.slice(8, 10)}` : s;
}

export function columnRoles(rows: Row[]): { xKey: string; yKeys: string[] } {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const numericCol = (k: string) =>
    rows.every((r) => r[k] == null || (isNumeric(r[k]) && !isDateLike(r[k])));
  const xKey =
    cols.find((k) => !numericCol(k) || rows.every((r) => isDateLike(r[k]))) ??
    cols[0] ??
    "";
  const yKeys = cols.filter((k) => k !== xKey && numericCol(k));
  return { xKey, yKeys };
}

const ACRONYMS = /^(rgi|mpi|ari|adr|revpar|nps|csat|gop|cpor|ota|gds|ytd|mtd|id)$/i;

/** snake_case column key -> Title Case label; hospitality acronyms keep their casing. */
export function humanize(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) =>
      ACRONYMS.test(w)
        ? w.toUpperCase().replace("REVPAR", "RevPAR")
        : w.replace(/^\w/, (c) => c.toUpperCase()),
    )
    .join(" ");
}

/** Short unit tag for chart notes: "%" rather than "percent". */
export function unitLabel(unit: "currency" | "percent" | "index" | "number"): string {
  return unit === "percent" ? "%" : unit === "currency" ? "USD" : unit;
}

export function formatCurrency(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function formatCompactCurrency(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatPercent(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(dateStr: string): string {
  return MONTHS[Number(dateStr.slice(5, 7)) - 1] ?? dateStr;
}

export function isPercentLikeKey(key: string): boolean {
  return /occ|pct|percent|rate|ratio|share/i.test(key);
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-08-23..." -> "Aug 23, 2026"; non-date strings pass through. */
export function formatLongDate(iso: string): string {
  if (!isDateLike(iso)) return iso;
  const m = MONTH_NAMES[Number(iso.slice(5, 7)) - 1];
  if (!m) return iso;
  return `${m} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
}

/** "2026-08-23..." -> "Week ending Aug 23, 2026"; non-date strings pass through. */
export function formatWeekEnding(iso: string): string {
  const d = formatLongDate(iso);
  return d === iso ? iso : `Week ending ${d}`;
}

/** True when every consecutive sorted date is exactly seven days apart (weekly buckets). */
export function isWeeklySpacing(dates: string[]): boolean {
  const ds = [...new Set(dates.filter(isDateLike))].sort();
  if (ds.length < 2) return false;
  return ds.every(
    (d, i) => i === 0 || Date.parse(d.slice(0, 10)) - Date.parse(ds[i - 1].slice(0, 10)) === 7 * 86400000,
  );
}
