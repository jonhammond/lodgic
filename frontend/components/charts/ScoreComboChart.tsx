import { useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
} from "react-native";
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

// Left gutter fits "100% (5.0)" in mono 10px plus tick padding; bottom fits two wrapped label lines.
const PAD = { top: 10, bottom: 34, left: 66, right: 40 };
const SELECTABLE_BOTTOM = 10;
const NARROW_W = 360;
// Narrow: x ticks rotate 35° on one line, so the bottom gutter grows to fit the slanted text.
const NARROW_PAD = { left: 68, right: 34, bottom: 62 };
const NARROW_TICK_ANGLE = -35;
const NARROW_MAX_CHARS = 16;
const NARROW_LABEL_LINES = 3;
const DIM_OPACITY = 0.7; // non-selected bars; keeps >=3:1 against the dark card
const PLOT_H = 200;
const GAP = 8;
const MAX_BAR_W = 28;
const PCT_TICKS = [0, 20, 40, 60, 80, 100];
const X_TICK_FONT = { fontFamily: fonts.sans400, fontSize: 10 };
const X_CHAR_W = 5.6; // sans 10px average advance
const MAX_LABEL_CHARS = 14;

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
export function ScoreComboChart({
  series,
  selectedIndex = null,
  onSelect,
  note,
  footer,
}: Props) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const { labels, bar, line } = series;
  const n = labels.length;
  const narrow = width > 0 && width < NARROW_W;
  const selectable = onSelect != null;
  const basePad = narrow ? { ...PAD, ...NARROW_PAD } : PAD;
  const pad = selectable ? { ...basePad, bottom: SELECTABLE_BOTTOM } : basePad;
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
  const barWidth =
    n > 0 ? Math.max(1, Math.min(MAX_BAR_W, (plotW - GAP * (n - 1)) / n)) : 1;
  // Wrap each label to its slot: ~5.6px per sans-10 char, two lines max (wrapLabel). Narrow
  // slots are too tight to wrap ("Upper Midsc…"), so the axis rotates single-line labels and
  // the selectable label row wraps to three lines instead.
  const slotChars = n > 0 ? Math.floor(plotW / n / X_CHAR_W) : MAX_LABEL_CHARS;
  const names = narrow
    ? labels.map((l) =>
        wrapLabel(l ?? "", Math.max(6, slotChars), NARROW_LABEL_LINES),
      )
    : labels.map((l) =>
        wrapLabel(l ?? "", Math.max(6, Math.min(MAX_LABEL_CHARS, slotChars))),
      );
  const axisNames = narrow
    ? labels.map((l) => {
        const s = (l ?? "").trim();
        return s.length > NARROW_MAX_CHARS
          ? `${s.slice(0, NARROW_MAX_CHARS - 1)}…`
          : s;
      })
    : names;
  const tickLabels = {
    fontFamily: fonts.mono400,
    fontSize: 10,
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
        <Text
          style={[styles.title, { color: t.text.primary }]}
          numberOfLines={narrow ? 2 : 1}
        >
          {series.title}
        </Text>
        <Text style={[styles.note, { color: t.text.subtle }]}>
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
            containerComponent={
              <VictoryVoronoiContainer
                voronoiDimension="x"
                voronoiBlacklist={["line", "dots"]}
              />
            }
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
                    fontSize: 10,
                    fill: t.text.primary,
                  }}
                />
              }
              style={{
                data: selectable
                  ? {
                      fill: ({
                        active,
                        datum,
                      }: {
                        active?: boolean;
                        datum?: BarDatum;
                      }) =>
                        active || selectedIndex === (datum?.x ?? 0) - 1
                          ? barColor.line
                          : barColor.bar,
                      fillOpacity: ({ datum }: { datum?: BarDatum }) =>
                        selectedIndex != null &&
                        selectedIndex !== (datum?.x ?? 0) - 1
                          ? DIM_OPACITY
                          : 1,
                      cursor: "pointer",
                    }
                  : {
                      fill: ({ active }: { active?: boolean }) =>
                        active ? barColor.line : barColor.bar,
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
              tickFormat={(i: number) =>
                selectable ? "" : (axisNames[i - 1] ?? "")
              }
              tickLabelComponent={
                narrow && !selectable ? (
                  <VictoryLabel
                    angle={NARROW_TICK_ANGLE}
                    textAnchor="end"
                    verticalAnchor="middle"
                  />
                ) : (
                  <VictoryLabel lineHeight={1.15} />
                )
              }
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
      {selectable && n > 0 && width > 0 && (
        <View style={styles.labelRow}>
          <View style={{ width: pad.left }} />
          {labels.map((label, i) => (
            <LabelCell
              key={`${i}-${label}`}
              label={label ?? ""}
              text={names[i] ?? label ?? ""}
              narrow={narrow}
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
  onPress,
}: {
  label: string;
  text: string;
  narrow: boolean;
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
        const hovered = (
          state as PressableStateCallbackType & { hovered?: boolean }
        ).hovered;
        return (
          <>
            <Text
              numberOfLines={narrow ? NARROW_LABEL_LINES : 2}
              style={[
                X_TICK_FONT,
                styles.labelText,
                { color: selected || hovered ? t.text.primary : t.text.dim },
                hovered && !selected && styles.labelHover,
              ]}
            >
              {text}
            </Text>
            <View
              style={[
                styles.labelUnderline,
                selected && { backgroundColor: underline },
              ]}
            />
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
  title: { fontFamily: fonts.sans700, fontSize: 13, flexShrink: 1 },
  note: { fontFamily: fonts.mono400, fontSize: 11, ...tabular },
  labelRow: { flexDirection: "row" },
  labelCell: {
    flex: 1,
    alignItems: "center",
    paddingTop: 6,
    paddingHorizontal: 2,
    cursor: "pointer",
  },
  labelCellNarrow: { paddingHorizontal: 0 },
  labelText: { textAlign: "center", lineHeight: 12 },
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
  legendText: { fontFamily: fonts.sans400, fontSize: 11 },
});
