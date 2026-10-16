import {
  CHARTS,
  DIRECTION_LINE,
  METRIC_COLUMNS,
  METRIC_DIRECTION,
  parsePeriod,
  PERIOD_LABEL_MAX,
  PERIOD_SOURCES,
  SYSTEM_PROMPT,
} from "./schema_prompt.ts";
import { SUMMARY_SYSTEM_PROMPT } from "./summary_prompt.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test("every metric column appears in the system prompt", () => {
  for (const col of METRIC_COLUMNS) {
    assert(SYSTEM_PROMPT.includes(col), `missing column in prompt: ${col}`);
  }
});

Deno.test("every metric column is documented in docs/metrics-glossary.md", async () => {
  const doc = await Deno.readTextFile(
    new URL("../../../docs/metrics-glossary.md", import.meta.url),
  );
  for (const col of METRIC_COLUMNS) {
    assert(doc.includes("`" + col + "`"), `missing column in glossary: ${col}`);
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

function vocabularyEntries(): { terms: string[]; target: string }[] {
  const m = SYSTEM_PROMPT.match(/\nVocabulary:[^\n]*\n([\s\S]*?)\n\n/);
  assert(m !== null, "missing Vocabulary block");
  const entries: { terms: string[]; target: string }[] = [];
  for (const line of (m as RegExpMatchArray)[1].split("\n")) {
    for (const part of line.split(";")) {
      const [lhs, rhs, ...rest] = part.split("->");
      assert(
        rhs !== undefined && rest.length === 0,
        `bad vocab entry: ${part}`,
      );
      const terms = lhs.split(",").map((t) => t.trim()).filter(Boolean);
      assert(terms.length > 0, `vocab entry without terms: ${part}`);
      entries.push({ terms, target: rhs.trim() });
    }
  }
  return entries;
}

Deno.test("every vocabulary term maps to a METRIC_COLUMNS column or a formula over them", () => {
  const entries = vocabularyEntries();
  assert(entries.length >= 15, `vocabulary too small: ${entries.length}`);
  const cols = new Set(METRIC_COLUMNS);
  for (const { terms, target } of entries) {
    const idents = target.match(/[a-z][a-z0-9]*(?:_[a-z0-9]+)*/g) ?? [];
    const metric = idents.filter((i) => cols.has(i));
    assert(metric.length > 0, `no metric column for: ${terms.join(", ")}`);
    for (const id of idents) {
      assert(
        cols.has(id) || /^(nullif|sum|numeric)$/.test(id),
        `unknown identifier "${id}" for: ${terms.join(", ")}`,
      );
    }
  }
});

Deno.test("vocabulary block stays compact", () => {
  const m = SYSTEM_PROMPT.match(/\nVocabulary:[^\n]*\n([\s\S]*?)\n\n/);
  const lines = (m as RegExpMatchArray)[1].split("\n").length;
  assert(lines <= 20, `vocabulary has ${lines} lines`);
});

Deno.test("METRIC_DIRECTION columns are METRIC_COLUMNS and disjoint", () => {
  const cols = new Set(METRIC_COLUMNS);
  const higher: readonly string[] = METRIC_DIRECTION.higher;
  const lower: readonly string[] = METRIC_DIRECTION.lower;
  for (const c of [...higher, ...lower]) {
    assert(cols.has(c), `direction column not in METRIC_COLUMNS: ${c}`);
  }
  for (const c of higher) assert(!lower.includes(c), `in both lists: ${c}`);
  assert(higher.length > 0 && lower.length > 0, "empty direction list");
});

Deno.test("system and summary prompts both carry the direction line", () => {
  assert(DIRECTION_LINE.startsWith("Direction:"), "bad direction line");
  assert(
    SYSTEM_PROMPT.includes(DIRECTION_LINE),
    "direction line not in SQL prompt",
  );
  assert(
    SUMMARY_SYSTEM_PROMPT.includes(DIRECTION_LINE),
    "direction line not in summary prompt",
  );
  for (const c of METRIC_DIRECTION.higher) {
    assert(DIRECTION_LINE.includes(c), `direction line lacks ${c}`);
  }
  for (const c of METRIC_DIRECTION.lower) {
    assert(DIRECTION_LINE.includes(c), `direction line lacks ${c}`);
  }
});

Deno.test("chart-form rules are appended after every earlier Rules bullet and phrasing-scoped", () => {
  const rules = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf("\nRules:"));
  const bullets = rules.split("\n- ");
  const idx = (needle: string) => bullets.findIndex((b) => b.includes(needle));
  const scope = idx("Chart-form rules (this and the next three bullets)");
  const explicit = idx("Explicit chart form");
  assert(scope === explicit - 1, "scope bullet must precede explicit rule");
  const noFit = idx("No-fit chart form");
  const shape = idx("SQL shape per chart form");
  const nullSpec = idx("chart_spec is null for bar, line, kpi and table");
  assert(
    explicit > idx("period_label: the period"),
    "must follow period bullet",
  );
  assert(noFit === explicit + 1, "no-fit rule must follow explicit rule");
  assert(shape === noFit + 1, "shape rule must follow no-fit rule");
  assert(nullSpec === shape + 1, "null-spec rule must follow shape rule");
  assert(nullSpec === bullets.length - 1, "chart-form rules must be last");
  const block = bullets.slice(explicit).join("\n- ");
  for (const kind of ["scatter", "pie", "stacked_bar", "combo"]) {
    assert(block.includes(kind), `missing ${kind}`);
  }
  assert(
    block.includes("all other recommended_chart behaviour is unchanged"),
    "missing unchanged statement",
  );
});
