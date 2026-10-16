import assert from "node:assert/strict";
import { test } from "node:test";
import { fitTicksByWidth } from "./fitTicks.ts";

const ticks = [0, 500000, 1000000, 1500000, 2000000];
const widths = [12, 36, 36, 36, 36];

test("thins when narrow, keeps first and last", () => {
  const idx = fitTicksByWidth(ticks, widths, 150, 10);
  assert.ok(idx.length === 2 || idx.length === 3);
  assert.equal(idx[0], 0);
  assert.equal(idx[idx.length - 1], 4);
});

test("keeps all when wide", () => {
  assert.deepEqual(fitTicksByWidth(ticks, widths, 1500, 10), [0, 1, 2, 3, 4]);
});

test("short or zero-width input unchanged", () => {
  assert.deepEqual(fitTicksByWidth([0, 1], [5, 5], 100, 10), [0, 1]);
  assert.deepEqual(fitTicksByWidth(ticks, widths, 0, 10), [0, 1, 2, 3, 4]);
});
