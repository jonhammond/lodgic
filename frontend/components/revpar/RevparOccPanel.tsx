import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fetchRevparOccData } from "../../lib/revparOcc";
import {
  baseInputs,
  compute,
  DailyRow,
  DAYS,
  Portfolio,
  SortKey,
  Timeframe,
  sortRows,
} from "../../lib/revparEngine";
import { Property } from "../../lib/properties";
import { fonts, space } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency, formatNumber, formatPercent } from "../charts/format";
import { RevparOccChart } from "../charts/RevparOccChart";
import { Button } from "../Button";
import { RangeSlider } from "../RangeSlider";
import { SegmentedControl } from "../SegmentedControl";
import { Skeleton } from "../Skeleton";
import { RevparOccCards } from "./RevparOccCards";
import { RevparOccTable } from "./RevparOccTable";

export type RevparOccPanelProps = {
  properties: Property[];
  selectedIds: Set<string>;
  /** Leaderboard rows plus CSV filename; ([], "") while loading, on error/empty and on unmount. */
  onRowsChange: (rows: Record<string, unknown>[], filename: string) => void;
};

type Sort = { key: SortKey; dir: "asc" | "desc" };
type Data =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: DailyRow[]; latestDate: string };

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "mtd", label: "30 days" },
  { key: "ytd", label: "Annualised" },
];
const SORT_OPTIONS: { key: "revpar" | "occupancy"; label: string }[] = [
  { key: "revpar", label: "RevPAR" },
  { key: "occupancy", label: "Occupancy" },
];

function dailySeries(
  rows: DailyRow[],
  props: Property[],
  timeframe: Timeframe,
  latestDate: string,
): { occupancy: number[]; adr: number[]; revpar: number[] } {
  const rooms = new Map(props.map((p) => [p.id, p.total_rooms]));
  const dates = [...new Set(rows.map((r) => r.metric_date))]
    .filter((d) => d <= latestDate)
    .sort()
    .reverse()
    .slice(0, DAYS[timeframe])
    .reverse();
  const acc = new Map(dates.map((d) => [d, { sold: 0, rev: 0, avail: 0 }]));
  for (const r of rows) {
    const a = acc.get(r.metric_date);
    const cap = rooms.get(r.property_id);
    if (!a || cap === undefined) continue;
    a.sold += r.rooms_sold;
    a.rev += r.total_revenue;
    a.avail += cap;
  }
  const v = dates.map((d) => acc.get(d)!);
  const div = (a: number, b: number) => (b > 0 ? a / b : 0);
  return {
    occupancy: v.map((x) => div(x.sold, x.avail)),
    adr: v.map((x) => div(x.rev, x.sold)),
    revpar: v.map((x) => div(x.rev, x.avail)),
  };
}

export function RevparOccPanel({ properties, selectedIds, onRowsChange }: RevparOccPanelProps) {
  const { t, wide } = useTheme();
  const [data, setData] = useState<Data>({ status: "loading" });
  const [timeframe, setTimeframe] = useState<Timeframe>("mtd");
  const [sort, setSort] = useState<Sort>({ key: "revpar", dir: "desc" });
  const [demandShift, setDemandShift] = useState(1);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchRevparOccData()
      .then((d) => !cancelled && setData({ status: "ready", ...d }))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setData({
            status: "error",
            message: e instanceof Error ? e.message : "Could not load RevPAR data.",
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const selected = useMemo(
    () => properties.filter((p) => selectedIds.has(p.id)),
    [properties, selectedIds],
  );
  const ready = data.status === "ready" ? data : null;

  const base = useMemo(
    () =>
      ready && ready.latestDate !== "" && selected.length > 0
        ? baseInputs(ready.rows, selected, timeframe, ready.latestDate)
        : null,
    [ready, selected, timeframe],
  );

  const calc = useMemo(() => {
    if (!base) return null;
    const cur = compute(base, timeframe, demandShift);
    const baseline: Portfolio | null =
      demandShift !== 1 ? compute(base, timeframe, 1).portfolio : null;
    return { ...cur, baseline };
  }, [base, timeframe, demandShift]);

  const sorted = useMemo(
    () => (calc ? sortRows(calc.rows, sort.key, sort.dir) : []),
    [calc, sort],
  );

  const series = useMemo(
    () =>
      ready && ready.latestDate !== ""
        ? dailySeries(ready.rows, selected, timeframe, ready.latestDate)
        : { occupancy: [], adr: [], revpar: [] },
    [ready, selected, timeframe],
  );

  const csvRows = useMemo<Record<string, unknown>[]>(() => {
    if (!calc || sorted.length === 0) return [];
    const line = (property: string, rooms: number, avail: number, sold: number, rev: number, occ: number, adr: number, revpar: number, tier: string) => ({
      property,
      rooms,
      rooms_available: avail,
      rooms_sold: Math.round(sold),
      revenue: Number(rev.toFixed(2)),
      occupancy_pct: Number((occ * 100).toFixed(1)),
      adr: Number(adr.toFixed(2)),
      revpar: Number(revpar.toFixed(2)),
      tier,
    });
    const p = calc.portfolio;
    return [
      ...sorted.map((r) => line(r.name, r.rooms, r.roomsAvailable, r.roomsSold, r.revenue, r.occupancy, r.adr, r.revpar, r.tier)),
      line("Portfolio", p.rooms, p.roomsAvailable, p.roomsSold, p.revenue, p.occupancy, p.adr, p.revpar, ""),
    ];
  }, [calc, sorted]);

  useEffect(() => {
    const scenario = demandShift !== 1 ? `-demand${Math.round(demandShift * 100)}` : "";
    onRowsChange(csvRows, csvRows.length > 0 ? `revpar-vs-occupancy-${timeframe}${scenario}.csv` : "");
  }, [csvRows, timeframe, demandShift, onRowsChange]);
  useEffect(() => () => onRowsChange([], ""), [onRowsChange]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  if (data.status === "loading") {
    return (
      <View style={styles.col} accessibilityLabel="Loading RevPAR data">
        <Skeleton w="70%" h={16} />
        <Skeleton h={40} />
        <Skeleton h={120} />
      </View>
    );
  }
  if (data.status === "error") {
    return (
      <View style={styles.col}>
        <Text style={[styles.body, { color: t.delta.error }]}>{data.message}</Text>
        <View style={styles.retry}>
          <Button
            label="Retry"
            onPress={() => {
              setData({ status: "loading" });
              setAttempt((a) => a + 1);
            }}
          />
        </View>
      </View>
    );
  }

  const subtitle =
    timeframe === "daily"
      ? `Latest day (${data.latestDate})`
      : timeframe === "mtd"
        ? "Last 30 days"
        : `Annualised from ${calc?.daysUsed ?? 0} days of data`;
  const n = selected.length;
  const empty =
    n === 0
      ? "Select at least one property."
      : !calc || sorted.length === 0 || data.latestDate === ""
        ? "No data for the selected properties."
        : null;

  return (
    <View style={styles.col}>
      <Text style={[styles.title, { color: t.text.primary }]}>
        {`RevPAR vs occupancy · ${n} ${n === 1 ? "property" : "properties"} · ${subtitle}`}
      </Text>
      {calc ? (
        <Text style={[styles.body, { color: t.text.secondary }]}>
          {`Portfolio RevPAR ${formatCurrency(calc.portfolio.revpar)} at ${formatPercent(calc.portfolio.occupancy * 100)} occupancy · ${formatCurrency(calc.portfolio.revenue)} revenue on ${formatNumber(Math.round(calc.portfolio.roomsAvailable))} room-nights.`}
        </Text>
      ) : null}
      <View style={[styles.filters, wide ? styles.filtersWide : null]}>
        <SegmentedControl label="Timeframe" options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />
        <SegmentedControl
          label="Sort by"
          options={SORT_OPTIONS}
          value={SORT_OPTIONS.find((o) => o.key === sort.key)?.key ?? null}
          onChange={(key) => setSort({ key, dir: "desc" })}
        />
        <RangeSlider
          label="Market demand"
          value={demandShift}
          min={0.5}
          max={1.5}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={setDemandShift}
        />
      </View>
      {empty || !calc ? (
        <Text style={[styles.body, { color: t.text.muted }]}>{empty}</Text>
      ) : (
        <>
          <RevparOccCards portfolio={calc.portfolio} baseline={calc.baseline} series={series} />
          <RevparOccChart rows={sorted} target={calc.portfolio.target} />
          <RevparOccTable rows={sorted} portfolio={calc.portfolio} sort={sort} onSort={onSort} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space.gap },
  title: { fontFamily: fonts.sans500, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.sans400, fontSize: 13, lineHeight: 19 },
  retry: { alignSelf: "flex-start" },
  filters: { gap: 12 },
  filtersWide: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 24 },
});
