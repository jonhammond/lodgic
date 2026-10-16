import assert from "node:assert/strict";
import { test } from "node:test";
import type { QueryResult } from "./api.ts";
import { axisTitle, metricLabel } from "../components/charts/format.ts";
import { explicitFacts, mapExplicit, quadrantOf } from "./explicitCharts.ts";
import type { DualAxisSeries, PieSeries, ScatterSeries, StackedSeries } from "./explicitCharts.ts";
import { mapResult } from "./resultMapping.ts";

const result = (
  chart: QueryResult["chart"],
  chart_spec: QueryResult["chart_spec"],
  rows: Record<string, unknown>[],
  title = "T",
): QueryResult => ({ sql: "select 1", chart, chart_spec, title, rows });

const SCATTER_ROWS = [
  { name: "Harbor Inn", adr: 100, occupancy_pct: 60 },
  { name: "Alpine Lodge", adr: 150, occupancy_pct: 72 },
  { name: "City Suites", adr: 200, occupancy_pct: 85 },
  { name: "Bay View", adr: 250, occupancy_pct: 91 },
];

test("scatter maps x, y, units and labels from the first string column", () => {
  const s = mapExplicit(result("scatter", { x: "adr", y: ["occupancy_pct"] }, SCATTER_ROWS, "ADR vs occupancy")) as ScatterSeries;
  assert.equal(s.kind, "scatter");
  assert.equal(s.title, "ADR vs occupancy");
  assert.equal(s.xLabel, "ADR");
  assert.equal(s.yLabel, "Occupancy");
  assert.equal(s.xTitle, "ADR ($)");
  assert.equal(s.yTitle, "Occupancy (%)");
  assert.equal(s.xUnit, "currency");
  assert.equal(s.yUnit, "percent");
  assert.deepEqual(s.points[0], { label: "Harbor Inn", x: 100, y: 60, quadrant: "weak" });
  assert.deepEqual(s.points.map((p) => p.quadrant), ["weak", "weak", "strong", "strong"]);
  assert.equal(s.points.length, 4);
});

test("scatter label prefers spec.label, falls back to row index", () => {
  const rows = [
    { code: "A", adr: "100", occ: "60" },
    { code: "B", adr: "150", occ: "70" },
    { code: "C", adr: "175", occ: "75" },
  ];
  const labelled = mapExplicit(result("scatter", { x: "adr", y: ["occ"], label: "code" }, rows)) as ScatterSeries;
  assert.deepEqual(labelled.points.map((p) => p.label), ["A", "B", "C"]);
  assert.deepEqual(labelled.points.map((p) => p.x), [100, 150, 175]);
  const numericOnly = [{ adr: 100, occ: 60 }, { adr: 150, occ: 70 }, { adr: 175, occ: 75 }];
  const indexed = mapExplicit(result("scatter", { x: "adr", y: ["occ"] }, numericOnly)) as ScatterSeries;
  assert.deepEqual(indexed.points.map((p) => p.label), ["1", "2", "3"]);
});

test("pie sorts slices descending with pct of total", () => {
  const rows = [
    { channel: "OTA", revenue: 300 },
    { channel: "Direct", revenue: 600 },
    { channel: "GDS", revenue: 100 },
  ];
  const s = mapExplicit(result("pie", { x: "channel", y: ["revenue"] }, rows)) as PieSeries;
  assert.equal(s.kind, "pie");
  assert.equal(s.unit, "currency");
  assert.deepEqual(s.slices.map((x) => x.label), ["Direct", "OTA", "GDS"]);
  assert.deepEqual(s.slices.map((x) => x.pct), [60, 30, 10]);
});

test("pie groups slices beyond the eighth into Other", () => {
  const rows = Array.from({ length: 11 }, (_, i) => ({ seg: `S${i + 1}`, bookings: 110 - i * 10 }));
  const s = mapExplicit(result("pie", { x: "seg", y: ["bookings"] }, rows)) as PieSeries;
  assert.equal(s.slices.length, 9);
  assert.deepEqual(s.slices[7].label, "S8");
  const other = s.slices[8];
  assert.equal(other.label, "Other");
  assert.equal(other.value, 30 + 20 + 10);
  const total = rows.reduce((a, r) => a + r.bookings, 0);
  assert.ok(Math.abs(s.slices.reduce((a, x) => a + x.pct, 0) - 100) < 1e-9);
  assert.ok(Math.abs(other.pct - (60 / total) * 100) < 1e-9);
});

test("pie rejects negative values and zero totals", () => {
  assert.equal(mapExplicit(result("pie", { x: "a", y: ["v"] }, [{ a: "x", v: -1 }, { a: "y", v: 5 }])), null);
  assert.equal(mapExplicit(result("pie", { x: "a", y: ["v"] }, [{ a: "x", v: 0 }, { a: "y", v: 0 }])), null);
});

test("stacked_bar maps one part per y with distinct colours", () => {
  const rows = [
    { month: "Jan", direct_bookings: 10, ota_bookings: 20, gds_bookings: 5 },
    { month: "Feb", direct_bookings: 15, ota_bookings: 10, gds_bookings: 8 },
  ];
  const s = mapExplicit(
    result("stacked_bar", { x: "month", y: ["direct_bookings", "ota_bookings", "gds_bookings"] }, rows),
  ) as StackedSeries;
  assert.equal(s.kind, "stacked");
  assert.equal(s.unit, "number");
  assert.deepEqual(s.labels, ["Jan", "Feb"]);
  assert.deepEqual(s.parts.map((p) => p.title), ["Direct Bookings", "OTA Bookings", "GDS Bookings"]);
  assert.deepEqual(s.parts.map((p) => p.values), [[10, 15], [20, 10], [5, 8]]);
  assert.equal(new Set(s.parts.map((p) => p.color)).size, 3);
});

test("stacked_bar with mixed units falls through", () => {
  const rows = [{ m: "Jan", revenue: 100, occupancy_pct: 50 }];
  assert.equal(mapExplicit(result("stacked_bar", { x: "m", y: ["revenue", "occupancy_pct"] }, rows)), null);
});

test("combo maps bar from y[0] and line from y2", () => {
  const rows = [
    { name: "Harbor Inn", rooms_sold: 900, adr: "150.5" },
    { name: "Alpine Lodge", rooms_sold: 700, adr: 170 },
  ];
  const s = mapExplicit(result("combo", { x: "name", y: ["rooms_sold"], y2: "adr" }, rows)) as DualAxisSeries;
  assert.equal(s.kind, "dual");
  assert.deepEqual(s.labels, ["Harbor Inn", "Alpine Lodge"]);
  assert.equal(s.bar.key, "rooms_sold");
  assert.equal(s.bar.unit, "number");
  assert.deepEqual(s.bar.values, [900, 700]);
  assert.equal(s.line.key, "adr");
  assert.equal(s.line.unit, "currency");
  assert.deepEqual(s.line.values, [150.5, 170]);
  assert.notEqual(s.bar.color, s.line.color);
});

test("combo without y2 falls through", () => {
  const rows = [{ name: "A", rooms_sold: 1 }];
  assert.equal(mapExplicit(result("combo", { x: "name", y: ["rooms_sold"] }, rows)), null);
  assert.equal(mapExplicit(result("combo", { x: "name", y: ["rooms_sold"], y2: null }, rows)), null);
});

test("missing column, non-numeric y, empty rows, no spec and legacy kinds return null", () => {
  const rows = [{ name: "A", v: 1 }, { name: "B", v: 2 }, { name: "C", v: 3 }];
  assert.equal(mapExplicit(result("pie", { x: "nope", y: ["v"] }, rows)), null);
  assert.equal(mapExplicit(result("pie", { x: "name", y: ["nope"] }, rows)), null);
  assert.equal(mapExplicit(result("scatter", { x: "v", y: ["v"], label: "nope" }, rows)), null);
  assert.equal(mapExplicit(result("pie", { x: "name", y: ["v"] }, [])), null);
  assert.equal(mapExplicit(result("pie", null, rows)), null);
  assert.equal(mapExplicit(result("bar", { x: "name", y: ["v"] }, rows)), null);
  assert.equal(mapExplicit(result("pie", { x: "name", y: ["v"] }, [{ name: "A", v: "n/a" }, { name: "B", v: null }])), null);
  assert.equal(
    mapExplicit(result("scatter", { x: "name", y: ["v"] }, rows)),
    null,
    "scatter x must be numeric",
  );
  assert.equal(mapExplicit(result("pie", { x: "name", y: [] }, rows)), null);
});

test("mapResult uses the explicit branch and keeps the table", () => {
  const r = result("pie", { x: "name", y: ["v"] }, [{ name: "A", v: 1 }, { name: "B", v: 3 }], "Share");
  const m = mapResult(r);
  assert.equal(m.headline, "Share");
  assert.equal(m.charts.length, 1);
  assert.equal(m.charts[0].kind, "pie");
  assert.equal(m.pair, null);
  assert.deepEqual(m.table, { columns: ["name", "v"], rows: r.rows });
  assert.deepEqual(m.facts, explicitFacts(m.charts[0] as PieSeries));
});

test("scatter facts: top and bottom on y, correlation only when |r| >= 0.5", () => {
  const s = mapExplicit(result("scatter", { x: "adr", y: ["occupancy_pct"] }, SCATTER_ROWS)) as ScatterSeries;
  const facts = explicitFacts(s);
  assert.equal(facts.length, 3);
  assert.match(facts[0], /Bay View/);
  assert.match(facts[0], /91\.0%/);
  assert.match(facts[1], /Harbor Inn/);
  assert.match(facts[2], /Higher ADR tends to higher Occupancy/);

  const flat = [
    { n: "A", x: 1, y: 5 },
    { n: "B", x: 2, y: 9 },
    { n: "C", x: 3, y: 5 },
    { n: "D", x: 4, y: 9 },
  ];
  const f = explicitFacts(mapExplicit(result("scatter", { x: "x", y: ["y"] }, flat)) as ScatterSeries);
  assert.equal(f.length, 2);
  assert.ok(f.every((x) => !/tends to/.test(x)));
});

test("scatter facts: negative correlation reads as lower", () => {
  const rows = [
    { n: "A", x: 1, y: 9 },
    { n: "B", x: 2, y: 7 },
    { n: "C", x: 3, y: 4 },
  ];
  const f = explicitFacts(mapExplicit(result("scatter", { x: "x", y: ["y"] }, rows)) as ScatterSeries);
  assert.match(f[2], /Higher X tends to lower Y/);
});

test("pie facts: largest slice and its share", () => {
  const rows = [{ c: "OTA", v: 300 }, { c: "Direct", v: 600 }, { c: "GDS", v: 100 }];
  const facts = explicitFacts(mapExplicit(result("pie", { x: "c", y: ["v"] }, rows)) as PieSeries);
  assert.equal(facts.length, 1);
  assert.match(facts[0], /Direct/);
  assert.match(facts[0], /600/);
  assert.match(facts[0], /60%/);
});

test("stacked facts: largest total and its biggest part", () => {
  const rows = [
    { m: "Jan", a_bookings: 10, b_bookings: 20 },
    { m: "Feb", a_bookings: 50, b_bookings: 20 },
  ];
  const facts = explicitFacts(
    mapExplicit(result("stacked_bar", { x: "m", y: ["a_bookings", "b_bookings"] }, rows)) as StackedSeries,
  );
  assert.equal(facts.length, 2);
  assert.match(facts[0], /Feb/);
  assert.match(facts[0], /70/);
  assert.match(facts[1], /A Bookings/);
  assert.match(facts[1], /50/);
});

test("dual facts: max bar and max line", () => {
  const rows = [
    { name: "Harbor Inn", rooms_sold: 900, adr: 150 },
    { name: "Alpine Lodge", rooms_sold: 700, adr: 170 },
  ];
  const facts = explicitFacts(
    mapExplicit(result("combo", { x: "name", y: ["rooms_sold"], y2: "adr" }, rows)) as DualAxisSeries,
  );
  assert.equal(facts.length, 2);
  assert.match(facts[0], /Harbor Inn/);
  assert.match(facts[0], /900/);
  assert.match(facts[1], /Alpine Lodge/);
  assert.match(facts[1], /\$170/);
});

test("rows with null x or y are dropped from scatter, pie and combo", () => {
  const scatterRows = [
    { name: "A", x: 1, y: 5 },
    { name: "B", x: null, y: 6 },
    { name: "C", x: 3, y: null },
    { name: "D", x: 4, y: 8 },
    { name: "E", x: 5, y: 9 },
  ];
  const sc = mapExplicit(result("scatter", { x: "x", y: ["y"] }, scatterRows)) as ScatterSeries;
  assert.deepEqual(sc.points.map((p) => p.label), ["A", "D", "E"]);
  assert.equal(mapExplicit(result("scatter", { x: "x", y: ["y"] }, scatterRows.slice(0, 4))), null, "under 3 usable points");

  const pie = mapExplicit(
    result("pie", { x: "c", y: ["v"] }, [{ c: "A", v: 1 }, { c: "B", v: null }, { c: "C", v: 3 }]),
  ) as PieSeries;
  assert.deepEqual(pie.slices.map((x) => x.label), ["C", "A"]);

  const dual = mapExplicit(
    result("combo", { x: "n", y: ["rooms_sold"], y2: "adr" }, [
      { n: "A", rooms_sold: 1, adr: 10 },
      { n: "B", rooms_sold: null, adr: 20 },
      { n: "C", rooms_sold: 3, adr: null },
      { n: "D", rooms_sold: 4, adr: 40 },
    ]),
  ) as DualAxisSeries;
  assert.deepEqual(dual.labels, ["A", "D"]);
  assert.deepEqual(dual.bar.values, [1, 4]);
  assert.deepEqual(dual.line.values, [10, 40]);
});

test("stacked treats null parts as 0 and falls through when nothing is usable", () => {
  const rows = [
    { m: "Jan", a_bookings: 10, b_bookings: null },
    { m: "Feb", a_bookings: null, b_bookings: 7 },
  ];
  const s = mapExplicit(result("stacked_bar", { x: "m", y: ["a_bookings", "b_bookings"] }, rows)) as StackedSeries;
  assert.deepEqual(s.parts.map((p) => p.values), [[10, 0], [0, 7]]);
  const empty = [{ m: "Jan", a_bookings: null, b_bookings: null }];
  assert.equal(mapExplicit(result("stacked_bar", { x: "m", y: ["a_bookings", "b_bookings"] }, empty)), null);
});

test("stacked parts get distinct hues even for same-family columns", () => {
  const cols = ["rooms_cost", "fnb_cost", "admin_cost", "marketing_cost", "maintenance_cost"];
  const rows = [Object.fromEntries([["p", "A"], ...cols.map((c, i) => [c, i + 1])])];
  const s = mapExplicit(result("stacked_bar", { x: "p", y: cols }, rows)) as StackedSeries;
  const hue: Record<string, string> = { distribution: "adr", market: "revpar", guest: "occupancy" };
  assert.equal(new Set(s.parts.map((p) => hue[p.color] ?? p.color)).size, 5);
});

test("scatter auto-label prefers a name column and skips date columns", () => {
  const rows = [
    { metric_date: "2026-01-01", note: "x", property_name: "Harbor Inn", adr: 100, occ: 60 },
    { metric_date: "2026-01-02", note: "y", property_name: "Alpine Lodge", adr: 150, occ: 70 },
    { metric_date: "2026-01-03", note: "z", property_name: "City Suites", adr: 175, occ: 75 },
  ];
  const s = mapExplicit(result("scatter", { x: "adr", y: ["occ"] }, rows)) as ScatterSeries;
  assert.deepEqual(s.points.map((p) => p.label), ["Harbor Inn", "Alpine Lodge", "City Suites"]);
  const dateOnly = rows.map(({ metric_date, adr, occ }) => ({ metric_date, adr, occ }));
  const d = mapExplicit(result("scatter", { x: "adr", y: ["occ"] }, dateOnly)) as ScatterSeries;
  assert.deepEqual(d.points.map((p) => p.label), ["1", "2", "3"]);
});

test("combo formats date-like x as MM/DD, or month names when all on the 1st", () => {
  const daily = [
    { d: "2026-03-05", rooms_sold: 10, adr: 100 },
    { d: "2026-03-06", rooms_sold: 12, adr: 110 },
  ];
  const a = mapExplicit(result("combo", { x: "d", y: ["rooms_sold"], y2: "adr" }, daily)) as DualAxisSeries;
  assert.deepEqual(a.labels, ["03/05", "03/06"]);
  const monthly = [
    { d: "2026-01-01", rooms_sold: 10, adr: 100 },
    { d: "2026-02-01", rooms_sold: 12, adr: 110 },
  ];
  const b = mapExplicit(result("combo", { x: "d", y: ["rooms_sold"], y2: "adr" }, monthly)) as DualAxisSeries;
  assert.deepEqual(b.labels, ["Jan", "Feb"]);
});

test("metricLabel strips ratio suffixes; axisTitle appends the unit", () => {
  assert.equal(metricLabel("occupancy_pct"), "Occupancy");
  assert.equal(metricLabel("adr"), "ADR");
  assert.equal(axisTitle("adr", "currency"), "ADR ($)");
  assert.equal(axisTitle("occupancy_pct", "percent"), "Occupancy (%)");
  assert.equal(axisTitle("mpi", "index"), "MPI (index)");
  assert.equal(axisTitle("rooms_sold", "number"), "Rooms Sold");
});

test("quadrantOf splits at the means; ties count as high", () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = [5, 1, 3, 4, 2];
  const q = xs.map((x, i) => quadrantOf(x, ys[i], 3, 3));
  assert.deepEqual(q, ["busy", "weak", "strong", "strong", "pricey"]);
});
