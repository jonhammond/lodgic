import assert from "node:assert/strict";
import { test } from "node:test";
import { dark, light } from "../theme/tokens.ts";
import { barRamp, contrast, denseRankDesc, hexToRgb, mix, relativeLuminance, rgbToHex } from "./color.ts";

test("hex round-trip and mix endpoints", () => {
  assert.equal(rgbToHex(hexToRgb("#305eb7")), "#305eb7");
  assert.equal(mix("#000000", "#ffffff", 0), "#000000");
  assert.equal(mix("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  assert.throws(() => hexToRgb("#305eb78c"));
});

test("contrast matches WCAG reference values", () => {
  assert.ok(Math.abs(contrast("#000000", "#ffffff") - 21) < 1e-9);
  assert.ok(Math.abs(contrast("#ffffff", "#000000") - 21) < 1e-9);
  assert.ok(Math.abs(contrast("#777777", "#ffffff") - 4.48) < 0.01);
});

test("denseRankDesc shares ranks on ties", () => {
  assert.deepEqual(denseRankDesc([5, 9, 5, 1]), [1, 0, 1, 2]);
  assert.deepEqual(denseRankDesc([]), []);
});

for (const [scheme, t] of [
  ["light", light],
  ["dark", dark],
] as const) {
  const hues = Array.from(new Set(Object.values(t.kpi).map((k) => k.bar)));
  for (const hue of hues) {
    test(`${scheme} ramp for ${hue}: monotone and within contrast floors`, () => {
      const ramp = barRamp(hue, t.bg.card, scheme, 10);
      assert.equal(ramp.length, 10);
      const lum = ramp.map(relativeLuminance);
      // Light fades toward white (lighter down the ramp); dark fades toward the card (dimmer down the ramp).
      const dir = scheme === "light" ? 1 : -1;
      for (let i = 1; i < lum.length; i++) assert.ok(dir * (lum[i] - lum[i - 1]) > 0, `step ${i} not monotone`);
      assert.ok(contrast(ramp[9], t.bg.card) >= 2.0, `bottom ${ramp[9]} = ${contrast(ramp[9], t.bg.card)}`);
      const floor = Math.min(3.0, contrast(hue, t.bg.card));
      assert.ok(contrast(ramp[0], t.bg.card) >= floor - 1e-9, `top ${ramp[0]} = ${contrast(ramp[0], t.bg.card)}`);
    });
  }
}

test("small n", () => {
  assert.deepEqual(barRamp("#4c7dd9", "#2a3138", "dark", 1), [mix("#4c7dd9", "#ffffff", 0.25)]);
  assert.deepEqual(barRamp("#305eb7", "#ffffff", "light", 1), [mix("#305eb7", "#000000", 0.2)]);
  const two = barRamp("#305eb7", "#ffffff", "light", 2);
  assert.equal(two[0], mix("#305eb7", "#000000", 0.2));
  assert.equal(two[1], mix("#305eb7", "#ffffff", 0.5));
  assert.deepEqual(barRamp("#305eb7", "#ffffff", "light", 0), []);
});
