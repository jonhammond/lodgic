import { TextSize } from "victory";

// Preferred strides so daily series thin to calendar-ish cadences (weekly, fortnightly)
// instead of arbitrary gaps.
const NICE_STRIDES = [1, 2, 3, 4, 5, 7, 10, 14, 15, 20, 30, 60, 90];

export type TickFont = { fontSize: number; fontFamily: string };

/**
 * 1-based x positions whose labels fit in `plotW` without overlapping.
 * Anchored on the last bucket (most recent date) and walking backward, so the
 * newest label always survives; the first may be dropped. Returns every index
 * when there is room, matching the unthinned axis.
 */
export function pickTickValues(
  labels: string[],
  plotW: number,
  font: TickFont,
  gap = 12,
): number[] {
  const n = labels.length;
  if (n === 0 || plotW <= 0) return [];
  const maxW = labels.reduce(
    (m, l) => Math.max(m, TextSize.approximateTextSize(l, font).width),
    0,
  );
  const maxTicks = Math.max(1, Math.floor(plotW / (maxW + gap)));
  const raw = Math.ceil(n / maxTicks);
  const stride = NICE_STRIDES.find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let i = n; i >= 1; i -= stride) out.push(i);
  return out.reverse();
}
