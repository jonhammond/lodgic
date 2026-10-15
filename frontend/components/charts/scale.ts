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

/**
 * Axis domain that hugs the data: a 1/2/2.5/5 step sized for ~`targetTicks`
 * intervals, floor/ceil to that step, plus the round tick values (87..113 -> 80..120 by 10).
 */
export function niceDomain(
  min: number,
  max: number,
  targetTicks = 4,
): { lo: number; hi: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  if (max <= min) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { lo, hi, ticks };
}
