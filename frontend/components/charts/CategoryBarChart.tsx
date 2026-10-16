import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { VictoryAxis, VictoryBar, VictoryChart, VictoryLabel } from "victory";
import { barRamp, denseRankDesc } from "../../lib/color";
import { formatByUnit, formatExact, isAdditiveKey, MetricSeries } from "../../lib/resultMapping";
import { fonts, tabular } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { BAR_W, LABEL_FONT, NARROW, ROW_H, ROW_H_WRAPPED, VALUE_CHAR_W, WIDE, wrapLabel } from "./rows";
import { niceDomain, tickLabel } from "./scale";

export const NARROW_W = 360;

export function CategoryBarChart({ series }: { series: MetricSeries }) {
  const { t, scheme } = useTheme();
  const [width, setWidth] = useState(0);
  const { values, labels, color, unit } = series;
  const n = values.length;
  // Hug the data: the longest bar reaches ~the last tick instead of a coarse 1/2/5 ceiling.
  const domain = niceDomain(0, Math.max(0, ...values), 4);
  const max = domain.hi;
  // Narrow tracks only have room for the end-point ticks.
  const narrow = width > 0 && width < NARROW_W;
  const ticks = narrow ? [0, max] : domain.ticks;
  const layout = narrow ? NARROW : WIDE;
  const names = labels.map((l) => wrapLabel(l ?? "", layout.chars));
  const wrapped = names.some((s) => s.includes("\n"));
  const rowH = wrapped ? ROW_H_WRAPPED : ROW_H;
  // Wide layouts stand in for the table: exact values. Narrow keeps compact labels so the track stays usable.
  const fmt = narrow ? formatByUnit : formatExact;
  const valueText = values.map((v) => fmt(v, unit));
  const total = isAdditiveKey(series.key) ? values.reduce((a, b) => a + b, 0) : null;
  const note = total === null ? series.note : `Total ${formatExact(total, unit)} \u00b7 ${series.note}`;
  // Reserve the right gutter for the widest value label so the longest bar never runs under it.
  const valueW = Math.max(0, ...valueText.map((s) => s.length)) * VALUE_CHAR_W + 12;
  const pad = { top: 6, bottom: 22, left: layout.left, right: Math.ceil(valueW) };
  const height = n * rowH + pad.top + pad.bottom;
  const hue = t.kpi[color].bar;
  // Ranked single-hue ramp: deepest shade for the largest value, ties share a shade. Shade follows magnitude,
  // not row position, so an unsorted result still reads correctly.
  const ranks = denseRankDesc(values);
  const ramp = barRamp(hue, t.bg.card, scheme, ranks.length ? Math.max(...ranks) + 1 : 0);
  // Victory draws x=1 at the bottom of a horizontal chart; invert so row 0 is on top.
  const data = values.map((y, i) => ({ x: n - i, y, fill: ramp[ranks[i]] }));

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]}>{series.title}</Text>
        <Text style={[styles.note, { color: t.text.subtle }]}>{note}</Text>
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
                    Number(index) === ticks.length - 1 ? "end" : Number(index) === 0 ? "start" : "middle",
                },
              }}
            />
            <VictoryBar
              data={data}
              barWidth={BAR_W}
              cornerRadius={{ top: 2 }}
              labels={({ datum }) => fmt(datum.y, unit)}
              labelComponent={<VictoryLabel dx={4} textAnchor="start" />}
              style={{
                data: {
                  fill: ({ datum }: { datum?: { fill?: string } }) => datum?.fill ?? hue,
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
