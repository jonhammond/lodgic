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
import { formatByUnit } from "../../lib/resultMapping";
import type { Quadrant, ScatterSeries } from "../../lib/explicitCharts";
import { placeLabels } from "../../lib/scatterLabels";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { niceDomain, tickLabel } from "./scale";

const PAD = { top: 14, bottom: 54, left: 72, right: 22 };
const PAD_NARROW = { ...PAD, left: 62, right: 14 };
const NARROW_W = 360;
const LABEL_MIN_W = 480;
const LABEL_MAX_POINTS = 10;
const DOMAIN_PAD = 10;

type Datum = {
  x: number;
  y: number;
  name: string;
  quadrant: Quadrant;
  fill: string;
  dx?: number;
  dy?: number;
  anchor?: "start" | "middle" | "end";
  hidden?: boolean;
};

/** Two-metric correlation: one point per category, coloured by quadrant at the medians. */
export function ScatterChart({ series }: { series: ScatterSeries }) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const { points, xUnit, yUnit } = series;
  const n = points.length;
  const narrow = width > 0 && width < NARROW_W;
  const pad = narrow ? PAD_NARROW : PAD;
  const height = Math.round(Math.min(360, Math.max(240, width * 0.6)));
  const xd = niceDomain(Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x)), 4);
  const yd = niceDomain(Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y)), 4);
  const data: Datum[] = points.map((p) => ({ x: p.x, y: p.y, name: p.label, quadrant: p.quadrant, fill: t.quadrant[p.quadrant] }));
  const named = n <= LABEL_MAX_POINTS && width >= LABEL_MIN_W;
  const xSpan = xd.hi - xd.lo || 1;
  const ySpan = yd.hi - yd.lo || 1;
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);
  if (named) {
    // Placement is stored on the datum because Victory clones data objects.
    const placed = placeLabels(
      data.map((d) => ({
        px: DOMAIN_PAD + ((d.x - xd.lo) / xSpan) * (plotW - 2 * DOMAIN_PAD),
        py: DOMAIN_PAD + ((yd.hi - d.y) / ySpan) * (plotH - 2 * DOMAIN_PAD),
        name: d.name,
      })),
      plotW,
      plotH,
    );
    placed.forEach((pl, i) => {
      if (pl) Object.assign(data[i], { dx: pl.dx, dy: pl.dy, anchor: pl.anchor });
      else data[i].hidden = true;
    });
  }
  const legendItems = [
    { key: "strong", text: `High ${series.xLabel}, high ${series.yLabel}` },
    { key: "weak", text: `Low ${series.xLabel}, low ${series.yLabel}` },
    { key: "pricey", text: `High ${series.xLabel}, low ${series.yLabel}` },
    { key: "busy", text: `Low ${series.xLabel}, high ${series.yLabel}` },
  ] as const;
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
              label={series.xTitle}
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
              label={series.yTitle}
              axisLabelComponent={<VictoryLabel />}
              style={{
                axis: { stroke: "transparent" },
                grid: { stroke: t.border.axis, strokeWidth: 1, strokeDasharray: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...tick, textAnchor: "end" },
                axisLabel: { ...axisLabel, padding: pad.left - 16 },
              }}
            />
            <VictoryScatter
              name="points"
              data={data}
              size={6}
              labels={({ datum }) => [
                (datum as Datum).name,
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
                  fill: ({ datum }: { datum?: Datum }) => datum?.fill ?? t.quadrant.strong,
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
                labels={({ datum }) => ((datum as Datum).hidden ? "" : (datum as Datum).name)}
                labelComponent={
                  <VictoryLabel
                    dx={({ datum }: { datum?: Datum }) => datum?.dx ?? 0}
                    dy={({ datum }: { datum?: Datum }) => datum?.dy ?? -12}
                    textAnchor={({ datum }: { datum?: Datum }) => datum?.anchor ?? "middle"}
                  />
                }
                style={{
                  data: { fill: "transparent" },
                  labels: { fontFamily: fonts.sans400, fontSize: 10, fill: t.text.dim },
                }}
              />
            )}
          </VictoryChart>
        )}
      </View>
      <View style={styles.legend}>
        {legendItems.map((it) => (
          <View key={it.key} style={styles.legendItem}>
            <View style={[styles.key, { backgroundColor: t.quadrant[it.key] }]} />
            <Text style={[styles.legendText, { color: t.text.secondary }]}>{it.text}</Text>
          </View>
        ))}
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
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 2, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
  key: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: fonts.sans400, fontSize: 11 },
});
