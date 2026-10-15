import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { VictoryAxis, VictoryBar, VictoryChart, VictoryLabel } from "victory";
import { formatByUnit, MetricSeries } from "../../lib/resultMapping";
import { fonts, tabular } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { niceCeil, tickLabel } from "./scale";

const ROW_H = 26;
const MAX_LABEL = 18;
const PAD = { top: 6, bottom: 22, left: 124, right: 56 };
const NARROW_W = 360;
const PAD_NARROW = { ...PAD, left: 96, right: 52 };
const LABEL_FONT = { fontFamily: fonts.sans400, fontSize: 11 };

const clamp = (s: string) => (s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s);

export function CategoryBarChart({ series }: { series: MetricSeries }) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const { values, labels, color, unit } = series;
  const n = values.length;
  const max = niceCeil(Math.max(0, ...values));
  const pad = width > 0 && width < NARROW_W ? PAD_NARROW : PAD;
  const height = n * ROW_H + pad.top + pad.bottom;
  const barColors = t.kpi[color];
  // Victory draws x=1 at the bottom of a horizontal chart; invert so row 0 is on top.
  const data = values.map((y, i) => ({ x: n - i, y }));

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]}>{series.title}</Text>
        <Text style={[styles.note, { color: t.text.subtle }]}>{series.note}</Text>
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
              tickValues={data.map((d) => d.x)}
              tickFormat={(x: number) => clamp(labels[n - x] ?? "")}
              style={{
                axis: { stroke: "transparent" },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...LABEL_FONT, fill: t.text.dim, padding: 6 },
              }}
            />
            <VictoryAxis
              dependentAxis
              tickValues={[0, max / 2, max]}
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
                    Number(index) === 2 ? "end" : Number(index) === 0 ? "start" : "middle",
                },
              }}
            />
            <VictoryBar
              data={data}
              barWidth={ROW_H - 10}
              cornerRadius={0}
              labels={({ datum }) => formatByUnit(datum.y, unit)}
              labelComponent={<VictoryLabel dx={4} textAnchor="start" />}
              style={{
                data: {
                  fill: ({ index }: { index?: number | string }) =>
                    Number(index) === 0 ? barColors.line : barColors.bar,
                },
                labels: {
                  fontFamily: fonts.mono400,
                  fontSize: 10,
                  fill: t.text.primary,
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
