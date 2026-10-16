import assert from "node:assert/strict";
import { test } from "node:test";
import { isNpsCsatQuestion } from "./npsCsat.ts";

test("chip text routes to mtd", () => {
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment"), "mtd");
});

test("reversed head and separators", () => {
  assert.equal(isNpsCsatQuestion("CSAT vs NPS by segment"), "mtd");
  assert.equal(isNpsCsatQuestion("nps & csat by segment"), "mtd");
  assert.equal(isNpsCsatQuestion("NPS / CSAT by segment"), "mtd");
  assert.equal(isNpsCsatQuestion("csat versus nps by segment"), "mtd");
});

test("daily tails", () => {
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment, yesterday"), "daily");
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment for today"), "daily");
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment: latest day"), "daily");
});

test("trailing question mark is accepted", () => {
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment?"), "mtd");
});

test("mtd tails", () => {
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment over the last 30 days"), "mtd");
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment this month"), "mtd");
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment mtd"), "mtd");
});

test("ytd tails", () => {
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment, last 12 months"), "ytd");
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment annualised"), "ytd");
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment in the past year"), "ytd");
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment ytd"), "ytd");
});

test("other ranges fall through", () => {
  assert.equal(isNpsCsatQuestion("NPS and CSAT by segment, last 7 days"), null);
});

test("unrelated text", () => {
  assert.equal(isNpsCsatQuestion("RevPAR vs occupancy"), null);
  assert.equal(isNpsCsatQuestion("show me nps by property"), null);
  assert.equal(isNpsCsatQuestion(""), null);
});
