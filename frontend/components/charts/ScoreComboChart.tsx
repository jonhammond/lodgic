import { useMemo, useState } from "react";
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
import type { ComboSeries } from "../../lib/resultMapping";
import { fonts, tabular } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { wrapLabel } from "./rows";
import { formatNumber, formatPercent } from "./format";
import { niceCeil } from "./scale";

// Left gutter fits "100% (5.0)" in mono 10px; bottom fits two wrapped label lines.
const PAD = { top: 10, bottom: 34, left: 66, right: 40 };
const NARROW_W = 360;
const NARROW_PAD = { left: 58, right: 34 };
const PLOT_H = 200;
const GAP = 8;
const MAX_BAR_W = 28;
const PCT_TICKS = [0, 20, 40, 60, 80, 100];
const X_TICK_FONT = { fontFamily: fonts.sans400, fontSize: 10 };
const X_CHAR_W = 5.6; // sans 10px average advance
const MAX_LABEL_CHARS = 14;

type BarDatum = { x: number; y: number; raw: number; score: number };

/** CSAT as percent-of-5 bars on the left axis with the NPS score as a line on the right. */
export function ScoreComboChart({ series }: { series: ComboSeries }) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const { labels, bar, line } = series;
  const n = labels.length;
  const narrow = width > 0 && width < NARROW_W;
  const pad = narrow ? { ...PAD, ...NARROW_PAD } : PAD;
  const plotW = Math.max(0, width - pad.left - pad.right);
  const height = PLOT_H + pad.top + pad.bottom;
  const barColor = t.kpi[bar.color];
  const lineColor = t.kpi[line.color].line;

  // Both axes share Victory's y domain (0..100, the CSAT percent scale); the NPS line is
  // mapped onto the same five gridlines with a round step that keeps zero on a gridline.
  const { nLo, nHi } = useMemo(() => {
    const min = Math.min(0, ...line.values);
    const max = Math.max(0, ...line.values);
    const rough = niceCeil((max - min) / 5);
    const lo = Math.min(0, Math.floor(min / rough) * rough);
    const step = niceCeil((max - lo) / 5);
    return { nLo: lo, nHi: lo + step * 5 };
  }, [line.values]);
  const toY = (v: number) => ((v - nLo) / (nHi - nLo)) * 100;
  const fromY = (y: number) => nLo + (y / 100) * (nHi - nLo);

  const bars: BarDatum[] = bar.values.map((y, i) => ({
    x: i + 1,
    y: Math.min(100, Math.max(0, y)),
    raw: bar.raw[i] ?? 0,
    score: line.values[i] ?? 0,
  }));
  const dots = line.values.map((v, i) => ({ x: i + 1, y: toY(v) }));
  const barWidth = n > 0 ? Math.max(1, Math.min(MAX_BAR_W, (plotW - GAP * (n - 1)) / n)) : 1;
  // Wrap each label to its slot: ~5.6px per sans-10 char, two lines max (wrapLabel).
  const slotChars = n > 0 ? Math.floor(plotW / n / X_CHAR_W) : MAX_LABEL_CHARS;
  const names = labels.map((l) => wrapLabel(l ?? "", Math.max(6, Math.min(MAX_LABEL_CHARS, slotChars))));
  const tickLabels = { fontFamily: fonts.mono400, fontSize: 10, fill: t.text.tick, padding: 6 };

  const tooltipText = ({ x, y, raw, score }: BarDatum): string[] => [
    labels[x - 1] ?? "",
    `${bar.label} ${formatPercent(y, 0)} (${raw.toFixed(1)})`,
    `${line.label} ${formatNumber(score)}`,
  ];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]} numberOfLines={1}>
          {series.title}
        </Text>
        <Text style={[styles.note, { color: t.text.subtle }]}>
          {`% of 5-point ${bar.label} · ${line.label} -100..100`}
        </Text>
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
              <VictoryVoronoiContainer voronoiDimension="x" voronoiBlacklist={["line", "dots"]} />
            }
          >
            <VictoryAxis
              dependentAxis
              tickValues={PCT_TICKS}
              tickFormat={(v: number) => `${v}% (${(v / 20).toFixed(1)})`}
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
              tickValues={PCT_TICKS}
              tickFormat={(v: number) => formatNumber(Math.round(fromY(v)))}
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
                  fill: ({ active }: { active?: boolean }) => (active ? barColor.line : barColor.bar),
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
              style={{ data: { fill: lineColor, stroke: t.bg.card, strokeWidth: 1.5 } }}
            />
            <VictoryAxis
              tickValues={labels.map((_, i) => i + 1)}
              tickFormat={(i: number) => names[i - 1] ?? ""}
              tickLabelComponent={<VictoryLabel lineHeight={1.15} />}
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
          <View style={[styles.barKey, { backgroundColor: barColor.bar }]} />
          <Text style={[styles.legendText, { color: t.text.secondary }]}>
            {`${bar.label} % (left axis)`}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.lineKey, { backgroundColor: lineColor }]} />
          <Text style={[styles.legendText, { color: t.text.secondary }]}>
            {`${line.label} score (right axis)`}
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
