import { CHARTS, METRIC_COLUMNS, SYSTEM_PROMPT } from "./schema_prompt.ts";

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

Deno.test("CHARTS is bar, line, kpi, table", () => {
  assert(
    JSON.stringify(CHARTS) === JSON.stringify(["bar", "line", "kpi", "table"]),
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
