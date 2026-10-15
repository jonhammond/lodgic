function assert(cond: boolean, msg = "assertion failed") {
  if (!cond) throw new Error(msg);
}
function assertEquals<T>(a: T, b: T) {
  assert(JSON.stringify(a) === JSON.stringify(b), `${a} !== ${b}`);
}
function assertNotEquals<T>(a: T, b: T) {
  assert(JSON.stringify(a) !== JSON.stringify(b), `${a} === ${b}`);
}
import {
  cacheKey,
  hashRows,
  isFresh,
  normalizePrompt,
  parseTtlHours,
} from "./cache.ts";

Deno.test("normalizePrompt folds case and whitespace", () => {
  assertEquals(
    normalizePrompt("  Portfolio   ADR,\nlast 30 days "),
    "portfolio adr, last 30 days",
  );
});

Deno.test("cacheKey is stable across prompt variants", async () => {
  const a = await cacheKey("sys", "Top property by occupancy");
  const b = await cacheKey("sys", "  top property  by occupancy");
  assertEquals(a, b);
});

Deno.test("cacheKey changes with system prompt and scope", async () => {
  const base = await cacheKey("sys v1", "q");
  assertNotEquals(base, await cacheKey("sys v2", "q"));
  assertNotEquals(base, await cacheKey("sys v1", "q\n\nRestrict to ('x')"));
});

Deno.test("hashRows differs when values change", async () => {
  const a = await hashRows([{ adr: 1 }]);
  const b = await hashRows([{ adr: 2 }]);
  assertNotEquals(a, b);
  assertEquals(a, await hashRows([{ adr: 1 }]));
});

Deno.test("isFresh respects ttl", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  assert(isFresh("2026-10-15T11:00:00Z", 2, now));
  assert(!isFresh("2026-10-15T09:00:00Z", 2, now));
  assert(!isFresh("garbage", 2, now));
});

Deno.test("parseTtlHours falls back on bad input", () => {
  assertEquals(parseTtlHours("24"), 24);
  assertEquals(parseTtlHours("0"), 168);
  assertEquals(parseTtlHours(undefined), 168);
});
