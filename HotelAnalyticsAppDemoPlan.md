Markdown# Hospitality Analytics Intelligence Dashboard — Plan & Architecture

An overview and step-by-step implementation plan for building and hosting an AI-integrated **Hotel Analytics Dashboard** using React Native Web, Supabase, and Google Gemini Flash.

---

## 1. App Overview & Architecture

### Core Functionality

1. **Hospitality Intelligence Queries:** Users enter natural language requests or click preset prompts (e.g., *"Show me RevPAR and Occupancy % across all properties for the past 30 days"*).
2. **AI Text-to-SQL Parsing:** A Supabase Edge Function sends the hotel database schema and system rules to **Google Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite`, fallback `gemini-3.5-flash-lite`)** (free tier via Google AI Studio). Gemini returns a clean SQL statement and a chart type recommendation.
3. **Restricted Query Execution:** Supabase runs the query through a read-only PostgreSQL RPC function (`SECURITY DEFINER`) to prevent schema mutation or injection attacks.
4. **Automated Data Ingestion:** Supabase `pg_cron` automatically executes a nightly SQL routine to insert fresh daily metrics and booking logs into your database.
5. **Interactive UI:** Built with **React Native Web**, rendering key KPI metric tiles, interactive trend line/bar charts (`victory-native`), and property comparison data tables.

[ React Native Web UI ]││ 1. Direct Prompt Input / Preset Click▼[ Supabase Edge Function ] ──── (Schema Context + System Prompt) ────► [ Gemini Flash API ]│                                                                     ││ 3. Executed via Read-Only RPC                                2. Generated SELECT SQL▼                                                                     │[ Supabase Postgres DB ] ─────────────────────────────────────────────────────┘││ 4. Structured Query Results JSON▼[ React Native Web UI ] ──► Dynamic Charts & Data Grid
---

## 2. Technical Stack (100% Free Tier)

| Layer | Technology Choice | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | **Expo / React Native Web** | Cross-platform build exported to static web assets for $0 hosting on Vercel/Netlify. |
| **Data Visualization** | **`victory-native`** | Cross-platform SVG charting library for React Native ecosystems. |
| **Backend & DB** | **Supabase (PostgreSQL)** | Relational DB, native Edge Functions (Deno/TS), Row Level Security, and `pg_cron`. |
| **Automated Data** | **Supabase `pg_cron`** | Scheduled SQL routines inside Postgres to continuously populate fresh daily metrics. |
| **AI Engine** | **Google Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite`, fallback `gemini-3.5-flash-lite`)** | Generous free tier via Google AI Studio with fast execution for SQL parsing. |

---

## 3. Phase 1: Database Setup, `pg_cron`, & RPC Functions

### 1. Database Schema

Run in the Supabase SQL Editor:

```sql
-- Properties table
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    total_rooms INT NOT NULL
);

-- Seed Initial Hotel Properties
INSERT INTO properties (name, location, total_rooms) VALUES
  ('Meridian Grand Downtown', 'Denver, CO', 350),
  ('The Marlowe Waterfront', 'Miami, FL', 200),
  ('Larkspur Tech Center', 'Austin, TX', 150);

-- Daily Performance Metrics table
CREATE TABLE daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
    rooms_sold INT NOT NULL,
    total_revenue NUMERIC(10,2) NOT NULL,
    adr NUMERIC(10,2) GENERATED ALWAYS AS (total_revenue / NULLIF(rooms_sold, 0)) STORED,
    occupancy_pct NUMERIC(5,2) NOT NULL,
    revpar NUMERIC(10,2) NOT NULL,
    UNIQUE(property_id, metric_date)
);
2. Automated Synthetic Data Generator (pg_cron)Enable the pg_cron extension under Supabase Dashboard $\rightarrow$ Database $\rightarrow$ Extensions, then execute:SQL-- Function to generate realistic random daily hotel metrics
CREATE OR REPLACE FUNCTION generate_daily_hotel_metrics()
RETURNS void AS $$
DECLARE
    prop RECORD;
    occ_pct NUMERIC(5,2);
    rooms_sold_val INT;
    avg_rate NUMERIC(10,2);
    rev NUMERIC(10,2);
BEGIN
    FOR prop IN SELECT id, total_rooms FROM properties LOOP
        -- Simulate realistic hotel occupancy (60% to 95%)
        occ_pct := (60 + (random() * 35))::numeric(5,2);
        rooms_sold_val := FLOOR((prop.total_rooms * occ_pct) / 100);
        avg_rate := (140 + (random() * 110))::numeric(10,2); -- ADR $140–$250
        rev := rooms_sold_val * avg_rate;

        INSERT INTO daily_metrics (property_id, metric_date, rooms_sold, total_revenue, occupancy_pct, revpar)
        VALUES (
            prop.id,
            CURRENT_DATE,
            rooms_sold_val,
            rev,
            occ_pct,
            (rev / prop.total_rooms)::numeric(10,2)
        )
        ON CONFLICT (property_id, metric_date) DO NOTHING;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule job to run automatically every night at 00:00 UTC
SELECT cron.schedule(
    'generate-daily-hotel-data',
    '0 0 * * *',
    $$ SELECT generate_daily_hotel_metrics(); $$
);
3. Read-Only RPC Execution FunctionSQLCREATE OR REPLACE FUNCTION run_hotel_analytics(sql_query text)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  -- Strict guardrail to block mutation statements
  IF LOWER(sql_query) NOT LIKE 'select%' THEN
    RAISE EXCEPTION 'Security error: Only SELECT queries permitted.';
  END IF;

  EXECUTE 'SELECT json_agg(t) FROM (' || sql_query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
4. Phase 2: Supabase Edge Function (Gemini Integration)Create supabase/functions/text-to-sql/index.ts:TypeScriptimport { serve } from "[https://deno.land/std@0.168.0/http/server.ts](https://deno.land/std@0.168.0/http/server.ts)";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

const HOTEL_SCHEMA = `
Tables:
- properties(id, name, location, total_rooms)
- daily_metrics(id, property_id, metric_date, rooms_sold, total_revenue, adr, occupancy_pct, revpar)

Key Formulas/Terms:
- RevPAR = Revenue Per Available Room
- ADR = Average Daily Rate
- Always use relative date filtering (e.g. CURRENT_DATE - INTERVAL '30 days')
`;

serve(async (req) => {
  const { prompt } = await req.json();

  const systemPrompt = `
  You are an expert Postgres SQL database analyst for hotel management.
  Database Schema: ${HOTEL_SCHEMA}

  Return ONLY a raw JSON object (no backticks, no markdown):
  {
    "sql": "SELECT ...",
    "recommended_chart": "bar" | "line" | "kpi" | "table",
    "report_title": "Descriptive Report Title"
  }
  `;

  const geminiResponse = await fetch(
    `[https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=$){GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\nUser Query: ${prompt}` }] }]
      })
    }
  );

  const aiData = await geminiResponse.json();
  const parsedResponse = JSON.parse(aiData.candidates[0].content.parts[0].text);

  // Execute parsedResponse.sql via run_hotel_analytics RPC call and return JSON data
});
5. Phase 3: React Native Web Frontend StrategyInitialize Project:Bashnpx create-expo-app hotel-analytics-dashboard --template blank
cd hotel-analytics-dashboard
npx expo install react-native-web react-dom react-native-svg victory-native @supabase/supabase-js
Core UI Modules:Preset Demo Chips: Interactive quick-select chips ("RevPAR comparison last 30 days", "Top performing location by occupancy").SQL Inspection Accordion: Lets website visitors toggle open the AI-generated SQL query.Dynamic Visual Canvas:kpi $\rightarrow$ Render large metric tiles (Portfolio ADR, Total Chain Revenue).bar / line $\rightarrow$ SVG charting via victory-native.table $\rightarrow$ Data grid table view.6. Phase 4: Web Deployment & Portfolio HostingExport Web Build:Bashnpx expo export --platform web
Deploy & Embed:Deploy the static dist directory for free on Vercel or Netlify.Embed directly into your portfolio site using an <iframe>:HTML<iframe src="[https://your-hotel-analytics.vercel.app](https://your-hotel-analytics.vercel.app)" width="100%" height="750px" frameborder="0"></iframe>
