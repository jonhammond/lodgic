import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryTooltip,
  VictoryVoronoiContainer,
} from "victory";
import { formatByUnit, MetricSeries } from "../../lib/resultMapping";
import { fonts, tabular } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { niceCeil, tickLabel } from "./scale";
import { pickTickValues } from "./ticks";

const PLOT_H = 140;
const PAD = { top: 6, bottom: 22, left: 48, right: 0 };

const HEIGHT = PLOT_H + PAD.top + PAD.bottom;
const GAP = 5;
const X_TICK_FONT = { fontFamily: fonts.sans400, fontSize: 10 };

export function MetricBarChart({ series }: { series: MetricSeries }) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const { values, labels, color, partialLast, projection, unit } = series;
  const n = values.length;
  const max = niceCeil(Math.max(0, ...values, projection ?? 0));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const barWidth = n > 0 ? Math.max(1, (plotW - GAP * (n - 1)) / n) : 1;
  const barColors = t.kpi[color];
  const xTicks = pickTickValues(labels, plotW, X_TICK_FONT);
  const tickLabels = {
    fontFamily: fonts.mono400,
    fontSize: 10,
    fill: t.text.tick,
    padding: 6,
  };
  // Full (unabbreviated) value on hover; the partial last bucket also shows its projection.
  const tooltipText = ({ x, y }: { x: number; y: number }): string | string[] => {
    const line = `${labels[x - 1] ?? ""}: ${formatByUnit(y, unit)}`;
    return projection != null && x === n ? [line, `proj ${formatByUnit(projection, unit)}`] : line;
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]}>{series.title}</Text>
        <Text style={[styles.note, { color: t.text.subtle }]}>{series.note}</Text>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && n > 0 && (
          <VictoryChart
            width={width}
            height={HEIGHT}
            padding={PAD}
            domain={{ x: [0.5, n + 0.5], y: [0, max] }}
            domainPadding={0}
            containerComponent={
              <VictoryVoronoiContainer voronoiDimension="x" voronoiBlacklist={["projection"]} />
            }
          >
            <VictoryAxis
              dependentAxis
              tickValues={[0, max / 2, max]}
              tickFormat={(v: number) => tickLabel(v, unit)}
              style={{
                axis: { stroke: "transparent" },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...tickLabels, textAnchor: "end" },
              }}
            />
            <VictoryBar
              data={values.map((y, i) => ({ x: i + 1, y }))}
              barWidth={barWidth}
              cornerRadius={0}
              labels={({ datum }) => tooltipText(datum)}
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
                  fill: ({ index, active }: { index?: number | string; active?: boolean }) =>
                    active
                      ? barColors.line
                      : partialLast && Number(index) === n - 1
                        ? barColors.barPartial
                        : barColors.bar,
                },
              }}
            />
            {projection != null && (
              <VictoryBar
                name="projection"
                data={[{ x: n, y: projection }]}
                barWidth={barWidth}
                cornerRadius={0}
                style={{
                  data: {
                    fill: "transparent",
                    stroke: barColors.bar,
                    strokeDasharray: "3,3",
                    strokeWidth: 1,
                  },
                }}
              />
            )}
            <VictoryAxis
              tickValues={xTicks}
              tickFormat={(i: number) => labels[i - 1] ?? ""}
              style={{
                axis: { stroke: t.border.axis, strokeWidth: 1 },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: {
                  ...X_TICK_FONT,
                  fill: t.text.dim,
                  padding: 6,
                  // Keep the edge labels inside the plot: the last bar sits flush
                  // against the right edge (PAD.right = 0), so anchor its label there.
                  textAnchor: ({ index }: { index?: number | string }) =>
                    Number(index) === xTicks.length - 1
                      ? "end"
                      : Number(index) === 0 && xTicks[0] === 1
                        ? "start"
                        : "middle",
                },
              }}
            />
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
    marginBottom: 14,
  },
  title: { fontFamily: fonts.sans700, fontSize: 13 },
  note: { fontFamily: fonts.mono400, fontSize: 11, ...tabular },
});
