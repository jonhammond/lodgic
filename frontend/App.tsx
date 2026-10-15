import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from "@expo-google-fonts/ibm-plex-mono";
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from "@expo-google-fonts/instrument-sans";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { AnswerCard } from "./components/AnswerCard";
import { CategoryBarChart } from "./components/charts/CategoryBarChart";
import { MetricBarChart } from "./components/charts/MetricBarChart";
import { TrendLineChart } from "./components/charts/TrendLineChart";
import { Footer } from "./components/Footer";
import { Grid } from "./components/Grid";
import { Header } from "./components/Header";
import { KpiSections } from "./components/KpiRow";
import { PropertyTable } from "./components/PropertyTable";
import { QuestionPanel } from "./components/QuestionPanel";
import { ResultBlock } from "./components/ResultBlock";
import { PropertyPicker } from "./components/PropertyPicker";
import { Rail } from "./components/Rail";
import { QueryError, QueryResult, runQuery } from "./lib/api";
import { downloadCsv } from "./lib/csv";
import { fetchKpis, KpiSnapshot } from "./lib/kpis";
import { fetchProperties, Property } from "./lib/properties";
import { mapResult } from "./lib/resultMapping";
import { readStored, writeStored } from "./lib/storage";
import { space } from "./theme/tokens";
import { ThemeProvider, useTheme } from "./theme/useTheme";

type Status = "idle" | "loading" | "error" | "rate_limited";

type State = {
  question: string;
  status: Status;
  errorMessage: string | null;
  result: QueryResult | null;
  sqlOpen: boolean;
  kpis: { status: "loading" | "ready" | "error"; data: KpiSnapshot | null };
  properties: Property[];
  propertiesLoaded: boolean;
  selectedIds: Set<string>;
  pickerOpen: boolean;
};

type Action =
  | { type: "SET_QUESTION"; question: string }
  | { type: "SUBMIT" }
  | { type: "SUCCESS"; result: QueryResult }
  | { type: "FAIL"; message: string; code?: string }
  | { type: "TOGGLE_SQL" }
  | { type: "KPIS_LOADED"; data: KpiSnapshot | null }
  | { type: "KPIS_FAILED" }
  | { type: "KPIS_LOADING" }
  | { type: "PROPERTIES_LOADED"; properties: Property[] }
  | { type: "SET_SELECTION"; ids: Set<string> }
  | { type: "OPEN_PICKER" }
  | { type: "CLOSE_PICKER" }
  | { type: "RESET_RATE_LIMIT" };

const STORAGE_KEY = "lodgic.properties";

function readStoredSelection(): Set<string> | null {
  const raw = readStored(STORAGE_KEY);
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? new Set(v.filter((x): x is string => typeof x === "string")) : null;
  } catch {
    return null;
  }
}

const initial: State = {
  question: "",
  status: "idle",
  errorMessage: null,
  result: null,
  sqlOpen: false,
  kpis: { status: "loading", data: null },
  properties: [],
  propertiesLoaded: false,
  selectedIds: readStoredSelection() ?? new Set(),
  pickerOpen: false,
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "SET_QUESTION":
      return { ...s, question: a.question };
    case "SUBMIT":
      return { ...s, status: "loading", errorMessage: null };
    case "SUCCESS":
      return { ...s, status: "idle", errorMessage: null, result: a.result };
    case "FAIL":
      return {
        ...s,
        status: a.code === "rate_limited" ? "rate_limited" : "error",
        errorMessage: a.message,
      };
    case "TOGGLE_SQL":
      return { ...s, sqlOpen: !s.sqlOpen };
    case "KPIS_LOADED":
      return { ...s, kpis: { status: "ready", data: a.data } };
    case "KPIS_FAILED":
      return { ...s, kpis: { status: "error", data: null } };
    case "KPIS_LOADING":
      return { ...s, kpis: { status: "loading", data: null } };
    case "PROPERTIES_LOADED": {
      const known = new Set(a.properties.map((p) => p.id));
      // Validate persisted selection against the fetched list; fall back to all.
      const valid = [...s.selectedIds].filter((id) => known.has(id));
      const selectedIds = new Set(valid.length > 0 ? valid : known);
      return { ...s, properties: a.properties, propertiesLoaded: true, selectedIds };
    }
    case "SET_SELECTION":
      return { ...s, selectedIds: a.ids };
    case "OPEN_PICKER":
      return { ...s, pickerOpen: true };
    case "CLOSE_PICKER":
      return { ...s, pickerOpen: false };
    case "RESET_RATE_LIMIT":
      return { ...s, status: "idle", errorMessage: null };
  }
}

const SUGGESTIONS = [
  "Portfolio ADR, last 30 days",
  "RevPAR vs occupancy",
  "Top property by occupancy",
  "Revenue by property this month",
  "Total revenue yesterday",
  "Direct booking ratio by property, last 30 days",
  "CPOR vs ADR by property",
  "RGI trend, last 60 days",
  "NPS and CSAT by segment",
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "result";

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function AppInner() {
  const { t, wide, scheme, toggleScheme } = useTheme();
  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });
  const [state, dispatch] = useReducer(reducer, initial);
  const { question, status, errorMessage, result, sqlOpen, kpis } = state;
  const { properties, propertiesLoaded, selectedIds, pickerOpen } = state;

  const propertyIds =
    selectedIds.size === properties.length ? null : [...selectedIds];
  const idsKey = propertyIds === null ? "*" : [...propertyIds].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    fetchProperties()
      .then((p) => !cancelled && dispatch({ type: "PROPERTIES_LOADED", properties: p }))
      .catch(() => !cancelled && dispatch({ type: "KPIS_FAILED" }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!propertiesLoaded) return;
    writeStored(STORAGE_KEY, JSON.stringify([...selectedIds]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertiesLoaded, idsKey]);

  useEffect(() => {
    if (!propertiesLoaded) return;
    let cancelled = false;
    dispatch({ type: "KPIS_LOADING" });
    fetchKpis(idsKey === "*" ? null : idsKey === "" ? [] : idsKey.split(","))
      .then((data) => !cancelled && dispatch({ type: "KPIS_LOADED", data }))
      .catch(() => !cancelled && dispatch({ type: "KPIS_FAILED" }));
    return () => {
      cancelled = true;
    };
  }, [propertiesLoaded, idsKey]);

  const mapped = useMemo(() => (result ? mapResult(result) : null), [result]);

  const scrollRef = useRef<ScrollView>(null);
  const resultY = useRef(0);
  const [resultSeq, setResultSeq] = useState(0);
  useEffect(() => {
    if (!result) return;
    setResultSeq((s) => s + 1);
    const id = requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ y: Math.max(0, resultY.current - 12), animated: true }),
    );
    return () => cancelAnimationFrame(id);
  }, [result]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: t.bg.page }} />;
  }

  const submit = async (q: string) => {
    const text = q.trim();
    if (!text || status === "loading" || status === "rate_limited") return;
    if (propertyIds && propertyIds.length === 0) {
      dispatch({ type: "FAIL", message: "Select at least one property." });
      return;
    }
    dispatch({ type: "SET_QUESTION", question: text });
    dispatch({ type: "SUBMIT" });
    try {
      dispatch({ type: "SUCCESS", result: await runQuery(text, propertyIds) });
    } catch (e) {
      dispatch({
        type: "FAIL",
        message: e instanceof Error ? e.message : "Something went wrong — try again.",
        code: e instanceof QueryError ? e.code : undefined,
      });
    }
  };

  const pad = wide
    ? { paddingTop: 22, paddingHorizontal: space.mainPad + 2, paddingBottom: 32 }
    : { padding: space.mainPadNarrow };

  return (
    <View style={{ flex: 1, flexDirection: wide ? "row" : "column", backgroundColor: t.bg.page }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Rail
        selectedCount={selectedIds.size}
        onOpenProperties={() => dispatch({ type: "OPEN_PICKER" })}
        scheme={scheme}
        onToggleTheme={toggleScheme}
      />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[{ flexDirection: "column", gap: space.gap }, pad]}
        keyboardShouldPersistTaps="handled"
      >
        <Header
          propertyCount={propertiesLoaded ? selectedIds.size : null}
          totalRooms={kpis.data?.portfolio.totalRooms ?? null}
          sqlOpen={sqlOpen}
          canToggleSql={!!result}
          onToggleSql={() => dispatch({ type: "TOGGLE_SQL" })}
          canExport={!!result?.rows.length && Platform.OS === "web"}
          onExport={() => result && downloadCsv(result.rows, `${slug(result.title)}.csv`)}
        />
        <QuestionPanel
          value={question}
          onChange={(v) => dispatch({ type: "SET_QUESTION", question: v })}
          onSubmit={submit}
          loading={status === "loading"}
          disabled={status === "rate_limited"}
          suggestions={SUGGESTIONS}
        />
        <ResultBlock
          flashKey={resultSeq}
          onLayout={(y) => {
            resultY.current = y;
          }}
        >
          <AnswerCard
            status={status}
            headline={mapped?.headline ?? null}
            findings={result?.summary ?? null}
            facts={mapped?.facts ?? []}
            caveat={result?.caveat ?? null}
            errorMessage={errorMessage}
            rowCount={result?.rows.length ?? null}
            durationMs={result?.duration_ms ?? null}
            sql={result?.sql ?? null}
            sqlOpen={sqlOpen}
            onToggleSql={() => dispatch({ type: "TOGGLE_SQL" })}
            onResetRateLimit={() => dispatch({ type: "RESET_RATE_LIMIT" })}
          />
          {mapped && mapped.charts.length > 0 ? (
            <Grid minWidth={mapped.charts.some((s) => s.kind === "trend") ? 480 : 280}>
              {mapped.charts.map((s) =>
                s.kind === "trend" ? (
                  <TrendLineChart key={s.key} series={s} />
                ) : s.kind === "category" ? (
                  <CategoryBarChart key={s.key} series={s} />
                ) : (
                  <MetricBarChart key={s.key} series={s} />
                ),
              )}
            </Grid>
          ) : null}
          {mapped?.table && result ? (
            <PropertyTable title={result.title} columns={mapped.table.columns} rows={mapped.table.rows} />
          ) : null}
        </ResultBlock>
        <KpiSections snapshot={kpis.data} loading={kpis.status === "loading"} />
        <Footer />
      </ScrollView>
      <PropertyPicker
        visible={pickerOpen}
        properties={properties}
        selectedIds={selectedIds}
        onChange={(ids) => dispatch({ type: "SET_SELECTION", ids })}
        onClose={() => dispatch({ type: "CLOSE_PICKER" })}
      />
    </View>
  );
}
