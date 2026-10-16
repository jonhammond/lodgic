import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryGroup,
  VictoryLabel,
} from "victory";
import {
  formatByUnit,
  formatExact,
  GroupedSeries,
} from "../../lib/resultMapping";
import { mix } from "../../lib/color";
import { fonts, tabular } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { NARROW_W } from "./CategoryBarChart";
import { LABEL_FONT, NARROW, WIDE, wrapLabel } from "./rows";
import { niceDomain, tickLabel } from "./scale";

const BAR_W = 12;
const GAP = 3;
const ROW_PAD = 10;
const VALUE_CHAR_W = 6.2; // mono 10px advance
// Metric hues (ADR green, CPOR amber) sit at near-identical luminance in light mode, so they
// separate by hue alone under deuteranopia/protanopia. Each series after the first is pulled
// towards black by a growing step, adding a lightness difference on top of hue.
const LIGHTNESS_STEP = 0.22;

/** Horizontal grouped bars: one bar per metric within each category row, flat hue per metric. */
export function GroupedBarChart({ series }: { series: GroupedSeries }) {
  const { t, scheme } = useTheme();
  const [width, setWidth] = useState(0);
  const { labels, unit } = series;
  const fillOf = (i: number) => {
    const base = t.kpi[series.series[i].color].bar;
    // Dark-mode hues already differ in brightness; only light mode needs the offset.
    if (i === 0 || scheme === "dark") return base;
    return mix(base, "#000000", LIGHTNESS_STEP * i);
  };
  const n = labels.length;
  const k = series.series.length;
  const all = series.series.flatMap((s) => s.values);
  const domain = niceDomain(0, Math.max(0, ...all), 4);
  const max = domain.hi;
  const narrow = width > 0 && width < NARROW_W;
  const ticks = narrow ? [0, max] : domain.ticks;
  const layout = narrow ? NARROW : WIDE;
  const names = labels.map((l) => wrapLabel(l ?? "", layout.chars));
  const wrapped = names.some((s) => s.includes("\n"));
  const groupH = k * (BAR_W + GAP);
  const rowH = Math.max(groupH + ROW_PAD, wrapped ? 36 : 0);
  const fmt = narrow ? formatByUnit : formatExact;
  const valueW =
    Math.max(0, ...all.map((v) => fmt(v, unit).length)) * VALUE_CHAR_W + 12;
  const pad = {
    top: 6,
    bottom: 22,
    left: layout.left,
    right: Math.ceil(valueW),
  };
  const height = n * rowH + pad.top + pad.bottom;
  // Victory draws x=1 at the bottom of a horizontal chart; invert so row 0 is on top.
  // Within a group Victory stacks the first child lowest, so reverse the series to match the legend order.
  const ordered = series.series
    .map((s, i) => ({ ...s, fill: fillOf(i) }))
    .reverse();

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]}>
          {series.title}
        </Text>
        <Text style={[styles.note, { color: t.text.subtle }]}>
          {series.note}
        </Text>
      </View>
      <View style={styles.legend}>
        {series.series.map((s, i) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.legendKey, { backgroundColor: fillOf(i) }]} />
            <Text style={[styles.legendText, { color: t.text.secondary }]}>
              {s.title}
            </Text>
          </View>
        ))}
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && n > 0 && (
          <VictoryChart
            horizontal
            width={width}
            height={height}
            padding={pad}
            domain={{ x: [0.5, n + 0.5], y: [0, max] }}
            domainPadding={0}
          >
            <VictoryAxis
              tickValues={labels.map((_, i) => n - i)}
              tickFormat={(x: number) => names[n - x] ?? ""}
              tickLabelComponent={<VictoryLabel lineHeight={1.15} />}
              style={{
                axis: { stroke: "transparent" },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...LABEL_FONT, fill: t.text.dim, padding: 6 },
              }}
            />
            <VictoryAxis
              dependentAxis
              tickValues={ticks}
              tickFormat={(v: number) => tickLabel(v, unit)}
              style={{
                axis: { stroke: t.border.axis, strokeWidth: 1 },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: {
                  fontFamily: fonts.mono400,
                  fontSize: 10,
                  fill: t.text.tick,
                  padding: 6,
                  textAnchor: ({ index }: { index?: number | string }) =>
                    Number(index) === ticks.length - 1
                      ? "end"
                      : Number(index) === 0
                        ? "start"
                        : "middle",
                },
              }}
            />
            <VictoryGroup offset={BAR_W + GAP}>
              {ordered.map((s) => (
                <VictoryBar
                  key={s.key}
                  data={s.values.map((y, i) => ({ x: n - i, y }))}
                  barWidth={BAR_W}
                  cornerRadius={{ top: 2 }}
                  labels={({ datum }) => fmt(datum.y, unit)}
                  labelComponent={<VictoryLabel dx={4} textAnchor="start" />}
                  style={{
                    data: { fill: s.fill, fillOpacity: 1 },
                    labels: {
                      fontFamily: fonts.mono400,
                      fontSize: 10,
                      fill: t.text.primary,
                    },
                  }}
                />
              ))}
            </VictoryGroup>
          </VictoryChart>
        )}
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
    marginBottom: 8,
  },
  title: { fontFamily: fonts.sans700, fontSize: 13 },
  note: { fontFamily: fonts.mono400, fontSize: 11, ...tabular },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 2,
    marginBottom: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendKey: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontFamily: fonts.sans400, fontSize: 11 },
});
