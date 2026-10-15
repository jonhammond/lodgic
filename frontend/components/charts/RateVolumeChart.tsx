import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryLine,
  VictoryTooltip,
  VictoryVoronoiContainer,
} from "victory";
import { formatByUnit, type MetricUnit } from "../../lib/resultMapping";
import { fonts, tabular } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { formatNumber } from "./format";
import { niceCeil, niceDomain, tickLabel } from "./scale";
import { pickTickValues } from "./ticks";

const PAD = { top: 10, bottom: 22, left: 40, right: 44 };
const NARROW_W = 360;
const NARROW_PAD = 36;
const PLOT_H = 200;
const GAP = 2;
const X_TICK_FONT = { fontFamily: fonts.sans400, fontSize: 10 };

type Props = {
  name: string;
  labels: string[];
  rate: { label: string; values: (number | null)[]; unit: MetricUnit; color: string };
  volume: { label: string; values: (number | null)[] };
};

type BarDatum = { x: number; y: number; y0: number; rooms: number; rate: number | null };

export function RateVolumeChart({ name, labels, rate, volume }: Props) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const n = labels.length;
  const narrow = width > 0 && width < NARROW_W;
  const pad = narrow ? { ...PAD, left: NARROW_PAD, right: NARROW_PAD } : PAD;
  const plotW = Math.max(0, width - pad.left - pad.right);
  const height = PLOT_H + PAD.top + PAD.bottom;

  const { lo, hi, ticks } = useMemo(() => {
    const vs = rate.values.filter((v): v is number => v !== null);
    return vs.length ? niceDomain(Math.min(...vs), Math.max(...vs), 4) : niceDomain(0, 1);
  }, [rate.values]);
  // Both axes share Victory's y domain (Victory "multiple axes" guide), so rooms are
  // mapped onto the left gridlines: one round rooms step per gridline, sized so the
  // tallest bar stays below the top gridline and the rate line keeps headroom.
  const gridStep = ticks.length >= 2 ? ticks[1] - ticks[0] : hi - lo;
  const vStep = useMemo(() => {
    const maxRooms = Math.max(0, ...volume.values.filter((v): v is number => v !== null));
    const intervals = Math.max(1, ticks.length - 2);
    return niceCeil(maxRooms / intervals);
  }, [volume.values, ticks.length]);
  const toY = (rooms: number) => lo + (rooms / vStep) * gridStep;
  const rightLabel = (y: number) => formatNumber(Math.round(((y - lo) / gridStep) * vStep));

  const bars = useMemo(
    () =>
      volume.values.flatMap((v, i): BarDatum[] =>
        v === null ? [] : [{ x: i + 1, y: toY(v), y0: lo, rooms: v, rate: rate.values[i] ?? null }],
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volume.values, rate.values, lo, gridStep, vStep],
  );
  const line = rate.values.map((y, i) => ({ x: i + 1, y }));
  const barWidth = n > 0 ? Math.max(1, Math.min(14, (plotW - GAP * (n - 1)) / n)) : 1;
  const xTicks = pickTickValues(labels, plotW, X_TICK_FONT);
  const tickLabels = { fontFamily: fonts.mono400, fontSize: 10, fill: t.text.tick, padding: 6 };

  const tooltipText = ({ x, rooms, rate: r }: BarDatum): string[] => [
    labels[x - 1] ?? "",
    `${formatNumber(rooms)} rooms`,
    r === null ? `${rate.label} n/a` : `${rate.label} ${formatByUnit(r, rate.unit)}`,
  ];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.note, { color: t.text.subtle }]}>
          {`${rate.label} \u00b7 ${volume.label.toLowerCase()}`}
        </Text>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && n > 0 && (
          <VictoryChart
            width={width}
            height={height}
            padding={pad}
            domain={{ x: [0.5, n + 0.5], y: [lo, hi] }}
            domainPadding={0}
            containerComponent={
              <VictoryVoronoiContainer voronoiDimension="x" voronoiBlacklist={["rate"]} />
            }
          >
            <VictoryAxis
              dependentAxis
              tickValues={ticks}
              tickFormat={(v: number) => tickLabel(v, rate.unit)}
              style={{
                axis: { stroke: "transparent" },
                grid: { stroke: t.border.axis, strokeWidth: 1, strokeDasharray: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...tickLabels, textAnchor: "end" },
              }}
            />
            <VictoryAxis
              dependentAxis
              orientation="right"
              tickValues={ticks}
              tickFormat={rightLabel}
              style={{
                axis: { stroke: "transparent" },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...tickLabels, textAnchor: "start" },
              }}
            />
            <VictoryBar
              name="volume"
              data={bars}
              y0={(d: BarDatum) => d.y0}
              barWidth={barWidth}
              cornerRadius={0}
              labels={({ datum }) => tooltipText(datum as BarDatum)}
              labelComponent={
                <VictoryTooltip
                  constrainToVisibleArea
                  pointerLength={4}
                  cornerRadius={0}
                  flyoutPadding={{ top: 4, bottom: 4, left: 8, right: 8 }}
                  flyoutStyle={{ fill: t.bg.panel, stroke: t.border.strong, strokeWidth: 1 }}
                  style={{ fontFamily: fonts.mono400, fontSize: 10, fill: t.text.primary }}
                />
              }
              style={{
                data: {
                  fill: ({ active }: { active?: boolean }) =>
                    active ? t.trend.volumeActive : t.trend.volume,
                },
              }}
            />
            <VictoryLine
              name="rate"
              interpolation="linear"
              data={line}
              style={{
                data: {
                  stroke: rate.color,
                  strokeWidth: 2.5,
                  strokeLinejoin: "round",
                  strokeLinecap: "round",
                },
              }}
            />
            <VictoryAxis
              tickValues={xTicks}
              tickFormat={(i: number) => labels[i - 1] ?? ""}
              style={{
                axis: { stroke: t.border.axis, strokeWidth: 1 },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...X_TICK_FONT, fill: t.text.dim, padding: 6 },
              }}
            />
          </VictoryChart>
        )}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.lineKey, { backgroundColor: rate.color }]} />
          <Text style={[styles.legendText, { color: t.text.secondary }]}>
            {rate.label} (left axis)
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.barKey, { backgroundColor: t.trend.volume }]} />
          <Text style={[styles.legendText, { color: t.text.secondary }]}>
            {volume.label} (right axis)
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    marginBottom: 14,
  },
  title: { fontFamily: fonts.sans700, fontSize: 13, flexShrink: 1 },
  note: { fontFamily: fonts.mono400, fontSize: 11, ...tabular },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 2, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
  lineKey: { width: 16, height: 3, borderRadius: 2 },
  barKey: { width: 10, height: 10, borderRadius: 1 },
  legendText: { fontFamily: fonts.sans400, fontSize: 11 },
});
