import { formatByUnit, type MetricUnit } from "../../lib/resultMapping";

// Short axis ticks: "$2.5M", "$200", "50%" — the full value lives in the table/answer.
export function tickLabel(v: number, unit: MetricUnit): string {
  if (unit === "percent") return `${Math.round(v)}%`;
  if (unit === "currency") return Math.abs(v) >= 1000 ? formatByUnit(v, unit) : `$${Math.round(v)}`;
  return formatByUnit(v, unit);
}

// Smallest "nice" (1/2/2.5/5/10 x 10^k) value >= v.
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / pow;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * pow;
}
