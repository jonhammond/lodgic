import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  VictoryAxis,
  VictoryChart,
  VictoryLabel,
  VictoryScatter,
  VictoryTooltip,
  VictoryVoronoiContainer,
} from "victory";
import { barRamp, denseRankDesc } from "../../lib/color";
import { formatByUnit } from "../../lib/resultMapping";
import type { ScatterSeries } from "../../lib/explicitCharts";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { niceDomain, tickLabel } from "./scale";

const PAD = { top: 14, bottom: 54, left: 72, right: 22 };
const PAD_NARROW = { ...PAD, left: 62, right: 14 };
const NARROW_W = 360;
const LABEL_MIN_W = 480;
const LABEL_MAX_POINTS = 10;

type Datum = { x: number; y: number; label: string; fill: string };

/** Two-metric correlation: one point per category, shaded by y-rank. */
export function ScatterChart({ series }: { series: ScatterSeries }) {
  const { t, scheme } = useTheme();
  const [width, setWidth] = useState(0);
  const { points, xUnit, yUnit } = series;
  const n = points.length;
  const narrow = width > 0 && width < NARROW_W;
  const pad = narrow ? PAD_NARROW : PAD;
  const height = Math.round(Math.min(360, Math.max(240, width * 0.6)));
  const xd = niceDomain(Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x)), 4);
  const yd = niceDomain(Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y)), 4);
  const ranks = denseRankDesc(points.map((p) => p.y));
  const ramp = barRamp(t.kpi.market.bar, t.bg.card, scheme, ranks.length ? Math.max(...ranks) + 1 : 0);
  const data: Datum[] = points.map((p, i) => ({ x: p.x, y: p.y, label: p.label, fill: ramp[ranks[i]] }));
  const named = n <= LABEL_MAX_POINTS && width >= LABEL_MIN_W;
  const tick = { fontFamily: fonts.mono400, fontSize: 10, fill: t.text.tick, padding: 6 };
  const axisLabel = { fontFamily: fonts.sans400, fontSize: 11, fill: t.text.dim };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]}>{series.title}</Text>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && n > 0 && (
          <VictoryChart
            width={width}
            height={height}
            padding={pad}
            domain={{ x: [xd.lo, xd.hi], y: [yd.lo, yd.hi] }}
            domainPadding={{ x: 10, y: 10 }}
            containerComponent={<VictoryVoronoiContainer voronoiBlacklist={["names"]} />}
          >
            <VictoryAxis
              tickValues={narrow ? [xd.lo, xd.hi] : xd.ticks}
              tickFormat={(v: number) => tickLabel(v, xUnit)}
              label={series.xLabel}
              axisLabelComponent={<VictoryLabel dy={8} />}
              style={{
                axis: { stroke: t.border.axis, strokeWidth: 1 },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: tick,
                axisLabel: { ...axisLabel, padding: 34 },
              }}
            />
            <VictoryAxis
              dependentAxis
              tickValues={yd.ticks}
              tickFormat={(v: number) => tickLabel(v, yUnit)}
              label={series.yLabel}
              axisLabelComponent={<VictoryLabel dy={-10} />}
              style={{
                axis: { stroke: "transparent" },
                grid: { stroke: t.border.axis, strokeWidth: 1, strokeDasharray: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...tick, textAnchor: "end" },
                axisLabel: { ...axisLabel, padding: narrow ? 46 : 56 },
              }}
            />
            <VictoryScatter
              name="points"
              data={data}
              size={6}
              labels={({ datum }) => [
                (datum as Datum).label,
                `${series.xLabel} ${formatByUnit((datum as Datum).x, xUnit)}`,
                `${series.yLabel} ${formatByUnit((datum as Datum).y, yUnit)}`,
              ]}
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
                  fill: ({ datum }: { datum?: Datum }) => datum?.fill ?? t.kpi.market.bar,
                  stroke: t.bg.card,
                  strokeWidth: 1.5,
                },
              }}
            />
            {named && (
              <VictoryScatter
                name="names"
                data={data}
                size={0}
                labels={({ datum }) => (datum as Datum).label}
                labelComponent={<VictoryLabel dy={-12} textAnchor="middle" />}
                style={{
                  data: { fill: "transparent" },
                  labels: { fontFamily: fonts.sans400, fontSize: 10, fill: t.text.dim },
                }}
              />
            )}
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
    marginBottom: 10,
  },
  title: { fontFamily: fonts.sans700, fontSize: 13, flexShrink: 1 },
});
