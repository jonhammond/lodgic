import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryLabel,
  VictoryLine,
  VictoryScatter,
  VictoryTooltip,
  VictoryVoronoiContainer,
} from "victory";
import { formatByUnit } from "../../lib/resultMapping";
import type { DualAxisSeries } from "../../lib/explicitCharts";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { truncateLabel, wrapLabel } from "./rows";
import { axisScale, tickLabel } from "./scale";
import { axisGutter } from "./ticks";
import { chartType, isCompact } from "./typography";

const PAD_TOP = 10;
const NARROW_TICK_ANGLE = -60;
const NARROW_LABEL_CHARS = 16; // single rotated line, ellipsised beyond this
const MAX_LABEL_LINES = 3;
const MAX_LABEL_CHARS = 14;
const PLOT_H = 220;
const GAP = 8;
const MAX_BAR_W = 28;
const INTERVALS = 4;
const TICKS = Array.from({ length: INTERVALS + 1 }, (_, i) => (i * 100) / INTERVALS);

type BarDatum = { x: number; y: number; y0: number; i: number };

/** Bars on the left axis, line on the right; each axis is normalised to a shared 0..100 grid. */
export function DualAxisChart({ series }: { series: DualAxisSeries }) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const { labels, bar, line } = series;
  const n = labels.length;
  const ty = chartType(width);
  const narrow = isCompact(width);
  const barColor = t.kpi[bar.color];
  const lineColor = t.kpi[line.color].line;

  const bs = axisScale(bar.values);
  const ls = axisScale(line.values);
  const norm = (v: number, s: { lo: number; hi: number }) => ((v - s.lo) / (s.hi - s.lo)) * 100;
  const denorm = (y: number, s: { lo: number; hi: number }) => s.lo + (y / 100) * (s.hi - s.lo);
  const gutterL = axisGutter(
    TICKS.map((v) => tickLabel(denorm(v, bs), bar.unit)),
    ty.tickFont,
  );
  const gutterR = axisGutter(
    TICKS.map((v) => tickLabel(denorm(v, ls), line.unit)),
    ty.tickFont,
  );
  const plotW = Math.max(0, width - gutterL - gutterR);

  // y0 anchors bars at the zero line; without it Victory draws them from the plot floor.
  const zeroY = norm(0, bs);
  const bars: BarDatum[] = bar.values.map((v, i) => ({
    x: i + 1,
    y: norm(v, bs),
    y0: zeroY,
    i,
  }));
  const dots = line.values.map((v, i) => ({ x: i + 1, y: norm(v, ls) }));
  const barWidth = n > 0 ? Math.max(1, Math.min(MAX_BAR_W, (plotW - GAP * (n - 1)) / n)) : 1;
  const slotChars = n > 0 ? Math.floor(plotW / n / ty.sansAdvance) - 1 : MAX_LABEL_CHARS;
  // Narrow: one steeply rotated line per label (wrapped multi-line labels pile up at ~20px pitch).
  const names = labels.map((l) =>
    narrow
      ? truncateLabel(l ?? "", NARROW_LABEL_CHARS)
      : wrapLabel(l ?? "", Math.max(6, Math.min(MAX_LABEL_CHARS, slotChars)), MAX_LABEL_LINES),
  );
  const lines = Math.max(1, ...names.map((s) => s.split("\n").length));
  // Compact: rotated single line needs its vertical extent; else category lines + axis padding.
  const bottom = narrow
    ? Math.ceil(NARROW_LABEL_CHARS * ty.sansAdvance * Math.sin((-NARROW_TICK_ANGLE * Math.PI) / 180)) + 10
    : ty.label + 24 + (lines - 1) * ty.lineH;
  const pad = { top: PAD_TOP, bottom, left: gutterL, right: gutterR };
  const height = PLOT_H + pad.top + pad.bottom;
  const tickLabels = {
    fontFamily: fonts.mono400,
    fontSize: ty.tick,
    fill: t.text.tick,
    padding: 6,
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary, fontSize: ty.title }]}>{series.title}</Text>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && n > 0 && (
          <VictoryChart
            width={width}
            height={height}
            padding={pad}
            domain={{ x: [0.5, n + 0.5], y: [0, 100] }}
            domainPadding={0}
            containerComponent={
              <VictoryVoronoiContainer voronoiDimension="x" voronoiBlacklist={["line", "line-halo", "dots"]} />
            }
          >
            <VictoryAxis
              dependentAxis
              tickValues={TICKS}
              tickFormat={(v: number) => tickLabel(denorm(v, bs), bar.unit)}
              style={{
                axis: { stroke: "transparent" },
                grid: {
                  stroke: t.border.axis,
                  strokeWidth: 1,
                  strokeDasharray: "none",
                },
                ticks: { stroke: "transparent" },
                tickLabels: { ...tickLabels, textAnchor: "end" },
              }}
            />
            <VictoryAxis
              dependentAxis
              orientation="right"
              tickValues={TICKS}
              tickFormat={(v: number) => tickLabel(denorm(v, ls), line.unit)}
              style={{
                axis: { stroke: "transparent" },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...tickLabels, textAnchor: "start" },
              }}
            />
            <VictoryBar
              name="bars"
              data={bars}
              barWidth={barWidth}
              cornerRadius={{ top: 2 }}
              labels={({ datum }) => {
                const i = (datum as BarDatum).i;
                return [
                  labels[i] ?? "",
                  `${bar.title} ${formatByUnit(bar.values[i] ?? 0, bar.unit)}`,
                  `${line.title} ${formatByUnit(line.values[i] ?? 0, line.unit)}`,
                ];
              }}
              labelComponent={
                <VictoryTooltip
                  constrainToVisibleArea
                  pointerLength={4}
                  cornerRadius={0}
                  flyoutPadding={{ top: 4, bottom: 4, left: 8, right: 8 }}
                  flyoutStyle={{
                    fill: t.bg.panel,
                    stroke: t.border.strong,
                    strokeWidth: 1,
                  }}
                  style={{
                    fontFamily: fonts.mono400,
                    fontSize: ty.legend,
                    fill: t.text.primary,
                  }}
                />
              }
              style={{
                data: {
                  fill: ({ active }: { active?: boolean }) => (active ? barColor.line : barColor.bar),
                },
              }}
            />
            {/* Card-colour halo keeps the line readable where it crosses bars of similar brightness. */}
            <VictoryLine
              name="line-halo"
              interpolation="linear"
              data={dots}
              style={{
                data: {
                  stroke: t.bg.card,
                  strokeWidth: 5.5,
                  strokeLinejoin: "round",
                  strokeLinecap: "round",
                },
              }}
            />
            <VictoryLine
              name="line"
              interpolation="linear"
              data={dots}
              style={{
                data: {
                  stroke: lineColor,
                  strokeWidth: 2.5,
                  strokeLinejoin: "round",
                  strokeLinecap: "round",
                },
              }}
            />
            <VictoryScatter
              name="dots"
              data={dots}
              size={3.5}
              style={{
                data: { fill: lineColor, stroke: t.bg.card, strokeWidth: 1.5 },
              }}
            />
            <VictoryAxis
              tickValues={labels.map((_, i) => i + 1)}
              tickFormat={(i: number) => names[i - 1] ?? ""}
              tickLabelComponent={
                narrow ? (
                  <VictoryLabel angle={NARROW_TICK_ANGLE} textAnchor="end" verticalAnchor="middle" />
                ) : (
                  <VictoryLabel lineHeight={1.15} />
                )
              }
              style={{
                axis: { stroke: t.border.axis, strokeWidth: 1 },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: {
                  fontFamily: fonts.sans400,
                  fontSize: ty.label,
                  fill: t.text.dim,
                  padding: 6,
                },
              }}
            />
          </VictoryChart>
        )}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.barKey, { backgroundColor: barColor.bar }]} />
          <Text
            style={[styles.legendText, { color: t.text.secondary, fontSize: ty.legend }]}
          >{`${bar.title} (left axis)`}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.lineKey, { backgroundColor: lineColor }]} />
          <Text
            style={[styles.legendText, { color: t.text.secondary, fontSize: ty.legend }]}
          >{`${line.title} (right axis)`}</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14 },
  header: { marginBottom: 14 },
  title: { fontFamily: fonts.sans700 },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 14,
    rowGap: 2,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
  },
  lineKey: { width: 16, height: 3, borderRadius: 2 },
  barKey: { width: 10, height: 10, borderRadius: 1 },
  legendText: { fontFamily: fonts.sans400 },
});
