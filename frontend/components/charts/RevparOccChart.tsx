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
import { PropertyCalc } from "../../lib/revparEngine";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { formatCurrency, formatPercent } from "./format";
import { truncateLabel, wrapLabel } from "./rows";
import { axisScale, tickLabel } from "./scale";

export type RevparOccChartProps = {
  /** Already sorted; first row leftmost. */
  rows: PropertyCalc[];
  /** Portfolio RevPAR, dashed reference line on the left axis. */
  target: number;
};

const PAD = { top: 10, bottom: 34, left: 58, right: 58 };
const NARROW_PAD = { left: 64, right: 48, bottom: 88 };
const NARROW_W = 360;
const NARROW_TICK_ANGLE = -60;
const NARROW_LABEL_CHARS = 16; // single rotated line, ellipsised beyond this
const MAX_LABEL_LINES = 3;
const LINE_H = 12;
const MAX_LABEL_CHARS = 14;
const X_CHAR_W = 5.6; // sans 10px average advance
const PLOT_H = 220;
const GAP = 8;
const MAX_BAR_W = 28;
// Both axes share one grid; 4 or 5 intervals, whichever wastes less headroom above the tallest bar.
const INTERVAL_OPTIONS = [4, 5];

const TIER_TEXT: Record<PropertyCalc["tier"], string> = {
  above: "Above target",
  below: "Below target",
  critical: "Critical (<85% of target)",
};

type BarDatum = { x: number; y: number; y0: number; i: number; tier: PropertyCalc["tier"] };

/** RevPAR bars on the left $ axis, occupancy line on a fixed 0-100 % right axis, one shared 0..100 grid. */
export function RevparOccChart({ rows, target }: RevparOccChartProps) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const n = rows.length;
  const narrow = width > 0 && width < NARROW_W;
  const basePad = narrow ? { ...PAD, ...NARROW_PAD } : PAD;
  const plotW = Math.max(0, width - basePad.left - basePad.right);
  // Not the occupancy KPI pink: it is near-identical to the critical tier in both themes.
  const lineColor = t.kpi.adr.line;

  const revValues = [target, ...rows.map((r) => r.revpar)];
  const { scale: bs, intervals } = INTERVAL_OPTIONS.map((k) => ({ scale: axisScale(revValues, k), intervals: k }))
    .reduce((best, cur) => (cur.scale.hi < best.scale.hi ? cur : best));
  const ticks = Array.from({ length: intervals + 1 }, (_, i) => (i * 100) / intervals);
  const norm = (v: number) => ((v - bs.lo) / (bs.hi - bs.lo)) * 100;
  const denorm = (y: number) => bs.lo + (y / 100) * (bs.hi - bs.lo);

  // y0 anchors bars at the zero line; without it Victory draws them from the plot floor.
  const zeroY = norm(0);
  const bars: BarDatum[] = rows.map((r, i) => ({ x: i + 1, y: norm(r.revpar), y0: zeroY, i, tier: r.tier }));
  const dots = rows.map((r, i) => ({ x: i + 1, y: r.occupancy * 100 }));
  const targetData = [
    { x: 0.5, y: norm(target) },
    { x: n + 0.5, y: norm(target) },
  ];
  const barWidth = n > 0 ? Math.max(1, Math.min(MAX_BAR_W, (plotW - GAP * (n - 1)) / n)) : 1;
  const slotChars = n > 0 ? Math.floor(plotW / n / X_CHAR_W) : MAX_LABEL_CHARS;
  // Narrow: one steeply rotated line per label (wrapped multi-line labels pile up at ~20px pitch).
  const names = rows.map((r) =>
    narrow
      ? truncateLabel(r.name, NARROW_LABEL_CHARS)
      : wrapLabel(r.name, Math.max(6, Math.min(MAX_LABEL_CHARS, slotChars)), MAX_LABEL_LINES),
  );
  const lines = Math.max(1, ...names.map((s) => s.split("\n").length));
  const pad = { ...basePad, bottom: basePad.bottom + (lines - 1) * LINE_H };
  const height = PLOT_H + pad.top + pad.bottom;
  const tickLabels = { fontFamily: fonts.mono400, fontSize: 10, fill: t.text.tick, padding: 6 };

  const legend: { color: string; text: string; kind: "swatch" | "dash" | "line" }[] = [
    { color: t.tier.above, text: "RevPAR above target", kind: "swatch" },
    { color: t.tier.below, text: "RevPAR below target", kind: "swatch" },
    { color: t.tier.critical, text: "RevPAR critical (<85% of target)", kind: "swatch" },
    { color: t.text.secondary, text: `Portfolio target ${formatCurrency(target)}`, kind: "dash" },
    { color: lineColor, text: "Occupancy (right axis)", kind: "line" },
  ];

  return (
    <Card style={styles.card}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && n > 0 && (
          <VictoryChart
            width={width}
            height={height}
            padding={pad}
            domain={{ x: [0.5, n + 0.5], y: [0, 100] }}
            domainPadding={0}
            containerComponent={
              <VictoryVoronoiContainer
                voronoiDimension="x"
                voronoiBlacklist={["line", "line-halo", "dots", "target"]}
              />
            }
          >
            <VictoryAxis
              dependentAxis
              tickValues={ticks}
              tickFormat={(v: number) => tickLabel(denorm(v), "currency")}
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
              tickValues={ticks}
              tickFormat={(v: number) => `${Math.round(v)}%`}
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
                const r = rows[(datum as BarDatum).i];
                return r
                  ? [
                      r.name,
                      `RevPAR ${formatCurrency(r.revpar)}`,
                      `Occupancy ${formatPercent(r.occupancy * 100)}`,
                      TIER_TEXT[r.tier],
                    ]
                  : "";
              }}
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
                  fill: ({ datum }: { datum?: BarDatum }) => (datum ? t.tier[datum.tier] : t.tier.below),
                  fillOpacity: ({ active }: { active?: boolean }) => (active ? 0.8 : 1),
                },
              }}
            />
            <VictoryLine
              name="target"
              data={targetData}
              style={{ data: { stroke: t.text.primary, strokeWidth: 1, strokeDasharray: "4,3" } }}
            />
            {/* Card-colour halo keeps the line readable where it crosses bars of similar brightness. */}
            <VictoryLine
              name="line-halo"
              interpolation="linear"
              data={dots}
              style={{
                data: { stroke: t.bg.card, strokeWidth: 5.5, strokeLinejoin: "round", strokeLinecap: "round" },
              }}
            />
            <VictoryLine
              name="line"
              interpolation="linear"
              data={dots}
              style={{
                data: { stroke: lineColor, strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" },
              }}
            />
            <VictoryScatter
              name="dots"
              data={dots}
              size={3.5}
              style={{ data: { fill: lineColor, stroke: t.bg.card, strokeWidth: 1.5 } }}
            />
            <VictoryAxis
              tickValues={rows.map((_, i) => i + 1)}
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
                tickLabels: { fontFamily: fonts.sans400, fontSize: 10, fill: t.text.dim, padding: 6 },
              }}
            />
          </VictoryChart>
        )}
      </View>
      <View style={styles.legend}>
        {legend.map((l) => (
          <View key={l.text} style={styles.legendItem}>
            <View
              style={
                l.kind === "dash"
                  ? [styles.dash, { borderTopColor: l.color }]
                  : l.kind === "line"
                    ? [styles.lineKey, { backgroundColor: l.color }]
                    : [styles.swatch, { backgroundColor: l.color }]
              }
            />
            <Text style={[styles.legendText, { color: t.text.secondary }]}>{l.text}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 2, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  lineKey: { width: 16, height: 3, borderRadius: 2 },
  dash: { width: 14, height: 0, borderTopWidth: 2, borderStyle: "dashed" },
  legendText: { fontFamily: fonts.sans400, fontSize: 11 },
});
