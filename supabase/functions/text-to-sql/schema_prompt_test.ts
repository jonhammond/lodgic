import {
  CHARTS,
  METRIC_COLUMNS,
  parsePeriod,
  PERIOD_LABEL_MAX,
  PERIOD_SOURCES,
  SYSTEM_PROMPT,
} from "./schema_prompt.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test("every metric column appears in the system prompt", () => {
  for (const col of METRIC_COLUMNS) {
    assert(SYSTEM_PROMPT.includes(col), `missing column in prompt: ${col}`);
  }
});

Deno.test("prompt retains SQL formatting rules", () => {
  assert(SYSTEM_PROMPT.includes("semicolon"), "missing semicolon rule");
  assert(SYSTEM_PROMPT.includes("double quotes"), "missing double quotes rule");
});

Deno.test("CHARTS is the four legacy kinds plus scatter, pie, combo, stacked_bar", () => {
  assert(
    JSON.stringify(CHARTS) === JSON.stringify([
      "bar",
      "line",
      "kpi",
      "table",
      "scatter",
      "pie",
      "combo",
      "stacked_bar",
    ]),
    `unexpected CHARTS: ${JSON.stringify(CHARTS)}`,
  );
});

Deno.test("integer-column divisions in prompt formulas are cast to numeric", () => {
  assert(
    SYSTEM_PROMPT.includes("::numeric / nullif(sum(total_rooms), 0)"),
    "missing numeric cast on occupancy formula",
  );
  const intCols = [
    "rooms_sold",
    "total_rooms",
    "bookings",
    "direct_bookings",
    "ota_bookings",
    "gds_bookings",
    "group_bookings",
    "cancellations",
    "rooms_cleaned",
  ];
  for (const col of intCols) {
    const re = new RegExp("sum\\(" + col + "\\)\\s*/");
    assert(!re.test(SYSTEM_PROMPT), `uncast integer division on ${col}`);
  }
});

Deno.test("ranking questions return every property, never only the winner", () => {
  assert(
    SYSTEM_PROMPT.includes("never only the winner"),
    "missing ranking rule",
  );
});

Deno.test("additive portfolio totals return one row per property", () => {
  assert(
    SYSTEM_PROMPT.includes("one row per property"),
    "missing breakdown rule",
  );
});

Deno.test("per-property trends return weekly long format", () => {
  assert(SYSTEM_PROMPT.includes("week_ending"), "missing week_ending bucket");
  assert(
    SYSTEM_PROMPT.includes("one row per property per week"),
    "missing long-format trend rule",
  );
});

Deno.test("missing-period rule defaults to the last 30 days without touching shape", () => {
  assert(
    SYSTEM_PROMPT.includes("names no date"),
    "missing default-period trigger",
  );
  assert(
    SYSTEM_PROMPT.includes("metric_date >= current_date - 30"),
    "missing 30-day default filter",
  );
  assert(
    SYSTEM_PROMPT.includes("does not change grouping, columns, row shape"),
    "default-period rule must not alter result shape",
  );
});

Deno.test("prompt describes period_label and period_source", () => {
  assert(SYSTEM_PROMPT.includes("period_label:"), "missing period_label");
  assert(SYSTEM_PROMPT.includes("period_source:"), "missing period_source");
  assert(
    SYSTEM_PROMPT.includes('"default" when'),
    "missing default source rule",
  );
});

Deno.test("PERIOD_SOURCES is question, default", () => {
  assert(
    JSON.stringify(PERIOD_SOURCES) === JSON.stringify(["question", "default"]),
    "unexpected PERIOD_SOURCES",
  );
});

Deno.test("parsePeriod passes valid values through", () => {
  const out = parsePeriod({
    period_label: " Last 30 days ",
    period_source: "default",
  });
  assert(out.period_label === "Last 30 days", "label not trimmed");
  assert(out.period_source === "default", "source lost");
});

Deno.test("parsePeriod nulls blank label and unknown source", () => {
  const out = parsePeriod({ period_label: "   ", period_source: "guess" });
  assert(out.period_label === null, "blank label should be null");
  assert(out.period_source === null, "unknown source should be null");
});

Deno.test("parsePeriod nulls labels longer than PERIOD_LABEL_MAX", () => {
  const long = parsePeriod({ period_label: "x".repeat(PERIOD_LABEL_MAX + 1) });
  assert(long.period_label === null, "over-long label should be null");
  const max = parsePeriod({ period_label: "x".repeat(PERIOD_LABEL_MAX) });
  assert(
    max.period_label?.length === PERIOD_LABEL_MAX,
    "max-length label kept",
  );
});

Deno.test("parsePeriod tolerates missing fields and non-objects", () => {
  const a = parsePeriod({});
  assert(a.period_label === null && a.period_source === null, "missing fields");
  const b = parsePeriod(null);
  assert(b.period_label === null && b.period_source === null, "null input");
  const c = parsePeriod({ period_label: 42, period_source: 7 });
  assert(c.period_label === null && c.period_source === null, "wrong types");
});
