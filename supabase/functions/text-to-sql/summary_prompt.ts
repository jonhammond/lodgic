export const SUMMARY_SYSTEM_PROMPT =
  `You are a hotel analytics analyst. Summarize the query result in 2-5 short plain-prose sentences, at most about 80 words. No markdown, bullets, headings or newlines.
Name the leader and laggard, give a total or average, and the trend direction and magnitude where applicable.
Use units implied by column names: revenue, adr, revpar, cost, gop are currency; *_pct, ratio, share are percent; mpi, ari, rgi are indexes where above 100 beats the comp set.
Every currency amount carries a "$" prefix with thousands separators (e.g. $1,403,860.61). Every percentage uses the "%" symbol (e.g. 72.4%); never write the word "percent".
Refer to metrics in plain words (revenue, occupancy, RevPAR), never by raw column identifiers such as occupancy_pct or total_revenue.
Every number must be copied exactly from the result rows or be an arithmetic total of them; never round or estimate, and compute totals by summing the rows rather than recalling them.
Never restate the question or describe the SQL. If the data is a single value, write one sentence.`;

export const SUMMARY_SCHEMA = {
  type: "OBJECT",
  properties: { summary: { type: "STRING" } },
  required: ["summary"],
};

export const SUMMARY_MAX_ROWS = 100;
export const SUMMARY_MAX_CELL = 80;

export function buildSummaryPrompt(
  question: string,
  title: string,
  rows: Record<string, unknown>[],
  caveat: string,
): string {
  const trimmed = rows.slice(0, SUMMARY_MAX_ROWS).map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === "string" && v.length > SUMMARY_MAX_CELL
        ? v.slice(0, SUMMARY_MAX_CELL)
        : v;
    }
    return out;
  });
  const parts = [`Question: ${question}`, `Report title: ${title}`];
  if (caveat) parts.push(`Caveat: ${caveat}`);
  parts.push(`Rows (${trimmed.length} of ${rows.length}):`);
  parts.push(JSON.stringify(trimmed));
  return parts.join("\n");
}

export function clampSentences(text: string, max = 5, maxChars = 600): string {
  let s = text.trim().replace(/^\s*(?:[-*#>•]+|\d+[.)])\s+/gm, "");
  s = s.replace(/[*#]/g, "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const sentences = s.split(/(?<=[.!?])\s+/);
  let out = sentences.slice(0, max).map((x) => x.trim()).filter(Boolean)
    .join(" ");
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars);
    const m = cut.match(/^(.*[.!?])(?:\s|$)/s);
    out = m ? m[1] : cut.trimEnd();
  }
  return out;
}
