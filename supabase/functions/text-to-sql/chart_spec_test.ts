import {
  EXPLICIT_FORM_TRIGGERS,
  parseChartSpec,
  requestsExplicitForm,
  validateSpec,
} from "./chart_spec.ts";
import { RESPONSE_SCHEMA } from "./schema_prompt.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function captureLogs<T>(fn: () => T): { result: T; logs: string[] } {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => logs.push(a.join(" "));
  try {
    return { result: fn(), logs };
  } finally {
    console.log = orig;
  }
}

const rowsN = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `P${i}`,
    adr: 100 + i,
    occ: "0.8",
    rooms: i,
  }));

Deno.test("RESPONSE_SCHEMA enum has all eight chart kinds", () => {
  const e = RESPONSE_SCHEMA.properties.recommended_chart.enum;
  const want = [
    "bar",
    "line",
    "kpi",
    "table",
    "scatter",
    "pie",
    "combo",
    "stacked_bar",
  ];
  assert(
    JSON.stringify(e) === JSON.stringify(want),
    `unexpected enum: ${JSON.stringify(e)}`,
  );
});

Deno.test("RESPONSE_SCHEMA chart_spec is nullable and not top-level required", () => {
  const s = RESPONSE_SCHEMA.properties.chart_spec;
  assert(s.nullable === true && s.type === "OBJECT", "chart_spec shape");
  assert(
    JSON.stringify(s.required) === '["x","y"]',
    "chart_spec required x,y",
  );
  assert(
    !(RESPONSE_SCHEMA.required as string[]).includes("chart_spec"),
    "chart_spec must be optional",
  );
});

Deno.test("parseChartSpec accepts valid spec only for new kinds", () => {
  const raw = { x: "name", y: ["adr"], y2: null, label: null };
  const s = parseChartSpec("scatter", raw);
  assert(
    s !== null && s.x === "name" && s.y[0] === "adr" && s.y2 === null,
    "valid scatter spec parsed",
  );
  assert(parseChartSpec("bar", raw) === null, "bar forces null");
  assert(parseChartSpec("table", raw) === null, "table forces null");
});

Deno.test("parseChartSpec rejects malformed specs", () => {
  assert(parseChartSpec("pie", null) === null, "null");
  assert(parseChartSpec("pie", "x") === null, "string");
  assert(parseChartSpec("pie", { x: "", y: ["a"] }) === null, "empty x");
  assert(parseChartSpec("pie", { x: "a", y: [] }) === null, "empty y");
  assert(parseChartSpec("pie", { x: "a", y: [1] }) === null, "non-string y");
  assert(parseChartSpec("pie", { x: "a", y: "b" }) === null, "y not array");
  const s = parseChartSpec("pie", { x: "a", y: ["b"], y2: 3, label: "" });
  assert(s !== null && s.y2 === null && s.label === null, "bad optionals null");
});

Deno.test("valid specs pass through unchanged without logs", () => {
  const cases: [
    "scatter" | "pie" | "combo" | "stacked_bar",
    { x: string; y: string[]; y2?: string | null; label?: string | null },
    number,
  ][] = [
    ["scatter", { x: "adr", y: ["occ"], label: "name" }, 5],
    ["pie", { x: "name", y: ["rooms"] }, 12],
    ["combo", { x: "name", y: ["adr"], y2: "occ" }, 4],
    ["stacked_bar", { x: "name", y: ["adr", "rooms"] }, 4],
  ];
  for (const [chart, spec, n] of cases) {
    const { result, logs } = captureLogs(() =>
      validateSpec(chart, spec, rowsN(n))
    );
    assert(result.chart === chart, `${chart} kept`);
    assert(result.spec === spec, `${chart} spec unchanged`);
    assert(result.reason === undefined, `${chart} no reason`);
    assert(logs.length === 0, `${chart} no log`);
  }
});

Deno.test("missing column drops spec and downgrades to bar", () => {
  for (
    const spec of [
      { x: "nope", y: ["adr"] },
      { x: "name", y: ["nope"] },
      { x: "name", y: ["adr"], y2: "nope" },
      { x: "name", y: ["adr"], label: "nope" },
    ]
  ) {
    const { result, logs } = captureLogs(() =>
      validateSpec("combo", { ...spec, y2: spec.y2 ?? "occ" }, rowsN(5))
    );
    assert(result.chart === "bar" && result.spec === null, "downgraded");
    assert(typeof result.reason === "string", "reason set");
    assert(
      logs.length === 1 && logs[0].startsWith('{"spec_dropped":'),
      `log: ${logs}`,
    );
    assert(
      JSON.parse(logs[0]).spec_dropped === result.reason,
      "log carries reason",
    );
  }
});

Deno.test("non-numeric y drops spec", () => {
  const { result } = captureLogs(() =>
    validateSpec("stacked_bar", { x: "adr", y: ["name", "rooms"] }, rowsN(5))
  );
  assert(result.chart === "bar" && result.spec === null, "non-numeric y");
  const r2 =
    captureLogs(() =>
      validateSpec("combo", { x: "name", y: ["adr"], y2: "name" }, rowsN(5))
    ).result;
  assert(r2.chart === "bar" && r2.spec === null, "non-numeric y2");
});

Deno.test("numeric strings count as numeric", () => {
  const { result } = captureLogs(() =>
    validateSpec("combo", { x: "name", y: ["occ"], y2: "adr" }, rowsN(5))
  );
  assert(result.chart === "combo", "numeric string ok");
});

Deno.test("pie over 12 rows is dropped", () => {
  const spec = { x: "name", y: ["adr"] };
  assert(
    captureLogs(() => validateSpec("pie", spec, rowsN(13))).result.chart ===
      "bar",
    "13 rows dropped",
  );
  assert(
    captureLogs(() => validateSpec("pie", spec, rowsN(12))).result.chart ===
      "pie",
    "12 rows kept",
  );
});

Deno.test("scatter needs >= 3 rows and exactly 1 y", () => {
  assert(
    captureLogs(() =>
      validateSpec("scatter", { x: "adr", y: ["occ"] }, rowsN(2))
    )
      .result.chart === "bar",
    "2 rows dropped",
  );
  assert(
    captureLogs(() =>
      validateSpec("scatter", { x: "adr", y: ["occ"] }, rowsN(3))
    )
      .result.chart === "scatter",
    "3 rows kept",
  );
  assert(
    captureLogs(() =>
      validateSpec("scatter", { x: "adr", y: ["occ", "rooms"] }, rowsN(5))
    ).result.chart === "bar",
    "2 y dropped",
  );
});

Deno.test("stacked_bar needs >= 2 y; combo needs y2", () => {
  assert(
    captureLogs(() =>
      validateSpec("stacked_bar", { x: "name", y: ["adr"] }, rowsN(5))
    )
      .result.chart === "bar",
    "1 y dropped",
  );
  assert(
    captureLogs(() =>
      validateSpec("combo", { x: "name", y: ["adr"] }, rowsN(5))
    )
      .result.chart === "bar",
    "missing y2 dropped",
  );
  assert(
    captureLogs(() =>
      validateSpec("combo", { x: "name", y: ["adr"], y2: null }, rowsN(5))
    ).result.chart === "bar",
    "null y2 dropped",
  );
});

Deno.test("empty rows or null spec on new kind downgrades", () => {
  const a = captureLogs(() =>
    validateSpec("pie", { x: "name", y: ["adr"] }, [])
  );
  assert(a.result.chart === "bar" && a.result.spec === null, "empty rows");
  const b = captureLogs(() => validateSpec("scatter", null, rowsN(5)));
  assert(b.result.chart === "bar" && b.result.spec === null, "null spec");
  assert(b.logs.length === 1, "logged");
});

Deno.test("legacy kinds force spec null without a log", () => {
  for (const chart of ["bar", "line", "kpi", "table"] as const) {
    const { result, logs } = captureLogs(() =>
      validateSpec(chart, { x: "name", y: ["adr"] }, rowsN(5))
    );
    assert(result.chart === chart, `${chart} unchanged`);
    assert(result.spec === null, `${chart} spec null`);
    assert(logs.length === 0, `${chart} no log`);
  }
});

Deno.test("requestsExplicitForm fires on each trigger phrase, case-insensitively", () => {
  for (const t of EXPLICIT_FORM_TRIGGERS) {
    assert(requestsExplicitForm(`Show a ${t} view`), `missed: ${t}`);
    assert(requestsExplicitForm(t.toUpperCase()), `case: ${t}`);
  }
});

Deno.test("requestsExplicitForm is false for plain comparisons", () => {
  for (
    const q of [
      "RevPAR vs occupancy",
      "CPOR vs ADR by property",
      "NPS and CSAT by segment",
      "ADR vs occupancy by property",
      "Occupied rooms by property",
    ]
  ) {
    assert(!requestsExplicitForm(q), `false positive: ${q}`);
  }
});
