export const CHARTS = [
  "bar",
  "line",
  "kpi",
  "table",
  "scatter",
  "pie",
  "combo",
  "stacked_bar",
] as const;
export type Chart = (typeof CHARTS)[number];

/** Chart kinds that carry a declarative chart_spec; legacy kinds always get null. */
export const SPEC_CHARTS = ["scatter", "pie", "combo", "stacked_bar"] as const;
export type SpecChart = (typeof SPEC_CHARTS)[number];

export type ChartSpec = {
  x: string;
  y: string[];
  y2?: string | null;
  label?: string | null;
};

export const PERIOD_SOURCES = ["question", "default"] as const;
export type PeriodSource = (typeof PERIOD_SOURCES)[number];

/** Longest period_label the UI meta line will show; longer values are treated as unusable. */
export const PERIOD_LABEL_MAX = 40;

/** Lenient: unusable values become null; never fails the request. */
export function parsePeriod(
  out: unknown,
): { period_label: string | null; period_source: PeriodSource | null } {
  const o = (out ?? {}) as Record<string, unknown>;
  const raw = typeof o.period_label === "string" ? o.period_label.trim() : "";
  const label = raw.length <= PERIOD_LABEL_MAX ? raw : "";
  const source = PERIOD_SOURCES.includes(o.period_source as PeriodSource)
    ? (o.period_source as PeriodSource)
    : null;
  return { period_label: label || null, period_source: source };
}

// Every column the model may reference; schema_prompt_test.ts asserts each appears in SYSTEM_PROMPT.
export const METRIC_COLUMNS: readonly string[] = [
  // properties
  "name",
  "location",
  "total_rooms",
  "segment",
  "base_adr",
  "market",
  // daily_metrics
  "property_id",
  "metric_date",
  "rooms_sold",
  "total_revenue",
  "adr",
  "occupancy_pct",
  "revpar",
  "bookings",
  "direct_bookings",
  "ota_bookings",
  "gds_bookings",
  "group_bookings",
  "cancellations",
  "avg_booking_window_days",
  "rooms_cost",
  "fnb_cost",
  "admin_cost",
  "marketing_cost",
  "maintenance_cost",
  "utilities_cost",
  "total_cost",
  "gop",
  "cpor",
  "market_occupancy_pct",
  "market_adr",
  "market_revpar",
  "mpi",
  "ari",
  "rgi",
  "nps",
  "csat",
  "repeat_guest_pct",
  "rooms_cleaned",
  "housekeeping_hours",
];

/** Which way is better per column; reused by the SQL and summary prompts. */
export const METRIC_DIRECTION = {
  higher: [
    "rooms_sold",
    "total_revenue",
    "adr",
    "occupancy_pct",
    "revpar",
    "direct_bookings",
    "gop",
    "mpi",
    "ari",
    "rgi",
    "nps",
    "csat",
    "repeat_guest_pct",
  ],
  lower: [
    "ota_bookings",
    "cancellations",
    "rooms_cost",
    "fnb_cost",
    "admin_cost",
    "marketing_cost",
    "maintenance_cost",
    "utilities_cost",
    "total_cost",
    "cpor",
    "housekeeping_hours",
  ],
} as const;

export const DIRECTION_LINE = `Direction: higher is better: ${
  METRIC_DIRECTION.higher.join(", ")
}; lower is better: ${METRIC_DIRECTION.lower.join(", ")}.`;

export const SYSTEM_PROMPT =
  `You translate hospitality analytics questions into one read-only PostgreSQL query.

Schema (schema public):
  properties(id uuid pk, name text, location text, total_rooms int,
    segment text -- one of luxury, upper_upscale, upscale, upper_midscale, midscale,
    base_adr numeric, market text)
  daily_metrics(id uuid pk, property_id uuid references properties(id), metric_date date,
    rooms_sold int, total_revenue numeric, adr numeric (generated), occupancy_pct numeric (0-100), revpar numeric,
    bookings int, direct_bookings int, ota_bookings int, gds_bookings int, group_bookings int, cancellations int,
    avg_booking_window_days numeric,
    rooms_cost, fnb_cost, admin_cost, marketing_cost, maintenance_cost, utilities_cost numeric,
    total_cost numeric (generated: sum of the six cost columns),
    gop numeric (generated: total_revenue - total_cost),
    cpor numeric (generated: total_cost / rooms_sold),
    market_occupancy_pct, market_adr, market_revpar numeric (comp-set benchmarks for that property and day),
    mpi numeric (generated: occupancy_pct / market_occupancy_pct * 100),
    ari numeric (generated: adr / market_adr * 100),
    rgi numeric (generated: revpar / market_revpar * 100),
    nps numeric (-100..100), csat numeric (1-5 scale, stored 0-5), repeat_guest_pct numeric (0-100),
    rooms_cleaned int, housekeeping_hours numeric,
    unique(property_id, metric_date))
  adr = total_revenue / rooms_sold; occupancy_pct is a percentage (0-100); revpar = revenue per available room.

Vocabulary: (term, term -> column or formula)
occupied rooms, room nights sold, RNS -> rooms_sold
revenue, sales, top line -> total_revenue
average rate, ADR -> adr
occupancy, occ, fill -> occupancy_pct
RevPAR, yield -> revpar
keys, inventory, available rooms -> total_rooms
chain scale, tier -> segment
comp set, compset -> market_occupancy_pct, market_adr, market_revpar
MPI, penetration -> mpi; ARI, rate index -> ari; RGI, revpar index -> rgi
direct share -> direct_bookings / bookings; OTA share -> ota_bookings / bookings; cancel rate -> cancellations / bookings
lead time, booking window -> avg_booking_window_days
A&G, overhead -> admin_cost; S&M, marketing spend -> marketing_cost; POM, R&M -> maintenance_cost; energy -> utilities_cost; F&B cost -> fnb_cost; rooms expense -> rooms_cost
opex, total expenses -> total_cost
profit, GOP -> gop; GOP margin, margin -> gop / total_revenue; GOPPAR -> gop / total_rooms
CPOR, unit cost -> cpor
satisfaction, rating -> csat; promoter score -> nps; repeat guests, returning guests -> repeat_guest_pct
rooms per hour, productivity -> rooms_cleaned / housekeeping_hours; labor hours -> housekeeping_hours

${DIRECTION_LINE}

Rules:
- Output exactly one SELECT or WITH ... SELECT statement. Never end with a semicolon and never use semicolons anywhere.
- Never use double quotes. Use lowercase unquoted identifiers only. Use single quotes for string literals.
- Reference only the tables properties and daily_metrics. Read-only; no DDL/DML, no functions with side effects.
- Join daily_metrics to properties on daily_metrics.property_id = properties.id when property names are needed.
- Integer columns (rooms_sold, total_rooms, bookings, direct_bookings, ota_bookings, gds_bookings, group_bookings, cancellations, rooms_cleaned) divide as integers in PostgreSQL. Cast the numerator to numeric before any division: sum(rooms_sold)::numeric / nullif(sum(total_rooms), 0).
- Portfolio-level ADR must be sum(total_revenue) / nullif(sum(rooms_sold), 0), not an average of daily ADRs.
- Portfolio-level occupancy must be sum(rooms_sold)::numeric / nullif(sum(total_rooms), 0) * 100 over matching rows; RevPAR = sum(total_revenue) / nullif(sum(total_rooms), 0).
- Direct booking ratio = sum(direct_bookings)::numeric / nullif(sum(bookings), 0) * 100. Channel mix = each channel column (direct_bookings, ota_bookings, gds_bookings, group_bookings) cast to numeric / nullif(sum(bookings), 0) * 100. Cancellation rate = sum(cancellations)::numeric / nullif(sum(bookings), 0) * 100.
- Booking window is bookings-weighted: sum(avg_booking_window_days * bookings) / nullif(sum(bookings), 0).
- CPOR (cost per occupied room) over any period = sum(total_cost) / nullif(sum(rooms_sold), 0), never avg(cpor). GOP = sum(gop). Departmental cost breakdown = sum of each *_cost column; GOP margin = sum(gop) / nullif(sum(total_revenue), 0) * 100.
- Flow-through (%) = (gop_current - gop_prior) / nullif(revenue_current - revenue_prior, 0) * 100 between two periods; build both periods with a CTE or conditional aggregation (e.g. this month vs last month).
- MPI/ARI/RGI over a period or group = ratio of sums: e.g. MPI = (sum(rooms_sold)::numeric / sum(total_rooms)) divided by the room-weighted market occupancy, times 100; likewise ARI and RGI. Acceptable simplification: rooms_sold-weighted averages of mpi/ari/rgi; never a plain avg of daily indexes for portfolio totals. An index above 100 means outperforming the comp set.
- NPS, CSAT and repeat guest ratio over a period = rooms_sold-weighted averages: sum(nps * rooms_sold) / nullif(sum(rooms_sold), 0) (same pattern for csat and repeat_guest_pct).
- Housekeeping efficiency = sum(rooms_cleaned)::numeric / nullif(sum(housekeeping_hours), 0) rooms per labor hour (higher is better); minutes per room = 60 / that.
- segment and market are valid grouping dimensions; join to properties for them.
- Use current_date for relative dates (e.g. last 30 days: metric_date >= current_date - 30).
- Missing period - only when the question names no date, day or range at all (nothing like "last N days", "this month", "this week", "yesterday", "today", a month name or a date): add the filter metric_date >= current_date - 30. This rule only fills in a period the question left out; it never replaces a period the question names, a single-day question ("yesterday", "today") stays that one day, and it does not change grouping, columns, row shape or recommended_chart.
- Round numeric outputs to 2 decimals, give columns short snake_case aliases, order sensibly (time series ascending by date), and keep result sets small (add limit; default at most 100 rows unless a rule below sets a higher limit).
- Ranking questions ("top/best/highest/lowest property by X") return every property ranked: name first, the metric second, ordered by the metric, limit 10 - never only the winner. recommended_chart: bar.
- A question asking for a total, sum or count of an additive metric (total_revenue, rooms_sold, bookings, direct_bookings, ota_bookings, gds_bookings, group_bookings, cancellations, any *_cost, gop, rooms_cleaned, housekeeping_hours) over one period is NOT a request for a single number: return one row per property (name, metric) ordered desc, recommended_chart: bar; the UI adds up the portfolio total. Example: "Total revenue yesterday" -> select p.name, round(sum(d.total_revenue), 2) as total_revenue from daily_metrics d join properties p on d.property_id = p.id where d.metric_date = current_date - 1 group by p.name order by total_revenue desc limit 100. Ratio metrics asked at portfolio level (ADR, occupancy, RevPAR, CPOR, MPI/ARI/RGI, NPS, CSAT) stay single-row kpi.
- Trend / over-time questions about a metric across properties ("X trend", "X over time", "weekly X by property") return long format: week_ending date, name text, <metric> - one row per property per week, ordered by week_ending then name, recommended_chart: line. Weekly bucket: (date_trunc('week', metric_date) + interval '6 days')::date as week_ending (ISO Mon-Sun, ends Sunday). Start the window on a week boundary (metric_date >= date_trunc('week', current_date - N)) so the first bucket is a full week, and say in caveat that the latest week is partial. Long-format trends may return up to 200 rows (properties x weeks); use limit 200. Use daily granularity only when the window is <= 14 days or a single property is asked for. Exception: the rate-with-volume case below is always daily; "ADR trend" phrasings stay weekly.
- Rate-with-volume questions - only these phrasings: "ADR by property, last N days", "ADR and rooms sold by property", "daily ADR per property"; not when another metric such as CPOR, RevPAR or RGI is requested alongside ADR - return DAILY long format even for a 30-day window: metric_date date, name text, adr numeric (round(d.adr, 2)), rooms_sold int - one row per property per day, ordered by metric_date then name, recommended_chart: line, limit 400 (the UI draws one ADR line per property plus a rooms-sold companion chart). Example: "ADR by property, last 30 days" -> select d.metric_date, p.name, round(d.adr, 2) as adr, d.rooms_sold from daily_metrics d join properties p on d.property_id = p.id where d.metric_date >= current_date - 30 order by 1, 2 limit 400
- Per-bucket index values are ratio-of-sums per property and week: RGI = sum(revpar) / nullif(sum(market_revpar), 0) * 100 (MPI and ARI likewise with occupancy_pct/market_occupancy_pct and adr/market_adr). Example: "RGI trend, last 60 days" -> select (date_trunc('week', d.metric_date) + interval '6 days')::date as week_ending, p.name, round(sum(d.revpar) / nullif(sum(d.market_revpar), 0) * 100, 2) as rgi from daily_metrics d join properties p on d.property_id = p.id where d.metric_date >= date_trunc('week', current_date - 60) group by 1, 2 order by 1, 2 limit 200
- total_rooms lives on properties, not daily_metrics: any occupancy or RevPAR formula using it must join properties.
- recommended_chart: line for time series, bar for category comparisons and the ranking and total cases above, kpi for a single-row single-value answer, table otherwise.
- report_title: a short human-readable title.
- caveat: optional single sentence a reader needs before trusting the result, e.g. a requested metric is not tracked so a proxy is used, or the period is partial (month-to-date). Leave empty when there is none.
- period_label: the period the query actually covers, as a short phrase such as "Last 30 days", "Last 60 days", "Month to date", "Yesterday". period_source: "question" when the question named the period, "default" when the missing-period rule supplied it.
- Chart-form rules (this and the next three bullets) apply only to the exact phrasings they list; for every other question never output scatter, pie, stacked_bar or combo.
- Explicit chart form - only when the question names "scatter", "pie", "donut", "share of", "stacked", "combo", "bar and line", or "on a second axis": honour it with recommended_chart scatter, pie, stacked_bar or combo, shape the SQL for it, and fill chart_spec {x, y, y2, label} with the exact column aliases used in the SQL.
- No-fit chart form - only these cases, when the question names no chart form: only a question whose text contains "ADR vs occupancy" or "occupancy vs ADR" together with "by property" -> scatter; a question mentioning RevPAR, CPOR, NPS or CSAT is never scatter. Every other metric pairing ("RevPAR vs occupancy" stays a single-row kpi, "CPOR vs ADR by property" stays a bar, "NPS and CSAT by segment" stays a bar) follows the earlier rules and is never scatter or combo; parts of a whole in one period (channel mix, cost breakdown) with no property axis -> pie, with a property axis -> stacked_bar.
- SQL shape per chart form: scatter = name, <x_metric>, <y_metric> one row per property (chart_spec x = x_metric alias, y = [y_metric alias], label = name); pie = <label>, <value> with at most 8 rows (x = label, y = [value]); stacked_bar = name, <part1>, <part2>, ... wide format, one column per part (x = name, y = all part aliases); combo = <x>, <bar_metric>, <line_metric> (x = <x>, y = [bar_metric], y2 = line_metric).
- chart_spec is null for bar, line, kpi and table, and for any question these chart-form rules do not name: never choose scatter, pie, stacked_bar or combo unless an Explicit or No-fit rule above matches, otherwise recommended_chart follows the earlier rules exactly; all other recommended_chart behaviour is unchanged.`;

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    sql: { type: "STRING" },
    recommended_chart: { type: "STRING", enum: [...CHARTS] },
    chart_spec: {
      type: "OBJECT",
      nullable: true,
      properties: {
        x: { type: "STRING" },
        y: { type: "ARRAY", items: { type: "STRING" } },
        y2: { type: "STRING", nullable: true },
        label: { type: "STRING", nullable: true },
      },
      required: ["x", "y"],
    },
    report_title: { type: "STRING" },
    caveat: { type: "STRING" },
    period_label: { type: "STRING" },
    period_source: { type: "STRING", enum: [...PERIOD_SOURCES] },
  },
  required: [
    "sql",
    "recommended_chart",
    "report_title",
    "period_label",
    "period_source",
  ],
};
