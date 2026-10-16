import {
  buildSummaryPrompt,
  clampSentences,
  SUMMARY_MAX_CELL,
  SUMMARY_SYSTEM_PROMPT,
} from "./summary_prompt.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test("prompt includes question, title, caveat and row values", () => {
  const p = buildSummaryPrompt(
    "Which hotel leads?",
    "Revenue by hotel",
    [{ name: "Harbor", revenue: 1234 }],
    "Partial month",
  );
  for (
    const s of [
      "Which hotel leads?",
      "Revenue by hotel",
      "Harbor",
      "1234",
      "Partial month",
    ]
  ) {
    assert(p.includes(s), `missing: ${s}`);
  }
});

Deno.test("rows beyond 100 are dropped", () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ v: `row_${i}_x` }));
  const p = buildSummaryPrompt("q", "t", rows, "");
  assert(p.includes("row_99_x"), "row 99 missing");
  assert(!p.includes("row_149_x"), "row 149 present");
});

Deno.test("long cells are truncated", () => {
  const p = buildSummaryPrompt("q", "t", [{ s: "a".repeat(200) }], "");
  assert(!p.includes("a".repeat(SUMMARY_MAX_CELL + 1)), "not truncated");
  assert(p.includes("a".repeat(SUMMARY_MAX_CELL)), "over-truncated");
});

Deno.test("clampSentences keeps at most 5 of 7", () => {
  const t = Array.from({ length: 7 }, (_, i) => `Sentence ${i + 1}.`).join(" ");
  const out = clampSentences(t);
  assert(out.includes("Sentence 5."), "lost sentence 5");
  assert(!out.includes("Sentence 6."), "kept sentence 6");
});

Deno.test("clampSentences flattens bullets and newlines", () => {
  const out = clampSentences("- **A** leads.\n- B lags.\n\n1. Total is 5.");
  assert(!/[\n*#]/.test(out), `bad chars: ${out}`);
  assert(!out.startsWith("-"), "bullet kept");
  assert(out === "A leads. B lags. Total is 5.", `got: ${out}`);
});

Deno.test("clampSentences empty returns empty", () => {
  assert(clampSentences("  \n ") === "", "not empty");
});

Deno.test("system prompt requires exact numbers and computed totals", () => {
  for (
    const s of [
      "copied exactly from the result rows",
      "never round or estimate",
      "compute totals by summing the rows rather than recalling them",
      'Call a sum of rows a "total"',
      "Never present a column total as an average rate",
      "State the covered period only from the dates present in the rows",
    ]
  ) {
    assert(SUMMARY_SYSTEM_PROMPT.includes(s), `missing rule: ${s}`);
  }
});
