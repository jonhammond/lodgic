import assert from "node:assert/strict";
import { test } from "node:test";
import { chartType, isCompact, nameLayout } from "../components/charts/typography.ts";

test("tier boundaries", () => {
  const t = (w: number) => chartType(w).tier;
  assert.equal(t(0), "base");
  assert.equal(t(359), "compact");
  assert.equal(t(360), "base");
  assert.equal(t(899), "base");
  assert.equal(t(900), "wide");
  assert.equal(t(1399), "wide");
  assert.equal(t(1400), "xwide");
  assert.equal(isCompact(0), false);
  assert.equal(isCompact(359), true);
  assert.equal(isCompact(360), false);
});

test("compact equals legacy constants", () => {
  const ty = chartType(300);
  assert.equal(ty.rowH, 26);
  assert.equal(ty.rowHWrapped, 36);
  assert.equal(ty.barW, 16);
  assert.equal(ty.monoAdvance, 6.2);
  assert.equal(ty.tickFont.fontSize, 10);
  assert.equal(ty.labelFont.fontSize, 11);
  assert.deepEqual(nameLayout(ty), { chars: 18, left: 122 });
});

test("base nameLayout", () => {
  assert.equal(nameLayout(chartType(360)).chars, 26);
  const compact26 = { ...chartType(300), tier: "base" as const };
  assert.equal(nameLayout(compact26).left, 170);
});
