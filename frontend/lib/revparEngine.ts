export type Timeframe = "daily" | "mtd" | "ytd";

export const DAYS: Record<Timeframe, number> = { daily: 1, mtd: 30, ytd: 365 };

export type DailyRow = {
  property_id: string;
  metric_date: string;
  rooms_sold: number;
  total_revenue: number;
};

export type PropertyBase = {
  id: string;
  name: string;
  rooms: number;
  /** 0..1. On a PropertyCalc this is post-shift (clamped at 1). */
  occupancy: number;
  adr: number;
  /** Rows used in the window. */
  days: number;
};

export type Tier = "above" | "below" | "critical";

export type PropertyCalc = PropertyBase & {
  roomsAvailable: number;
  roomsSold: number;
  revenue: number;
  revpar: number;
  tier: Tier;
};

export type Portfolio = {
  rooms: number;
  roomsAvailable: number;
  roomsSold: number;
  revenue: number;
  occupancy: number;
  adr: number;
  revpar: number;
  target: number;
};

export type SortKey = "revpar" | "occupancy" | "adr" | "rooms" | "name";

/** Dates in the timeframe window: `latestDate` for daily, else the latest `DAYS[tf]` distinct dates <= latestDate. */
export function windowDates(dates: string[], timeframe: Timeframe, latestDate: string): Set<string> {
  const distinct = [...new Set(dates)]
    .filter((d) => d <= latestDate)
    .sort()
    .reverse();
  return new Set(timeframe === "daily" ? [latestDate] : distinct.slice(0, DAYS[timeframe]));
}

export function baseInputs(
  rows: DailyRow[],
  properties: { id: string; name: string; total_rooms: number }[],
  timeframe: Timeframe,
  latestDate: string,
): PropertyBase[] {
  const window = windowDates(
    rows.map((r) => r.metric_date),
    timeframe,
    latestDate,
  );
  return properties.map((p) => {
    let sold = 0;
    let revenue = 0;
    let days = 0;
    for (const r of rows) {
      if (r.property_id !== p.id || !window.has(r.metric_date)) continue;
      sold += r.rooms_sold;
      revenue += r.total_revenue;
      days += 1;
    }
    const capacity = p.total_rooms * days;
    return {
      id: p.id,
      name: p.name,
      rooms: p.total_rooms,
      occupancy: capacity > 0 ? sold / capacity : 0,
      adr: sold > 0 ? revenue / sold : 0,
      days,
    };
  });
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

export function compute(
  base: PropertyBase[],
  timeframe: Timeframe,
  demandShift: number,
): { rows: PropertyCalc[]; portfolio: Portfolio; daysUsed: number } {
  const mult = DAYS[timeframe];
  const lines = base.filter((p) => p.days > 0).map((p) => {
    const occ = Math.min(1, p.occupancy * demandShift);
    const roomsAvailable = p.rooms * mult;
    const roomsSold = roomsAvailable * occ;
    const revenue = roomsSold * p.adr;
    return { ...p, occupancy: occ, roomsAvailable, roomsSold, revenue, revpar: ratio(revenue, roomsAvailable) };
  });
  const sum = (f: (l: (typeof lines)[number]) => number) => lines.reduce((a, l) => a + f(l), 0);
  const roomsAvailable = sum((l) => l.roomsAvailable);
  const roomsSold = sum((l) => l.roomsSold);
  const revenue = sum((l) => l.revenue);
  const revpar = ratio(revenue, roomsAvailable);
  const portfolio: Portfolio = {
    rooms: sum((l) => l.rooms),
    roomsAvailable,
    roomsSold,
    revenue,
    occupancy: ratio(roomsSold, roomsAvailable),
    adr: ratio(revenue, roomsSold),
    revpar,
    target: revpar,
  };
  const rows: PropertyCalc[] = lines.map((l) => ({
    ...l,
    tier: l.revpar >= portfolio.target ? "above" : l.revpar < 0.85 * portfolio.target ? "critical" : "below",
  }));
  return { rows, portfolio, daysUsed: base.reduce((m, p) => Math.max(m, p.days), 0) };
}

export function sortRows(rows: PropertyCalc[], key: SortKey, dir: "asc" | "desc"): PropertyCalc[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      const c = key === "name" ? x.r.name.localeCompare(y.r.name) : x.r[key] - y.r[key];
      return c !== 0 ? sign * c : x.i - y.i;
    })
    .map((x) => x.r);
}
