import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SEGMENT_LABEL,
  SEGMENT_ORDER,
  comboSeries,
  guestTrend,
  propertyScores,
  segmentScores,
  trendBuckets,
  weighted,
  windowDates,
} from "./npsCsatEngine.ts";
import type { GuestRow } from "./npsCsat.ts";

const props = [
  { id: "a", name: "Alpha", segment: "midscale" },
  { id: "b", name: "Beta", segment: "luxury" },
  { id: "c", name: "Gamma", segment: "luxury" },
  { id: "d", name: "Delta", segment: "upscale" },
];

const mk = (id: string, date: string, rooms: number, nps: number, csat: number): GuestRow => ({
  property_id: id,
  metric_date: date,
  rooms_sold: rooms,
  nps,
  csat,
});

function dates(n: number, start = Date.UTC(2026, 0, 1)): string[] {
  return Array.from({ length: n }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}

test("segment output follows SEGMENT_ORDER regardless of input order; empty omitted", () => {
  const scores = propertyScores(
    [mk("a", "2026-01-01", 10, 50, 4), mk("b", "2026-01-01", 10, 60, 4.5), mk("d", "2026-01-01", 10, 70, 4.2)],
    props,
    "daily",
    "2026-01-01",
  );
  const out = segmentScores([...scores].reverse());
  assert.deepEqual(
    out.map((s) => s.segment),
    ["luxury", "upscale", "midscale"],
  );
  assert.equal(out[0].label, SEGMENT_LABEL.luxury);
  assert.equal(SEGMENT_ORDER.length, 5);
  assert.ok(SEGMENT_ORDER.indexOf("luxury") < SEGMENT_ORDER.indexOf("midscale"));
});

test("segmentScores weights by roomsSold and counts hotels", () => {
  const rows = [mk("b", "2026-01-01", 10, 40, 4), mk("c", "2026-01-01", 30, 80, 5)];
  const [seg] = segmentScores(propertyScores(rows, props, "daily", "2026-01-01"));
  assert.equal(seg.nps, 70);
  assert.equal(seg.csat, 4.75);
  assert.equal(seg.hotels, 2);
  assert.equal(seg.roomsSold, 40);
});

test("weighted: rooms-sold weighting and zero rooms", () => {
  const w = weighted([mk("a", "2026-01-01", 10, 40, 3), mk("a", "2026-01-02", 30, 80, 5)]);
  assert.equal(w.nps, 70);
  assert.equal(w.csat, 4.5);
  assert.equal(w.roomsSold, 40);
  assert.equal(w.days, 2);
  const z = weighted([mk("a", "2026-01-01", 0, 40, 3)]);
  assert.equal(z.nps, 0);
  assert.equal(z.csat, 0);
  assert.equal(weighted([]).nps, 0);
});

test("propertyScores sorted by name", () => {
  const s = propertyScores([mk("a", "2026-01-01", 1, 1, 1)], props, "daily", "2026-01-01");
  assert.deepEqual(
    s.map((p) => p.name),
    ["Alpha", "Beta", "Delta", "Gamma"],
  );
});

test("windows: daily, mtd, ytd", () => {
  const ds = dates(40);
  const latest = ds[39];
  assert.deepEqual([...windowDates(ds, "daily", latest)], [latest]);
  const mtd = windowDates(ds, "mtd", latest);
  assert.equal(mtd.size, 30);
  assert.ok(mtd.has(latest) && !mtd.has(ds[0]));
  assert.equal(windowDates(ds, "ytd", latest).size, 40);
  // dates after latest are excluded
  assert.equal(windowDates(ds, "ytd", ds[9]).size, 10);
});

test("buckets: mtd -> 30 daily buckets", () => {
  const ds = dates(45);
  const rows = ds.map((d) => mk("a", d, 10, 50, 4));
  const b = trendBuckets(rows, "mtd", ds[44]);
  assert.equal(b.length, 30);
  assert.equal(b[29].key, ds[44]);
  assert.ok(b.every((x) => !x.partial && x.dates.size === 1));
  assert.equal(trendBuckets(rows, "daily", ds[44]).length, 30);
});

test("buckets: ytd -> calendar months, last partial when not month-end", () => {
  const ds = dates(60); // Jan 1 .. Mar 1
  const rows = ds.map((d) => mk("a", d, 10, 50, 4));
  const b = trendBuckets(rows, "ytd", "2026-03-01");
  assert.deepEqual(
    b.map((x) => x.label),
    ["Jan 2026", "Feb 2026", "Mar 2026"],
  );
  assert.deepEqual(
    b.map((x) => x.partial),
    [false, false, true],
  );
  const full = trendBuckets(
    dates(31).map((d) => mk("a", d, 1, 1, 1)),
    "ytd",
    "2026-01-31",
  );
  assert.equal(full[0].partial, false);
});

test("guestTrend: hotel, segment (selected only), portfolio, null on zero rooms", () => {
  const ds = ["2026-01-01", "2026-01-02", "2026-01-03"];
  const rows = [
    mk("b", ds[0], 10, 40, 4),
    mk("b", ds[1], 10, 60, 4.5),
    mk("b", ds[2], 0, 99, 1),
    mk("c", ds[0], 10, 80, 5),
    mk("c", ds[1], 10, 80, 5),
    mk("c", ds[2], 0, 99, 1),
    mk("a", ds[0], 10, 20, 3),
    mk("a", ds[1], 10, 20, 3),
    mk("a", ds[2], 10, 20, 3),
  ];
  const buckets = trendBuckets(rows, "mtd", ds[2]);
  const t = guestTrend(rows, props, buckets, "b", "luxury", ["a", "b"]);
  assert.deepEqual(t.labels, buckets.map((x) => x.label));
  assert.deepEqual(t.hotel.nps, [40, 60, null]);
  assert.deepEqual(t.hotel.csat, [4, 4.5, null]);
  // segment excludes unselected c
  assert.deepEqual(t.segment.nps, [40, 60, null]);
  // portfolio = a + b
  assert.deepEqual(t.portfolio.nps, [30, 40, 20]);
  const all = guestTrend(rows, props, buckets, "b", "luxury", ["a", "b", "c"]);
  assert.deepEqual(all.segment.nps, [60, 70, null]);
  assert.equal(t.partialLast, false);
});

test("comboSeries shape", () => {
  const c = comboSeries(["X", "Y"], [10, 20], [4, 5], "T", "k");
  assert.equal(c.kind, "combo");
  assert.equal(c.key, "k");
  assert.equal(c.title, "T");
  assert.deepEqual(c.bar.values, [80, 100]);
  assert.deepEqual(c.bar.raw, [4, 5]);
  assert.equal(c.bar.color, "guest");
  assert.deepEqual(c.line.values, [10, 20]);
  assert.equal(c.line.color, "market");
});

test("12-month trend yields exactly 12 buckets when latest date is mid-month", () => {
  const ds = dates(365, Date.UTC(2025, 9, 17));
  assert.equal(ds[0], "2025-10-17");
  assert.equal(ds[364], "2026-10-16");
  const buckets = trendBuckets(
    ds.map((d) => mk("a", d, 10, 50, 4)),
    "ytd",
    "2026-10-16",
  );
  assert.equal(buckets.length, 12);
  assert.equal(buckets[0].key, "2025-11");
  assert.equal(buckets[11].key, "2026-10");
  assert.equal(buckets[11].partial, true);
  assert.equal(buckets[0].partial, false);
});
