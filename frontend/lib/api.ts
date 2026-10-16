import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** Column mapping for scatter | pie | combo | stacked_bar; validated server-side against rows[0]. */
export type ChartSpec = {
  x: string;
  y: string[];
  y2?: string | null;
  label?: string | null;
};

export type QueryResult = {
  sql: string;
  chart: "bar" | "line" | "kpi" | "table" | "scatter" | "pie" | "combo" | "stacked_bar";
  chart_spec?: ChartSpec | null;
  title: string;
  rows: Record<string, unknown>[];
  caveat?: string | null;
  summary?: string | null;
  period_label?: string | null;
  period_source?: "question" | "default" | null;
  cached?: boolean;
  duration_ms?: number;
};

export class QueryError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

function mapError(code: string): string {
  if (code === "rate_limited") {
    return "Rate limit reached — 20 queries per hour. Try again later.";
  }
  if (code === "busy") {
    return "Demo is busy, try again in a minute.";
  }
  if (code === "unsafe_sql") {
    return "That question produced a query we couldn't safely run — try rephrasing.";
  }
  if (code === "llm_rate_limited") {
    return "The model's daily quota is exhausted — try again later.";
  }
  if (code.startsWith("llm_")) {
    return "The model is unavailable right now — try again shortly.";
  }
  return "Something went wrong — try again.";
}

export async function runQuery(
  prompt: string,
  propertyIds: string[] | null,
): Promise<QueryResult> {
  const { data, error } = await supabase.functions.invoke("text-to-sql", {
    body: propertyIds ? { prompt, property_ids: propertyIds } : { prompt },
  });
  if (error) {
    let code = "network";
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        code = body?.error?.code ?? "unknown";
      } catch {
        code = "unknown";
      }
    }
    throw new QueryError(mapError(code), code);
  }
  return data as QueryResult;
}
