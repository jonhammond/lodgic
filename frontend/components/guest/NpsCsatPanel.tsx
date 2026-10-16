import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fetchNpsCsatData, GuestRow } from "../../lib/npsCsat";
import {
  comboSeries,
  guestTrend,
  propertyScores,
  Segment,
  SEGMENT_LABEL,
  segmentScores,
  trendBuckets,
} from "../../lib/npsCsatEngine";
import { Property } from "../../lib/properties";
import { Timeframe } from "../../lib/revparEngine";
import { fonts, space } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { GuestTrendChart, guestTrendCsvRows } from "../charts/GuestTrendChart";
import { ScoreComboChart } from "../charts/ScoreComboChart";
import { Button } from "../Button";
import { SegmentedControl } from "../SegmentedControl";
import { Skeleton } from "../Skeleton";

export type NpsCsatPanelProps = {
  properties: Property[];
  selectedIds: Set<string>;
  initialTimeframe: Timeframe;
  /** CSV rows plus filename; ([], "") while loading, on error/empty and on unmount. */
  onRowsChange: (rows: Record<string, unknown>[], filename: string) => void;
};

type Data =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: GuestRow[]; latestDate: string };

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "mtd", label: "30 days" },
  { key: "ytd", label: "12 months" },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function NpsCsatPanel({ properties, selectedIds, initialTimeframe, onRowsChange }: NpsCsatPanelProps) {
  const { t } = useTheme();
  const [data, setData] = useState<Data>({ status: "loading" });
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [segment, setSegmentState] = useState<Segment | null>(null);
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const setSegment = (s: Segment | null) => {
    setSegmentState(s);
    setHotelId(null);
  };

  useEffect(() => {
    let cancelled = false;
    fetchNpsCsatData()
      .then((d) => !cancelled && setData({ status: "ready", ...d }))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setData({
            status: "error",
            message: e instanceof Error ? e.message : "Could not load NPS and CSAT data.",
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

  const scores = useMemo(
    () =>
      ready && ready.latestDate !== "" && selected.length > 0
        ? propertyScores(ready.rows, selected, timeframe, ready.latestDate)
        : [],
    [ready, selected, timeframe],
  );
  const segments = useMemo(() => segmentScores(scores), [scores]);

  // Picker changes can remove the selected segment or hotel; derive the effective selection.
  const activeSegment = segment && segments.some((s) => s.segment === segment) ? segment : null;
  const hotels = useMemo(
    () => (activeSegment ? scores.filter((s) => s.segment === activeSegment) : []),
    [scores, activeSegment],
  );
  const activeHotel = hotelId ? (hotels.find((h) => h.id === hotelId) ?? null) : null;

  // Persist the clearing: re-adding properties in the picker must not resurrect old selections.
  const segmentGone = ready !== null && segment !== null && activeSegment === null;
  const hotelGone = ready !== null && hotelId !== null && activeHotel === null;
  if (segmentGone) setSegmentState(null);
  if (segmentGone || hotelGone) setHotelId(null);

  const trend = useMemo(() => {
    if (!ready || !activeHotel || !activeSegment) return null;
    const buckets = trendBuckets(ready.rows, timeframe, ready.latestDate);
    return guestTrend(ready.rows, selected, buckets, activeHotel.id, activeSegment, [...selectedIds]);
  }, [ready, activeHotel, activeSegment, selected, selectedIds, timeframe]);

  const segmentSeries = useMemo(
    () =>
      comboSeries(
        segments.map((s) => s.label),
        segments.map((s) => s.nps),
        segments.map((s) => s.csat),
        "CSAT and NPS by segment",
        "nps-csat-segments",
      ),
    [segments],
  );
  const hotelSeries = useMemo(
    () =>
      activeSegment
        ? comboSeries(
            hotels.map((h) => h.name),
            hotels.map((h) => h.nps),
            hotels.map((h) => h.csat),
            `Hotels in ${SEGMENT_LABEL[activeSegment]}`,
            "nps-csat-hotels",
          )
        : null,
    [hotels, activeSegment],
  );

  const exportName = activeHotel
    ? `nps-csat-${slug(activeHotel.name)}-${timeframe}.csv`
    : `nps-csat-by-segment-${timeframe}.csv`;
  const csvRows = useMemo<Record<string, unknown>[]>(() => {
    if (trend) return guestTrendCsvRows(trend);
    return scores.map((s) => ({
      segment: SEGMENT_LABEL[s.segment as Segment] ?? s.segment,
      property: s.name,
      nps: Number(s.nps.toFixed(1)),
      csat: Number(s.csat.toFixed(2)),
      rooms_sold: Math.round(s.roomsSold),
      days: s.days,
    }));
  }, [trend, scores]);

  useEffect(() => {
    onRowsChange(csvRows, csvRows.length > 0 ? exportName : "");
  }, [csvRows, exportName, onRowsChange]);
  useEffect(() => () => onRowsChange([], ""), [onRowsChange]);

  if (data.status === "loading") {
    return (
      <View style={styles.col} accessibilityLabel="Loading NPS and CSAT data">
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

  const tfLabel = TIMEFRAMES.find((o) => o.key === timeframe)?.label ?? "";
  const daysUsed = scores.reduce((m, s) => Math.max(m, s.days), 0);
  const sentence =
    timeframe === "daily"
      ? `Rooms-sold-weighted for ${data.latestDate}; trend shows the trailing 30 days.`
      : `Rooms-sold-weighted over the latest ${daysUsed} days to ${data.latestDate}.`;
  const empty =
    selected.length === 0
      ? "Select at least one property."
      : segments.length === 0 || segments.every((s) => s.roomsSold === 0)
        ? "No data for the selected properties."
        : null;

  return (
    <View style={styles.col}>
      <Text style={[styles.title, { color: t.text.primary }]}>NPS and CSAT by segment</Text>
      {empty ? null : <Text style={[styles.body, { color: t.text.secondary }]}>{sentence}</Text>}
      <SegmentedControl label="Timeframe" options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />
      {empty ? (
        <Text style={[styles.body, { color: t.text.muted }]}>{empty}</Text>
      ) : (
        <>
          <ScoreComboChart
            series={segmentSeries}
            note="% of 5-point CSAT · NPS -100..100"
            selectedIndex={activeSegment ? segments.findIndex((s) => s.segment === activeSegment) : null}
            onSelect={(i) => setSegment(segments[i]?.segment ?? null)}
          />
          {activeSegment && hotelSeries ? (
            <ScoreComboChart
              series={hotelSeries}
              note={`${hotels.length} ${hotels.length === 1 ? "hotel" : "hotels"}, ${tfLabel}`}
              selectedIndex={activeHotel ? hotels.findIndex((h) => h.id === activeHotel.id) : null}
              onSelect={(i) => setHotelId(hotels[i]?.id ?? null)}
              footer={<Button variant="text" label="All segments" onPress={() => setSegment(null)} />}
            />
          ) : null}
          {activeSegment && activeHotel && trend ? (
            <GuestTrendChart
              title={`${activeHotel.name}, ${timeframe === "daily" ? "30 days" : tfLabel}`}
              note={`${timeframe === "ytd" ? "monthly" : "daily"}, rooms-sold-weighted`}
              trend={trend}
              hotelName={activeHotel.name}
              segmentLabel={SEGMENT_LABEL[activeSegment]}
              footer={<Button variant="text" label="All hotels" onPress={() => setHotelId(null)} />}
            />
          ) : null}
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
});
