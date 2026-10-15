import type { Timeframe } from "./revparEngine";

const COLUMNS = "property_id,metric_date,rooms_sold,nps,csat";
const PAGE = 1000;

const SEP = String.raw`(?:and|&|vs\.?|versus|/)`;
const HEAD = String.raw`(?:nps\s+${SEP}\s+csat|csat\s+${SEP}\s+nps)\s+by\s+segment`;
const DAILY = String.raw`yesterday|today|daily|latest\s+day|last\s+day`;
const MTD = String.raw`(?:the\s+)?(?:last|past|trailing)\s+30\s+days|30\s+days|this\s+month|month\s+to\s+date|mtd`;
const YTD = String.raw`(?:the\s+)?(?:last|past|trailing)\s+(?:365\s+days|12\s+months|year)|annuali[sz]ed|annual|yearly|this\s+year|year\s+to\s+date|ytd`;

const RE = new RegExp(
  String.raw`^\s*${HEAD}(?:\s*[,:]?\s*(?:(?:for|over|in)\s+)?(?:(${DAILY})|(${MTD})|(${YTD})))?\s*[?.]?\s*$`,
  "i",
);

/** Timeframe for the "NPS and CSAT by segment" question; null routes to Gemini. */
export function isNpsCsatQuestion(text: string): Timeframe | null {
  const m = RE.exec(text);
  if (!m) return null;
  if (m[1]) return "daily";
  if (m[3]) return "ytd";
  return "mtd";
}

export type GuestRow = {
  property_id: string;
  metric_date: string;
  rooms_sold: number;
  nps: number;
  csat: number;
};

type RawRow = {
  property_id: string;
  metric_date: string;
  rooms_sold: number | string | null;
  nps: number | string | null;
  csat: number | string | null;
};

const n0 = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export async function fetchNpsCsatData(
  now: Date = new Date(),
): Promise<{ rows: GuestRow[]; latestDate: string }> {
  // Lazy import keeps the parser importable without Supabase env (node tests).
  const { supabase } = await import("./supabase");
  const from = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const rows: GuestRow[] = [];
  // PostgREST caps responses at max_rows (1000); page through with range().
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("daily_metrics")
      .select(COLUMNS)
      .gte("metric_date", from)
      .order("metric_date", { ascending: true })
      .order("property_id", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as RawRow[];
    for (const r of page) {
      rows.push({
        property_id: r.property_id,
        metric_date: r.metric_date,
        rooms_sold: n0(r.rooms_sold),
        nps: n0(r.nps),
        csat: n0(r.csat),
      });
    }
    if (page.length < PAGE) break;
  }
  const latestDate = rows.reduce((m, r) => (r.metric_date > m ? r.metric_date : m), "");
  return { rows, latestDate };
}
