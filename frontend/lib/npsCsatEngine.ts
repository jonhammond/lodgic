import type { GuestRow } from "./npsCsat";
import type { ColorKey, ComboSeries } from "./resultMapping";
import { windowDates } from "./revparEngine.ts";
import type { Timeframe } from "./revparEngine.ts";

export { windowDates };

export const SEGMENT_ORDER = ["luxury", "upper_upscale", "upscale", "upper_midscale", "midscale"] as const;
export type Segment = (typeof SEGMENT_ORDER)[number];

export const SEGMENT_LABEL: Record<Segment, string> = {
  luxury: "Luxury",
  upper_upscale: "Upper Upscale",
  upscale: "Upscale",
  upper_midscale: "Upper Midscale",
  midscale: "Midscale",
};

type Prop = { id: string; name: string; segment: string };

export type Weighted = { nps: number; csat: number; roomsSold: number; days: number };

/** Rooms-sold-weighted NPS/CSAT: sum(x * rooms_sold) / sum(rooms_sold); zero rooms -> 0. */
export function weighted(rows: GuestRow[]): Weighted {
  let sold = 0;
  let nps = 0;
  let csat = 0;
  for (const r of rows) {
    sold += r.rooms_sold;
    nps += r.nps * r.rooms_sold;
    csat += r.csat * r.rooms_sold;
  }
  return {
    nps: sold > 0 ? nps / sold : 0,
    csat: sold > 0 ? csat / sold : 0,
    roomsSold: sold,
    days: rows.length,
  };
}

export type PropertyScore = {
  id: string;
  name: string;
  segment: string;
  nps: number;
  csat: number;
  roomsSold: number;
  days: number;
};

export function propertyScores(
  rows: GuestRow[],
  properties: Prop[],
  timeframe: Timeframe,
  latestDate: string,
): PropertyScore[] {
  const window = windowDates(
    rows.map((r) => r.metric_date),
    timeframe,
    latestDate,
  );
  return properties
    .map((p) => {
      const w = weighted(rows.filter((r) => r.property_id === p.id && window.has(r.metric_date)));
      return { id: p.id, name: p.name, segment: p.segment, ...w };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type SegmentScore = {
  segment: Segment;
  label: string;
  nps: number;
  csat: number;
  hotels: number;
  roomsSold: number;
};

export function segmentScores(scores: PropertyScore[]): SegmentScore[] {
  const out: SegmentScore[] = [];
  for (const segment of SEGMENT_ORDER) {
    const members = scores.filter((s) => s.segment === segment);
    if (members.length === 0) continue;
    const sold = members.reduce((a, s) => a + s.roomsSold, 0);
    const avg = (k: "nps" | "csat") =>
      sold > 0 ? members.reduce((a, s) => a + s[k] * s.roomsSold, 0) / sold : 0;
    out.push({
      segment,
      label: SEGMENT_LABEL[segment],
      nps: avg("nps"),
      csat: avg("csat"),
      hotels: members.length,
      roomsSold: sold,
    });
  }
  return out;
}

export function comboSeries(
  labels: string[],
  nps: number[],
  csat: number[],
  title: string,
  key: string,
  colors: { bar: ColorKey; line: ColorKey; ramp?: boolean } = { bar: "guest", line: "market" },
): ComboSeries {
  return {
    kind: "combo",
    key,
    title,
    labels,
    bar: {
      key: "csat",
      label: "CSAT",
      values: csat.map((v) => v * 20),
      raw: csat,
      color: colors.bar,
      ...(colors.ramp ? { ramp: true } : {}),
    },
    line: { key: "nps", label: "NPS", values: nps, color: colors.line },
  };
}

export type TrendBucket = { key: string; label: string; dates: Set<string>; partial: boolean };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function trendBuckets(rows: GuestRow[], timeframe: Timeframe, latestDate: string): TrendBucket[] {
  const dates = rows.map((r) => r.metric_date);
  // Daily deliberately uses the trailing-30-day (mtd) window for the trend.
  if (timeframe !== "ytd") {
    return [...windowDates(dates, "mtd", latestDate)].sort().map((d) => ({
      key: d,
      label: d,
      dates: new Set([d]),
      partial: false,
    }));
  }
  const byMonth = new Map<string, Set<string>>();
  for (const d of [...windowDates(dates, "ytd", latestDate)].sort()) {
    const k = d.slice(0, 7);
    const set = byMonth.get(k) ?? new Set<string>();
    set.add(d);
    byMonth.set(k, set);
  }
  const last = latestDate.slice(0, 7);
  const [ly, lm] = last.split("-").map(Number);
  const lastIsFull = Number(latestDate.slice(8, 10)) === new Date(Date.UTC(ly, lm, 0)).getUTCDate();
  // 365 days span 13 calendar months unless latestDate is month-end: drop the oldest partial one.
  return [...byMonth].slice(-12).map(([key, set]) => ({
    key,
    label: `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
    dates: set,
    partial: key === last && !lastIsFull,
  }));
}

type Line = { csat: (number | null)[]; nps: (number | null)[] };

export type GuestTrend = {
  labels: string[];
  partialLast: boolean;
  hotel: Line;
  segment: Line;
  portfolio: Line;
};

export function guestTrend(
  rows: GuestRow[],
  properties: Prop[],
  buckets: TrendBucket[],
  hotelId: string,
  segment: string,
  selectedIds: string[],
): GuestTrend {
  const selected = new Set(selectedIds);
  const hotelIds = new Set([hotelId]);
  const segIds = new Set(properties.filter((p) => p.segment === segment && selected.has(p.id)).map((p) => p.id));
  const line = (ids: Set<string>): Line => {
    const csat: (number | null)[] = [];
    const nps: (number | null)[] = [];
    for (const b of buckets) {
      const w = weighted(rows.filter((r) => ids.has(r.property_id) && b.dates.has(r.metric_date)));
      csat.push(w.roomsSold > 0 ? w.csat : null);
      nps.push(w.roomsSold > 0 ? w.nps : null);
    }
    return { csat, nps };
  };
  return {
    labels: buckets.map((b) => b.label),
    partialLast: buckets.length > 0 && buckets[buckets.length - 1].partial,
    hotel: line(hotelIds),
    segment: line(segIds),
    portfolio: line(selected),
  };
}
