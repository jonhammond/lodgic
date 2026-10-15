import assert from "node:assert/strict";
import { test } from "node:test";
import { baseInputs, compute, DAYS, sortRows } from "./revparEngine.ts";
import type { DailyRow, PropertyBase } from "./revparEngine.ts";

const props = [
  { id: "a", name: "Alpha", total_rooms: 100 },
  { id: "b", name: "Beta", total_rooms: 300 },
];

function mk(id: string, date: string, sold: number, rev: number): DailyRow {
  return { property_id: id, metric_date: date, rooms_sold: sold, total_revenue: rev };
}

function dates(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
  }
  return out;
}

function series(n: number): DailyRow[] {
  const rows: DailyRow[] = [];
  dates(n).forEach((d, i) => {
    // latest date has distinct values
    const last = i === n - 1;
    rows.push(mk("a", d, last ? 80 : 50, last ? 8000 : 5000));
    rows.push(mk("b", d, last ? 90 : 150, last ? 9000 : 15000));
  });
  return rows;
}

test("daily window uses latest date only", () => {
  const rows = series(40);
  const latest = dates(40)[39];
  const base = baseInputs(rows, props, "daily", latest);
  const a = base.find((p) => p.id === "a")!;
  assert.equal(a.occupancy, 0.8);
  assert.equal(a.adr, 100);
  assert.equal(a.days, 1);
});

test("mtd window uses latest 30 dates", () => {
  const rows = series(40);
  const base = baseInputs(rows, props, "mtd", dates(40)[39]);
  const a = base.find((p) => p.id === "a")!;
  assert.equal(a.days, 30);
  assert.ok(Math.abs(a.occupancy - (29 * 50 + 80) / 3000) < 1e-12);
});

test("ytd truncated history still multiplies by 365 and reports days used", () => {
  const rows = series(90);
  const base = baseInputs(rows, props, "ytd", dates(90)[89]);
  assert.equal(base[0].days, 90);
  const { rows: calc, daysUsed } = compute(base, "ytd", 1);
  assert.equal(daysUsed, 90);
  assert.equal(calc.find((r) => r.id === "a")!.roomsAvailable, 100 * 365);
});

test("demand shift clamps occupancy at 100%", () => {
  const base: PropertyBase[] = [{ id: "a", name: "A", rooms: 100, occupancy: 0.8, adr: 100, days: 1 }];
  const { rows } = compute(base, "daily", 1.5);
  assert.equal(rows[0].roomsSold, 100);
  assert.equal(rows[0].revpar, 100);
  assert.equal(rows[0].occupancy, 1);
  assert.equal(compute(base, "daily", 1.1).rows[0].occupancy, 0.8 * 1.1);
});

test("zero sales gives ADR 0 and no NaN", () => {
  const base = baseInputs([mk("a", "2026-01-01", 0, 0)], props, "daily", "2026-01-01");
  const a = base.find((p) => p.id === "a")!;
  assert.equal(a.adr, 0);
  const { rows } = compute(base, "daily", 1);
  assert.equal(rows.find((r) => r.id === "a")!.revpar, 0);
});

test("portfolio is room-weighted ratios of sums", () => {
  const base: PropertyBase[] = [
    { id: "a", name: "A", rooms: 100, occupancy: 0.5, adr: 100, days: 1 },
    { id: "b", name: "B", rooms: 300, occupancy: 0.9, adr: 200, days: 1 },
  ];
  const { portfolio: p } = compute(base, "daily", 1);
  assert.equal(p.rooms, 400);
  assert.equal(p.roomsAvailable, 400);
  assert.equal(p.roomsSold, 320);
  assert.equal(p.revenue, 5000 + 54000);
  assert.equal(p.occupancy, 0.8);
  assert.equal(p.adr, 59000 / 320);
  assert.equal(p.revpar, 59000 / 400);
  assert.equal(p.target, p.revpar);
});

test("tier cut-offs", () => {
  const prop = (id: string, adr: number): PropertyBase => ({
    id,
    name: id,
    rooms: 100,
    occupancy: 1,
    adr,
    days: 1,
  });
  const tiers = (...adrs: number[]) =>
    compute(adrs.map((a, i) => prop(String(i), a)), "daily", 1).rows.map((r) => r.tier);
  // target = 100: above, below (>= 0.85 * target), critical (< 0.85 * target)
  assert.deepEqual(tiers(140, 90, 70), ["above", "below", "critical"]);
  // revpar exactly at target is above
  assert.deepEqual(tiers(100, 100), ["above", "above"]);
  // revpar exactly 0.85 * target is below, not critical
  assert.deepEqual(tiers(85, 115), ["below", "above"]);
});

test("daysUsed is the max days across properties", () => {
  const rows = [mk("a", "2026-01-01", 10, 1000), mk("a", "2026-01-02", 10, 1000), mk("b", "2026-01-02", 10, 1000)];
  const base = baseInputs(rows, props, "ytd", "2026-01-02");
  assert.deepEqual(base.map((p) => p.days), [2, 1]);
  assert.equal(compute(base, "ytd", 1).daysUsed, 2);
});

test("sortRows for every key and direction with stable ties", () => {
  const base: PropertyBase[] = [
    { id: "1", name: "Bravo", rooms: 200, occupancy: 0.5, adr: 100, days: 1 },
    { id: "2", name: "Alpha", rooms: 100, occupancy: 0.7, adr: 100, days: 1 },
    { id: "3", name: "Charlie", rooms: 200, occupancy: 0.6, adr: 150, days: 1 },
  ];
  const { rows } = compute(base, "daily", 1);
  const ids = (k: Parameters<typeof sortRows>[1], d: "asc" | "desc") =>
    sortRows(rows, k, d).map((r) => r.id).join("");
  assert.equal(ids("name", "asc"), "213");
  assert.equal(ids("name", "desc"), "312");
  assert.equal(ids("occupancy", "asc"), "132");
  assert.equal(ids("occupancy", "desc"), "231");
  assert.equal(ids("adr", "asc"), "123");
  assert.equal(ids("adr", "desc"), "312");
  assert.equal(ids("rooms", "asc"), "213");
  assert.equal(ids("rooms", "desc"), "132");
  // revpar: 50, 70, 90
  assert.equal(ids("revpar", "asc"), "123");
  assert.equal(ids("revpar", "desc"), "321");
  assert.equal(rows.map((r) => r.id).join(""), "123", "input not mutated");
});

test("DAYS constants", () => {
  assert.deepEqual(DAYS, { daily: 1, mtd: 30, ytd: 365 });
});

test("compute excludes properties with no rows in the window", () => {
  const rows = [mk("a", "2026-01-02", 80, 8000)];
  const base = baseInputs(rows, props, "daily", "2026-01-02");
  const out = compute(base, "daily", 1);
  assert.deepEqual(out.rows.map((r) => r.id), ["a"]);
  assert.equal(out.portfolio.rooms, 100);
  assert.equal(out.portfolio.occupancy, 0.8);
});
