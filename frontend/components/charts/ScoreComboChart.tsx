import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType } from "react-native";
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
import { barRamp } from "../../lib/color";
import type { ComboSeries } from "../../lib/resultMapping";
import { fonts, tabular } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { wrapLabel } from "./rows";
import { formatNumber, formatPercent } from "./format";
import { niceCeil } from "./scale";
import { axisGutter } from "./ticks";
import { chartType, isCompact, type ChartType } from "./typography";

const PAD_TOP = 10;
const SELECTABLE_BOTTOM = 10;
// Compact: x ticks rotate 35° on one line, so the bottom gutter grows to fit the slanted text.
const NARROW_TICK_ANGLE = -35;
const NARROW_MAX_CHARS = 16;
const DIM_OPACITY = 0.7; // non-selected bars; keeps >=3:1 against the dark card
const PLOT_H = 200;
const GAP = 8;
const MAX_BAR_W = 28;
const PCT_TICKS = [0, 20, 40, 60, 80, 100];
const MAX_LABEL_CHARS = 14; // axis labels only; the selectable row wraps to its slot

type BarDatum = { x: number; y: number; raw: number; score: number };

type Props = {
  series: ComboSeries;
  selectedIndex?: number | null;
  /** When set, bars and the category label row become selectable controls. */
  onSelect?: (i: number) => void;
  /** Replaces the default header note. */
  note?: string;
  /** Rendered inside the card below the chart and label row. */
  footer?: ReactNode;
};

/** CSAT as percent-of-5 bars on the left axis with the NPS score as a line on the right. */
export function ScoreComboChart({ series, selectedIndex = null, onSelect, note, footer }: Props) {
  const { t, scheme } = useTheme();
  const [width, setWidth] = useState(0);
  const { labels, bar, line } = series;
  const n = labels.length;
  const ty = chartType(width);
  const narrow = isCompact(width);
  const selectable = onSelect != null;
  const barColor = t.kpi[bar.color];
  const lineColor = t.kpi[line.color].line;
  // Positional ramp: deepest shade on the left. barRamp orders deep→faint where "deep" is brighter on a dark
  // card, so reverse there to keep the darker shade on the left in both schemes.
  const shades = useMemo(() => {
    if (!bar.ramp) return null;
    const ramp = barRamp(barColor.bar, t.bg.card, scheme, n);
    return scheme === "dark" ? ramp.reverse() : ramp;
  }, [bar.ramp, barColor.bar, t.bg.card, scheme, n]);
  const fillFor = (i: number, active: boolean) =>
    shades ? (shades[i] ?? barColor.bar) : active ? barColor.line : barColor.bar;

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

  const gutterL = axisGutter(
    PCT_TICKS.map((v) => `${v}% (${(v / 20).toFixed(1)})`),
    ty.tickFont,
  );
  const gutterR = axisGutter(
    PCT_TICKS.map((v) => formatNumber(Math.round(fromY(v)))),
    ty.tickFont,
  );
  const bottom = selectable
    ? SELECTABLE_BOTTOM
    : narrow
      ? Math.ceil(NARROW_MAX_CHARS * ty.sansAdvance * Math.sin((-NARROW_TICK_ANGLE * Math.PI) / 180)) + 10
      : ty.label + 24;
  const pad = { top: PAD_TOP, bottom, left: gutterL, right: gutterR };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const height = PLOT_H + pad.top + pad.bottom;

  const bars: BarDatum[] = bar.values.map((y, i) => ({
    x: i + 1,
    y: Math.min(100, Math.max(0, y)),
    raw: bar.raw[i] ?? 0,
    score: line.values[i] ?? 0,
  }));
  const dots = line.values.map((v, i) => ({ x: i + 1, y: toY(v) }));
  const barWidth = n > 0 ? Math.max(1, Math.min(MAX_BAR_W, (plotW - GAP * (n - 1)) / n)) : 1;
  // Wrap each label to its slot by the sans advance. The selectable label row never
  // truncates: it wraps the full name to as many lines as the slot needs. The axis path (no
  // onSelect) keeps two lines wide and rotated single-line labels narrow.
  const slotChars = n > 0 ? Math.floor(plotW / n / ty.sansAdvance) - 1 : MAX_LABEL_CHARS;
  const names = selectable
    ? labels.map((l) => wrapLabel(l ?? "", Math.max(6, slotChars), Infinity))
    : labels.map((l) => wrapLabel(l ?? "", Math.max(6, Math.min(MAX_LABEL_CHARS, slotChars))));
  const axisNames = narrow
    ? labels.map((l) => {
        const s = (l ?? "").trim();
        return s.length > NARROW_MAX_CHARS ? `${s.slice(0, NARROW_MAX_CHARS - 1)}…` : s;
      })
    : names;
  const tickLabels = {
    fontFamily: fonts.mono400,
    fontSize: ty.tick,
    fill: t.text.tick,
    padding: 6,
  };

  const tooltipText = ({ x, y, raw, score }: BarDatum): string[] => [
    labels[x - 1] ?? "",
    `${bar.label} ${formatPercent(y, 0)} (${raw.toFixed(1)})`,
    `${line.label} ${formatNumber(score)}`,
  ];

  return (
    <Card style={styles.card}>
      <View style={[styles.header, narrow && styles.headerNarrow]}>
        <Text style={[styles.title, { color: t.text.primary, fontSize: ty.title }]} numberOfLines={narrow ? 2 : 1}>
          {series.title}
        </Text>
        <Text style={[styles.note, { color: t.text.subtle, fontSize: ty.legend }]}>
          {note ?? `% of 5-point ${bar.label} · ${line.label} -100..100`}
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
            containerComponent={<VictoryVoronoiContainer voronoiDimension="x" voronoiBlacklist={["line", "dots"]} />}
          >
            <VictoryAxis
              dependentAxis
              tickValues={PCT_TICKS}
              tickFormat={(v: number) => `${v}% (${(v / 20).toFixed(1)})`}
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
              events={
                onSelect
                  ? [
                      {
                        target: "data",
                        eventHandlers: {
                          onClick: (_: unknown, p: { datum: BarDatum }) => {
                            onSelect(p.datum.x - 1);
                            return [];
                          },
                        },
                      },
                    ]
                  : undefined
              }
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
                data: selectable
                  ? {
                      fill: ({ active, datum }: { active?: boolean; datum?: BarDatum }) =>
                        fillFor((datum?.x ?? 0) - 1, active === true || selectedIndex === (datum?.x ?? 0) - 1),
                      fillOpacity: ({ datum }: { datum?: BarDatum }) =>
                        selectedIndex != null && selectedIndex !== (datum?.x ?? 0) - 1 ? DIM_OPACITY : 1,
                      cursor: "pointer",
                    }
                  : {
                      fill: ({ active, datum }: { active?: boolean; datum?: BarDatum }) =>
                        fillFor((datum?.x ?? 0) - 1, active === true),
                    },
              }}
            />
            {/* Card-colour halo keeps the line readable where it crosses bars of similar brightness (dark pink). */}
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
              tickFormat={(i: number) => (selectable ? "" : (axisNames[i - 1] ?? ""))}
              tickLabelComponent={
                narrow && !selectable ? (
                  <VictoryLabel angle={NARROW_TICK_ANGLE} textAnchor="end" verticalAnchor="middle" />
                ) : (
                  <VictoryLabel lineHeight={1.15} />
                )
              }
              style={{
                axis: { stroke: t.border.axis, strokeWidth: 1 },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...ty.labelFont, fill: t.text.dim, padding: 6 },
              }}
            />
          </VictoryChart>
        )}
      </View>
      {selectable && n > 0 && width > 0 && (
        <View style={styles.labelRow}>
          <View style={{ width: pad.left }} />
          {labels.map((label, i) => (
            <LabelCell
              key={`${i}-${label}`}
              label={label ?? ""}
              text={names[i] ?? label ?? ""}
              narrow={narrow}
              ty={ty}
              selected={selectedIndex === i}
              underline={barColor.bar}
              onPress={() => onSelect(i)}
            />
          ))}
          <View style={{ width: pad.right }} />
        </View>
      )}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.barKey, { backgroundColor: barColor.bar }]} />
          <Text style={[styles.legendText, { color: t.text.secondary, fontSize: ty.legend }]}>
            {`${bar.label} % (left axis)`}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.lineKey, { backgroundColor: lineColor }]} />
          <Text style={[styles.legendText, { color: t.text.secondary, fontSize: ty.legend }]}>
            {`${line.label} score (right axis)`}
          </Text>
        </View>
      </View>
      {footer}
    </Card>
  );
}

function LabelCell({
  label,
  selected,
  underline,
  text,
  narrow,
  ty,
  onPress,
}: {
  label: string;
  text: string;
  narrow: boolean;
  ty: ChartType;
  selected: boolean;
  underline: string;
  onPress: () => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Show ${label}`}
      accessibilityState={{ selected }}
      style={[styles.labelCell, narrow && styles.labelCellNarrow]}
    >
      {(state: PressableStateCallbackType) => {
        const hovered = (state as PressableStateCallbackType & { hovered?: boolean }).hovered;
        return (
          <>
            <Text
              style={[
                ty.labelFont,
                styles.labelText,
                { lineHeight: ty.lineH + 2 },
                { color: selected || hovered ? t.text.primary : t.text.dim },
                hovered && !selected && styles.labelHover,
              ]}
            >
              {text}
            </Text>
            <View style={[styles.labelUnderline, selected && { backgroundColor: underline }]} />
          </>
        );
      }}
    </Pressable>
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
  headerNarrow: { flexDirection: "column", alignItems: "flex-start", gap: 2 },
  title: { fontFamily: fonts.sans700, flexShrink: 1 },
  note: { fontFamily: fonts.mono400, ...tabular },
  labelRow: { flexDirection: "row" },
  // Cells stretch to the tallest wrapped label; the underline sits at the shared bottom edge.
  labelCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    paddingHorizontal: 2,
    cursor: "pointer",
  },
  labelCellNarrow: { paddingHorizontal: 0 },
  labelText: { textAlign: "center" },
  labelHover: { textDecorationLine: "underline" },
  labelUnderline: {
    height: 2,
    alignSelf: "stretch",
    marginTop: 4,
    backgroundColor: "transparent",
  },
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
