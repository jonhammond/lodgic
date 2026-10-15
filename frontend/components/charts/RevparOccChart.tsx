import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryContainer,
  VictoryLabel,
  VictoryLine,
} from "victory";
import { PropertyCalc } from "../../lib/revparEngine";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { formatCurrency, formatPercent } from "./format";
import {
  BAR_W,
  LABEL_FONT,
  NARROW,
  ROW_H,
  ROW_H_WRAPPED,
  VALUE_CHAR_W,
  WIDE,
  wrapLabel,
} from "./rows";
import { niceDomain, tickLabel } from "./scale";

export type RevparOccChartProps = {
  /** Already sorted; top row first. */
  rows: PropertyCalc[];
  /** Portfolio RevPAR, dashed reference line in the RevPAR panel. */
  target: number;
};

const STACK_W = 480;
const SPLIT = 0.55;
const LABEL_PAD = 12;
const RIGHT_PAD_OCC = 52 + Math.round(VALUE_CHAR_W * 4); // "100.0%" label plus tick margin

export function RevparOccChart({ rows, target }: RevparOccChartProps) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const n = rows.length;
  const stacked = width > 0 && width < STACK_W;
  const layout = width > 0 && width < 360 ? NARROW : WIDE;
  const names = rows.map((r) => wrapLabel(r.name, layout.chars));
  const rowH = names.some((s) => s.includes("\n")) ? ROW_H_WRAPPED : ROW_H;
  const pad = { top: 6, bottom: 22 };
  const height = n * rowH + pad.top + pad.bottom;
  const revDomain = niceDomain(
    0,
    Math.max(0, target, ...rows.map((r) => r.revpar)),
    4,
  );
  const revText = rows.map((r) => formatCurrency(r.revpar));
  const revRight = Math.ceil(
    Math.max(0, ...revText.map((s) => s.length)) * VALUE_CHAR_W + LABEL_PAD,
  );
  // Victory draws x=1 at the bottom of a horizontal chart; invert so row 0 is on top.
  const x = (i: number) => n - i;
  const revData = rows.map((r, i) => ({ x: x(i), y: r.revpar, tier: r.tier }));
  const occData = rows.map((r, i) => ({ x: x(i), y: r.occupancy }));
  const targetData = [
    { x: 0.5, y: target },
    { x: n + 0.5, y: target },
  ];

  const revW = stacked
    ? width
    : layout.left + Math.round((width - layout.left) * SPLIT);
  const occW = stacked ? width : width - revW;
  const occLeft = stacked ? layout.left : 8;

  const nameAxis = (
    <VictoryAxis
      tickValues={rows.map((_, i) => x(i))}
      tickFormat={(v: number) => names[n - v] ?? ""}
      tickLabelComponent={<VictoryLabel lineHeight={1.15} />}
      style={{
        axis: { stroke: "transparent" },
        grid: { stroke: "none" },
        ticks: { stroke: "transparent" },
        tickLabels: { ...LABEL_FONT, fill: t.text.dim, padding: 6 },
      }}
    />
  );
  const valueAxis = (ticks: number[], format: (v: number) => string) => (
    <VictoryAxis
      dependentAxis
      tickValues={ticks}
      tickFormat={format}
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
  );
  const labelStyle = {
    fontFamily: fonts.mono400,
    fontSize: 10,
    fill: t.text.primary,
    stroke: t.bg.card,
    strokeWidth: 3,
    paintOrder: "stroke",
  };

  const legend: { color: string; text: string }[] = [
    { color: t.tier.above, text: "Above target" },
    { color: t.tier.below, text: "Below target" },
    { color: t.tier.critical, text: "Critical (<85% of target)" },
  ];

  return (
    <Card style={styles.card}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={stacked ? undefined : styles.panels}
      >
        {width > 0 && n > 0 && (
          <>
            <VictoryChart
              horizontal
              width={revW}
              height={height}
              padding={{ ...pad, left: layout.left, right: revRight }}
              domain={{ x: [0.5, n + 0.5], y: [0, revDomain.hi] }}
              domainPadding={0}
              containerComponent={<VictoryContainer responsive={false} />}
            >
              {nameAxis}
              {valueAxis(stacked ? [0, revDomain.hi] : revDomain.ticks, (v) =>
                tickLabel(v, "currency"),
              )}
              <VictoryLine
                data={targetData}
                style={{
                  data: {
                    stroke: t.text.primary,
                    strokeWidth: 1,
                    strokeDasharray: "4,3",
                  },
                }}
              />
              <VictoryBar
                data={revData}
                barWidth={BAR_W}
                cornerRadius={{ top: 2 }}
                labels={({ datum }) => formatCurrency(datum.y)}
                labelComponent={<VictoryLabel dx={4} textAnchor="start" />}
                style={{
                  data: {
                    fill: ({
                      datum,
                    }: {
                      datum?: { tier: PropertyCalc["tier"] };
                    }) => (datum ? t.tier[datum.tier] : t.tier.below),
                  },
                  labels: labelStyle,
                }}
              />
            </VictoryChart>
            <VictoryChart
              horizontal
              width={occW}
              height={height}
              padding={{ ...pad, left: occLeft, right: RIGHT_PAD_OCC }}
              domain={{ x: [0.5, n + 0.5], y: [0, 1] }}
              domainPadding={0}
              containerComponent={<VictoryContainer responsive={false} />}
            >
              {stacked ? (
                nameAxis
              ) : (
                <VictoryAxis
                  tickValues={rows.map((_, i) => x(i))}
                  tickFormat={() => ""}
                  style={{
                    axis: { stroke: "transparent" },
                    ticks: { stroke: "transparent" },
                    grid: { stroke: "none" },
                  }}
                />
              )}
              {valueAxis(
                stacked ? [0, 1] : [0, 0.5, 1],
                (v) => `${Math.round(v * 100)}%`,
              )}
              <VictoryBar
                data={occData}
                barWidth={BAR_W}
                cornerRadius={{ top: 2 }}
                labels={({ datum }) => formatPercent(datum.y * 100)}
                labelComponent={<VictoryLabel dx={4} textAnchor="start" />}
                style={{
                  data: { fill: t.trend.volumeSolid },
                  labels: labelStyle,
                }}
              />
            </VictoryChart>
          </>
        )}
      </View>
      <View style={styles.legend}>
        {legend.map((l) => (
          <View key={l.text} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: l.color }]} />
            <Text style={[styles.legendText, { color: t.text.secondary }]}>
              {l.text}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14 },
  panels: { flexDirection: "row" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontFamily: fonts.sans400, fontSize: 11 },
});
