// Supabase Edge Function: text-to-sql
// POST { prompt, property_ids? (UUID[], <=50; scopes SQL to those properties; [] = no rows) } -> Gemini Flash-Lite (GEMINI_MODEL, fallback GEMINI_FALLBACK_MODEL on 429)
//   -> validated read-only SQL -> run_hotel_analytics RPC. Output also carries period_label /
//   period_source (question | default); questions naming no period default to the last 30 days.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { validateSql } from "./sql_guard.ts";
import { parseChartSpec, validateSpec } from "./chart_spec.ts";
import {
  type Chart,
  CHARTS,
  type ChartSpec,
  parsePeriod,
  type PeriodSource,
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
} from "./schema_prompt.ts";
import { parsePropertyIds, scopePrompt } from "./request.ts";
import {
  CACHE_BYPASS_HEADER,
  cacheKey,
  hashRows,
  isFresh,
  parseTtlHours,
} from "./cache.ts";
import {
  buildSummaryPrompt,
  clampSentences,
  SUMMARY_SCHEMA,
  SUMMARY_SYSTEM_PROMPT,
} from "./summary_prompt.ts";

const HOURLY_RATE_LIMIT_ENABLED = true;
const RATE_LIMIT_PER_HOUR = 60;
// Gemini Tier 1 quotas are ample; this cap bounds spend and DB load. Cache hits are exempt.
const GLOBAL_LIMIT_PER_MINUTE = 30;
const MAX_PROMPT_CHARS = 500;
const GEMINI_TIMEOUT_MS = 20_000;
const RPC_TIMEOUT_MS = 10_000;
const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite";

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:8081",
];

const SUMMARY_TIMEOUT_MS = 8_000;

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function allowedOrigins(): string[] {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(
  body: unknown,
  status: number,
  cors: Record<string, string>,
  extra: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...extra, "Content-Type": "application/json" },
  });
}

function errorResponse(
  e: ApiError,
  cors: Record<string, string>,
  extra: Record<string, string> = {},
) {
  return json(
    { error: { code: e.code, message: e.message } },
    e.status,
    cors,
    extra,
  );
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(
    new Uint8Array(digest),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

async function readRequest(
  req: Request,
): Promise<{ prompt: string; propertyIds: string[] | null }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_input", "Request body must be valid JSON");
  }
  const fields = body as { prompt?: unknown; property_ids?: unknown } | null;
  const prompt = fields?.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new ApiError(
      400,
      "invalid_input",
      "prompt must be a non-empty string",
    );
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new ApiError(
      400,
      "invalid_input",
      `prompt must be at most ${MAX_PROMPT_CHARS} characters`,
    );
  }
  let propertyIds: string[] | null;
  try {
    propertyIds = parsePropertyIds(fields?.property_ids);
  } catch (err) {
    throw new ApiError(
      400,
      "invalid_input",
      err instanceof Error ? err.message : "invalid property_ids",
    );
  }
  return { prompt: prompt.trim(), propertyIds };
}

type GeminiOutput = {
  sql: string;
  recommended_chart: Chart;
  chart_spec: ChartSpec | null;
  report_title: string;
  caveat?: string;
  period_label: string | null;
  period_source: PeriodSource | null;
};

type CacheRow = {
  sql: string;
  chart: Chart;
  chart_spec: ChartSpec | null;
  title: string;
  caveat: string;
  period_label: string | null;
  period_source: PeriodSource | null;
  rows_hash: string | null;
  summary: string | null;
  hits: number;
  created_at: string;
};

async function geminiRequest(
  model: string,
  prompt: string,
  apiKey: string,
  opts: { system: string; schema: unknown; timeoutMs: number },
): Promise<Response> {
  try {
    return await fetch(geminiUrl(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: opts.schema,
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch {
    throw new ApiError(
      502,
      "llm_unavailable",
      "Model request failed or timed out",
    );
  }
}

function logUsage(
  stage: "sql" | "summary",
  model: string,
  payload: unknown,
): void {
  const u = (payload as { usageMetadata?: Record<string, number> })
    ?.usageMetadata ?? {};
  console.info(JSON.stringify({
    usage: stage,
    model,
    prompt: u.promptTokenCount ?? 0,
    output: u.candidatesTokenCount ?? 0,
    thoughts: u.thoughtsTokenCount ?? 0,
    cached: u.cachedContentTokenCount ?? 0,
    total: u.totalTokenCount ?? 0,
  }));
}

async function callGemini(
  prompt: string,
  apiKey: string,
  model: string,
  fallbackModel: string,
): Promise<GeminiOutput> {
  const opts = {
    system: SYSTEM_PROMPT,
    schema: RESPONSE_SCHEMA,
    timeoutMs: GEMINI_TIMEOUT_MS,
  };
  let used = model;
  let res = await geminiRequest(model, prompt, apiKey, opts);
  if (res.status === 429 && fallbackModel && fallbackModel !== model) {
    await res.body?.cancel();
    console.warn(
      `gemini ${model} returned 429; retrying with ${fallbackModel}`,
    );
    used = fallbackModel;
    res = await geminiRequest(fallbackModel, prompt, apiKey, opts);
  }
  if (res.status === 429) {
    await res.body?.cancel();
    throw new ApiError(
      503,
      "llm_rate_limited",
      "Model quota exhausted, try again later",
    );
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new ApiError(502, "llm_error", `Model returned HTTP ${res.status}`);
  }
  try {
    const payload = await res.json();
    logUsage("sql", used, payload);
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    const out = JSON.parse(text);
    if (
      typeof out?.sql !== "string" ||
      typeof out?.report_title !== "string" ||
      !CHARTS.includes(out?.recommended_chart)
    ) {
      throw new Error("shape");
    }
    out.caveat = typeof out.caveat === "string" ? out.caveat.trim() : "";
    out.chart_spec = parseChartSpec(out.recommended_chart, out.chart_spec);
    Object.assign(out, parsePeriod(out));
    return out as GeminiOutput;
  } catch {
    throw new ApiError(
      502,
      "llm_bad_response",
      "Model returned an unusable response",
    );
  }
}

async function summarizeRows(
  question: string,
  title: string,
  rows: Record<string, unknown>[],
  caveat: string,
  apiKey: string,
  model: string,
  fallbackModel: string,
): Promise<string | null> {
  if (rows.length === 0) return null;
  const prompt = buildSummaryPrompt(question, title, rows, caveat);
  const opts = {
    system: SUMMARY_SYSTEM_PROMPT,
    schema: SUMMARY_SCHEMA,
    timeoutMs: SUMMARY_TIMEOUT_MS,
  };
  try {
    let used = model;
    let res = await geminiRequest(model, prompt, apiKey, opts);
    if (res.status === 429 && fallbackModel && fallbackModel !== model) {
      await res.body?.cancel();
      used = fallbackModel;
      res = await geminiRequest(fallbackModel, prompt, apiKey, opts);
    }
    if (!res.ok) {
      await res.body?.cancel();
      console.warn(`summary skipped: HTTP ${res.status}`);
      return null;
    }
    const payload = await res.json();
    logUsage("summary", used, payload);
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    const out = JSON.parse(text);
    if (typeof out?.summary !== "string") throw new Error("shape");
    return clampSentences(out.summary) || null;
  } catch (e) {
    console.warn(
      "summary skipped:",
      e instanceof Error ? e.message : "unknown",
    );
    return null;
  }
}

async function handle(
  req: Request,
  cors: Record<string, string>,
): Promise<Response> {
  if (req.method !== "POST") {
    return errorResponse(
      new ApiError(405, "method_not_allowed", "Use POST"),
      cors,
      { Allow: "POST, OPTIONS" },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const salt = Deno.env.get("IP_HASH_SALT");
  const geminiModel = Deno.env.get("GEMINI_MODEL")?.trim() ||
    DEFAULT_GEMINI_MODEL;
  const geminiFallbackModel = Deno.env.get("GEMINI_FALLBACK_MODEL")?.trim() ??
    DEFAULT_GEMINI_FALLBACK_MODEL;
  console.info(
    `gemini model=${geminiModel} fallback=${geminiFallbackModel || "none"}`,
  );
  if (!supabaseUrl || !serviceKey || !geminiKey || !salt) {
    console.error("missing required environment configuration");
    throw new ApiError(500, "server_misconfigured", "Server is not configured");
  }

  const { prompt, propertyIds } = await readRequest(req);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Cache lookup (validated SQL from an earlier identical question)
  const scoped = scopePrompt(prompt, propertyIds);
  const key = await cacheKey(SYSTEM_PROMPT, scoped);
  const bypass = req.headers.get(CACHE_BYPASS_HEADER) === "1";
  const ttlHours = parseTtlHours(Deno.env.get("SQL_CACHE_TTL_HOURS"));
  let cached: CacheRow | null = null;
  if (!bypass) {
    const { data, error } = await supabase
      .from("ai_sql_cache")
      .select(
        "sql, chart, chart_spec, title, caveat, period_label, period_source, rows_hash, summary, hits, created_at",
      )
      .eq("cache_key", key)
      .maybeSingle();
    if (error) console.warn("ai_sql_cache lookup failed", error.code);
    else if (
      data && isFresh(data.created_at, ttlHours) &&
      CHARTS.includes(data.chart) && validateSql(data.sql).ok
    ) {
      cached = data as CacheRow;
    }
  }

  // Rate limit
  const ipHash = await hashIp(clientIp(req), salt);
  if (HOURLY_RATE_LIMIT_ENABLED) {
    const { data: count, error: countErr } = await supabase.rpc(
      "count_recent_queries",
      { p_ip_hash: ipHash },
    );
    if (countErr) {
      console.error("count_recent_queries failed", countErr.code);
      throw new ApiError(
        500,
        "rate_limit_check_failed",
        "Could not verify rate limit",
      );
    }
    if (typeof count === "number" && count >= RATE_LIMIT_PER_HOUR) {
      throw new ApiError(
        429,
        "rate_limited",
        `Rate limit of ${RATE_LIMIT_PER_HOUR} queries per hour exceeded`,
      );
    }
  }
  if (!cached) {
    const { data: n, error: globalErr } = await supabase.rpc(
      "count_queries_last_minute",
    );
    if (globalErr) {
      console.error("count_queries_last_minute failed", globalErr.code);
      throw new ApiError(
        500,
        "rate_limit_check_failed",
        "Could not verify rate limit",
      );
    }
    if (typeof n === "number" && n >= GLOBAL_LIMIT_PER_MINUTE) {
      throw new ApiError(429, "busy", "Demo is busy, try again in a minute");
    }
  }
  const { error: logErr } = await supabase.from("ai_query_log").insert({
    ip_hash: ipHash,
  });
  if (logErr) {
    console.error("ai_query_log insert failed", logErr.code);
    throw new ApiError(
      500,
      "rate_limit_check_failed",
      "Could not record request",
    );
  }

  // LLM (skipped on cache hit)
  let gen: GeminiOutput;
  if (cached) {
    gen = {
      sql: cached.sql,
      recommended_chart: cached.chart,
      chart_spec: parseChartSpec(cached.chart, cached.chart_spec),
      report_title: cached.title,
      caveat: cached.caveat,
      ...parsePeriod(cached),
    };
  } else {
    gen = await callGemini(scoped, geminiKey, geminiModel, geminiFallbackModel);
  }
  const check = validateSql(gen.sql);
  if (!check.ok) {
    console.warn("rejected generated SQL:", check.reason);
    throw new ApiError(
      400,
      "unsafe_sql",
      `Generated query was rejected: ${check.reason}`,
    );
  }

  // Execute (own timeout; the RPC's statement_timeout does not cover itself)
  const rpcStart = performance.now();
  const { data: rows, error: rpcErr } = await supabase
    .rpc("run_hotel_analytics", { sql_query: check.sql })
    .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
  const durationMs = Math.round(performance.now() - rpcStart);
  if (rpcErr) {
    console.error("run_hotel_analytics failed", rpcErr.code, rpcErr.message);
    const timedOut = /abort|timeout/i.test(rpcErr.message ?? "");
    throw new ApiError(
      500,
      timedOut ? "query_timeout" : "query_failed",
      "The generated query could not be executed",
    );
  }

  const resultRows = rows ?? [];
  const { chart, spec: chartSpec } = validateSpec(
    gen.recommended_chart,
    gen.chart_spec,
    resultRows,
  );
  const rowsHash = await hashRows(resultRows);
  let summary: string | null;
  if (cached && cached.rows_hash === rowsHash && cached.summary) {
    summary = cached.summary;
  } else {
    summary = await summarizeRows(
      prompt,
      gen.report_title,
      resultRows,
      gen.caveat ?? "",
      geminiKey,
      geminiModel,
      geminiFallbackModel,
    );
  }

  // Cache write (never fails the request)
  if (cached) {
    const patch: Record<string, unknown> = {
      hits: cached.hits + 1,
      last_hit_at: new Date().toISOString(),
    };
    if (cached.rows_hash !== rowsHash) {
      patch.rows_hash = rowsHash;
      patch.summary = summary;
    }
    supabase.from("ai_sql_cache").update(patch).eq("cache_key", key)
      .then(({ error }) => {
        if (error) console.warn("ai_sql_cache update failed", error.code);
      });
  } else if (resultRows.length > 0) {
    supabase.from("ai_sql_cache").upsert({
      cache_key: key,
      prompt: scoped,
      sql: check.sql,
      chart,
      chart_spec: chartSpec,
      title: gen.report_title,
      caveat: gen.caveat ?? "",
      period_label: gen.period_label,
      period_source: gen.period_source,
      model: geminiModel,
      rows_hash: rowsHash,
      summary,
      hits: 0,
      created_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.warn("ai_sql_cache upsert failed", error.code);
    });
  }
  console.info(`cache ${cached ? "hit" : bypass ? "bypass" : "miss"}`);

  return json(
    {
      sql: check.sql,
      chart,
      chart_spec: chartSpec,
      title: gen.report_title,
      rows: resultRows,
      caveat: gen.caveat || null,
      period_label: gen.period_label,
      period_source: gen.period_source,
      summary,
      cached: cached !== null,
      duration_ms: durationMs,
    },
    200,
    cors,
  );
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    if (origin && !cors["Access-Control-Allow-Origin"]) {
      return new Response(null, { status: 403, headers: cors });
    }
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    return await handle(req, cors);
  } catch (e) {
    if (e instanceof ApiError) {
      return errorResponse(
        e,
        cors,
        e.code === "busy" ? { "Retry-After": "60" } : {},
      );
    }
    console.error(
      "unhandled error",
      e instanceof Error ? e.message : "unknown",
    );
    return errorResponse(
      new ApiError(500, "internal_error", "Internal error"),
      cors,
    );
  }
});
