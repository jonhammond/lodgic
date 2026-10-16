import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryLabel,
  VictoryStack,
  VictoryTooltip,
} from "victory";
import { mix } from "../../lib/color";
import { formatByUnit } from "../../lib/resultMapping";
import type { StackedSeries } from "../../lib/explicitCharts";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { NARROW_W } from "./CategoryBarChart";
import { BAR_W, LABEL_FONT, NARROW, ROW_H, ROW_H_WRAPPED, WIDE, wrapLabel } from "./rows";
import { niceDomain, tickLabel } from "./scale";

const HORIZONTAL_ABOVE = 6; // more categories than this lay out as rows
const PLOT_H = 220;
const MAX_COL_W = 36;
const X_CHAR_W = 5.6; // sans 10px average advance
// Same light-mode lightness offset as GroupedBarChart: adjacent hues need more than hue to separate.
const LIGHTNESS_STEP = 0.22;

type Datum = { x: number; y: number; i: number };

/** Part-to-whole bars per category: vertical columns for few categories, horizontal rows otherwise. */
export function StackedBarChart({ series }: { series: StackedSeries }) {
  const { t, scheme } = useTheme();
  const [width, setWidth] = useState(0);
  const { labels, parts, unit } = series;
  const n = labels.length;
  const narrow = width > 0 && width < NARROW_W;
  const horizontal = n > HORIZONTAL_ABOVE || narrow;
  const fillOf = (i: number) => {
    const base = t.kpi[parts[i].color].bar;
    if (i === 0 || scheme === "dark") return base;
    return mix(base, "#000000", LIGHTNESS_STEP * i);
  };
  const totals = labels.map((_, i) => parts.reduce((s, p) => s + (p.values[i] ?? 0), 0));
  const hiRaw = Math.max(0, ...labels.map((_, i) => parts.reduce((s, p) => s + Math.max(0, p.values[i] ?? 0), 0)));
  const loRaw = Math.min(0, ...labels.map((_, i) => parts.reduce((s, p) => s + Math.min(0, p.values[i] ?? 0), 0)));
  const domain = niceDomain(loRaw, hiRaw, 4);
  const ticks = horizontal && narrow ? [domain.lo, domain.hi] : domain.ticks;
  const tickStyle = { fontFamily: fonts.mono400, fontSize: 10, fill: t.text.tick, padding: 6 };

  // Horizontal: row 0 on top (Victory draws x=1 at the bottom of a horizontal chart).
  const xOf = (i: number) => (horizontal ? n - i : i + 1);
  const layout = narrow ? NARROW : WIDE;
  const hNames = labels.map((l) => wrapLabel(l ?? "", layout.chars));
  const rowH = hNames.some((s) => s.includes("\n")) ? ROW_H_WRAPPED : ROW_H;
  const pad = horizontal
    ? { top: 6, bottom: 22, left: layout.left, right: 16 }
    : { top: 10, bottom: 34, left: 56, right: 12 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const height = horizontal ? n * rowH + pad.top + pad.bottom : PLOT_H + pad.top + pad.bottom;
  const slotChars = n > 0 ? Math.max(6, Math.min(14, Math.floor(plotW / n / X_CHAR_W))) : 14;
  const vNames = labels.map((l) => wrapLabel(l ?? "", slotChars));
  const barWidth = horizontal
    ? BAR_W
    : Math.max(1, Math.min(MAX_COL_W, (plotW - 8 * (n - 1)) / Math.max(1, n)));

  const tooltip = (
    <VictoryTooltip
      constrainToVisibleArea
      pointerLength={4}
      cornerRadius={0}
      flyoutPadding={{ top: 4, bottom: 4, left: 8, right: 8 }}
      flyoutStyle={{ fill: t.bg.panel, stroke: t.border.strong, strokeWidth: 1 }}
      style={{ fontFamily: fonts.mono400, fontSize: 10, fill: t.text.primary }}
    />
  );

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]}>{series.title}</Text>
      </View>
      <View style={styles.legend}>
        {parts.map((p, i) => (
          <View key={p.key} style={styles.legendItem}>
            <View style={[styles.legendKey, { backgroundColor: fillOf(i) }]} />
            <Text style={[styles.legendText, { color: t.text.secondary }]}>{p.title}</Text>
          </View>
        ))}
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && n > 0 && (
          <VictoryChart
            horizontal={horizontal}
            width={width}
            height={height}
            padding={pad}
            domain={{ x: [0.5, n + 0.5], y: [domain.lo, domain.hi] }}
            domainPadding={0}
          >
            <VictoryAxis
              tickValues={labels.map((_, i) => xOf(i))}
              tickFormat={(x: number) => (horizontal ? hNames[n - x] : vNames[x - 1]) ?? ""}
              tickLabelComponent={<VictoryLabel lineHeight={1.15} />}
              style={{
                axis: horizontal
                  ? { stroke: "transparent" }
                  : { stroke: t.border.axis, strokeWidth: 1 },
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
                axis: horizontal ? { stroke: t.border.axis, strokeWidth: 1 } : { stroke: "transparent" },
                grid: horizontal
                  ? { stroke: "none" }
                  : { stroke: t.border.axis, strokeWidth: 1, strokeDasharray: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: {
                  ...tickStyle,
                  textAnchor: horizontal
                    ? ({ index }: { index?: number | string }) =>
                        Number(index) === ticks.length - 1 ? "end" : Number(index) === 0 ? "start" : "middle"
                    : "end",
                },
              }}
            />
            <VictoryStack>
              {parts.map((p, pi) => (
                <VictoryBar
                  key={p.key}
                  data={labels.map(
                    (_, i): Datum => ({ x: xOf(i), y: p.values[i] ?? 0, i }),
                  )}
                  barWidth={barWidth}
                  labels={({ datum }) => [
                    labels[(datum as Datum).i] ?? "",
                    `${p.title} ${formatByUnit((datum as Datum).y, unit)}`,
                    `Total ${formatByUnit(totals[(datum as Datum).i] ?? 0, unit)}`,
                  ]}
                  labelComponent={tooltip}
                  style={{ data: { fill: fillOf(pi), stroke: t.bg.card, strokeWidth: 1 } }}
                />
              ))}
            </VictoryStack>
          </VictoryChart>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14 },
  header: { marginBottom: 8 },
  title: { fontFamily: fonts.sans700, fontSize: 13 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 2, marginBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendKey: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontFamily: fonts.sans400, fontSize: 11 },
});
