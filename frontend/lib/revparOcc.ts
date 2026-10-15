import type { DailyRow } from "./revparEngine";
import { supabase } from "./supabase";

const COLUMNS = "property_id,metric_date,rooms_sold,total_revenue";
const PAGE = 1000;

const RE = /^\s*revpar\s+(vs\.?|versus)\s+occupancy\s*$/i;

export const isRevparOccQuestion = (text: string): boolean => RE.test(text);

type RawRow = {
  property_id: string;
  metric_date: string;
  rooms_sold: number | string | null;
  total_revenue: number | string | null;
};

const n0 = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export async function fetchRevparOccData(
  now: Date = new Date(),
): Promise<{ rows: DailyRow[]; latestDate: string }> {
  const from = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const rows: DailyRow[] = [];
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
        total_revenue: n0(r.total_revenue),
      });
    }
    if (page.length < PAGE) break;
  }
  const latestDate = rows.reduce((m, r) => (r.metric_date > m ? r.metric_date : m), "");
  return { rows, latestDate };
}
