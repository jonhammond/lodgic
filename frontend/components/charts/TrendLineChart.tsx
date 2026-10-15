import { useMemo, useState } from "react";
import { Pressable, PressableStateCallbackType, StyleSheet, Text, View } from "react-native";
import {
  VictoryAxis,
  VictoryChart,
  VictoryLabel,
  VictoryLine,
  VictoryScatter,
  VictoryVoronoiContainer,
} from "victory";
import { formatByUnit, TrendSeries } from "../../lib/resultMapping";
import { fonts, radius, tabular } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { niceDomain, tickLabel } from "./scale";
import { pickTickValues } from "./ticks";

const PLOT_H = 180;
const PAD = { top: 10, bottom: 22, left: 40, right: 52 };
const NARROW_W = 360;
const NARROW_RIGHT = 8;
const END_LABEL_MIN_GAP = 12;
const X_TICK_FONT = { fontFamily: fonts.sans400, fontSize: 10 };

type Rank = TrendSeries["series"][number]["rank"];

const mean = (vs: (number | null)[]): number => {
  const nn = vs.filter((v): v is number => v !== null);
  return nn.length ? nn.reduce((a, b) => a + b, 0) / nn.length : -Infinity;
};

export function TrendLineChart({ series }: { series: TrendSeries }) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const [tipW, setTipW] = useState(150);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverName, setHoverName] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const { labels, unit, reference } = series;
  const n = labels.length;
  const narrow = width > 0 && width < NARROW_W;
  const padRight = narrow ? NARROW_RIGHT : PAD.right;
  const pad = { ...PAD, right: padRight };
  const height = PLOT_H + PAD.top + PAD.bottom;
  const plotW = Math.max(0, width - PAD.left - padRight);
  const multi = series.series.length >= 2;
  const focus = pinned ?? hoverName;

  const colorOf = (rank: Rank): string =>
    !multi
      ? t.kpi.market.line
      : rank === "top"
        ? t.trend.top
        : rank === "bottom"
          ? t.trend.bottom
          : t.trend.mid;

  const { lo, hi, ticks: yTicks } = useMemo(() => {
    const all = series.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
    if (reference) all.push(reference.y);
    if (all.length === 0) return niceDomain(0, 1);
    return niceDomain(Math.min(...all), Math.max(...all));
  }, [series, reference]);

  const byAvg = useMemo(
    () => [...series.series].sort((a, b) => mean(b.values) - mean(a.values)),
    [series],
  );

  // Draw order: field, then top/bottom, then the focused line on top.
  const drawOrder = useMemo(() => {
    const weight = (s: TrendSeries["series"][number]) =>
      s.name === focus ? 2 : s.rank === "mid" ? 0 : 1;
    return [...series.series].sort((a, b) => weight(a) - weight(b));
  }, [series, focus]);

  const xTicks = pickTickValues(labels, plotW, X_TICK_FONT);
  const tickLabels = {
    fontFamily: fonts.mono400,
    fontSize: 10,
    fill: t.text.tick,
    padding: 6,
  };

  const yPx = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * PLOT_H;

  // End markers for top/bottom only; nudge apart when their labels would collide.
  const ends = useMemo(() => {
    if (!multi) return [];
    const out = series.series
      .filter((s) => s.rank !== "mid")
      .map((s) => {
        let i = s.values.length - 1;
        while (i >= 0 && s.values[i] === null) i--;
        return i < 0 ? null : { s, x: i + 1, y: s.values[i] as number, dy: 0 };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    if (out.length === 2) {
      const [a, b] = out[0].y >= out[1].y ? [out[0], out[1]] : [out[1], out[0]];
      const gap = yPx(b.y) - yPx(a.y);
      if (gap < END_LABEL_MIN_GAP) {
        const shift = (END_LABEL_MIN_GAP - gap) / 2;
        a.dy = -shift;
        b.dy = shift;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, multi, lo, hi]);

  const hoverRows = useMemo(() => {
    if (hoverIdx === null) return [];
    return series.series
      .map((s) => ({ s, v: s.values[hoverIdx - 1] }))
      .filter((r): r is { s: TrendSeries["series"][number]; v: number } => r.v != null)
      .sort((a, b) => b.v - a.v);
  }, [series, hoverIdx]);

  const crossX = hoverIdx === null ? 0 : PAD.left + (n > 1 ? ((hoverIdx - 1) / (n - 1)) * plotW : 0);
  const tipLeft = Math.max(
    0,
    Math.min(
      width - tipW,
      crossX > PAD.left + plotW / 2 ? crossX - tipW - 8 : crossX + 8,
    ),
  );

  const lineStyle = (s: TrendSeries["series"][number]) => {
    const focused = s.name === focus;
    const dim = focus !== null && !focused;
    return {
      stroke: colorOf(s.rank),
      strokeWidth: focused ? 3 : s.rank === "mid" && multi ? 1.5 : 2,
      opacity: dim ? 0.25 : s.rank === "mid" && multi && focus === null ? 0.9 : 1,
      strokeLinejoin: "round" as const,
      strokeLinecap: "round" as const,
    };
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]}>{series.title}</Text>
        <Text style={[styles.note, { color: t.text.subtle }]}>{series.note}</Text>
      </View>
      <Pressable
        accessible={false}
        onPress={() => setPinned(null)}
        onHoverOut={() => setHoverIdx(null)}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && n > 0 && (
          <VictoryChart
            width={width}
            height={height}
            padding={pad}
            domain={{ x: [1, Math.max(2, n)], y: [lo, hi] }}
            domainPadding={0}
            containerComponent={
              <VictoryVoronoiContainer
                voronoiDimension="x"
                voronoiBlacklist={["ref", "refLabel", "cross", "dots", "ends"]}
                activateData={false}
                onActivated={(pts: { x?: number }[]) => {
                  const x = pts[0]?.x;
                  if (typeof x === "number") setHoverIdx(x);
                }}
                // No onDeactivated: Victory fires it on every move where the active
                // points change, which would cancel the activation above. The wrapping
                // Pressable's onHoverOut clears the crosshair when the pointer leaves.
              />
            }
          >
            <VictoryAxis
              dependentAxis
              tickValues={yTicks}
              tickFormat={(v: number) => tickLabel(v, unit)}
              style={{
                axis: { stroke: "transparent" },
                grid: { stroke: t.border.axis, strokeWidth: 1, strokeDasharray: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...tickLabels, textAnchor: "end" },
              }}
            />
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
                  textAnchor: ({ index }: { index?: number | string }) =>
                    narrow && Number(index) === xTicks.length - 1 ? "end" : "middle",
                },
              }}
            />
            {reference && (
              <VictoryLine
                name="ref"
                data={[
                  { x: 1, y: reference.y },
                  { x: Math.max(2, n), y: reference.y },
                ]}
                style={{
                  data: { stroke: t.trend.reference, strokeWidth: 1, strokeDasharray: "4,4" },
                }}
              />
            )}
            {reference && (
              <VictoryScatter
                name="refLabel"
                data={[{ x: 1, y: reference.y, label: reference.label }]}
                size={0}
                labelComponent={
                  <VictoryLabel
                    textAnchor="start"
                    dx={4}
                    dy={-7}
                    style={{ fontFamily: fonts.sans400, fontSize: 10, fill: t.text.subtle }}
                  />
                }
                style={{ data: { fill: "transparent" } }}
              />
            )}
            {drawOrder.map((s) => (
              <VictoryLine
                key={s.name}
                name={`s-${s.name}`}
                interpolation="linear"
                data={s.values.map((y, i) => ({ x: i + 1, y }))}
                style={{ data: lineStyle(s) }}
              />
            ))}
            {!narrow &&
              ends.map((e) => (
                <VictoryScatter
                  key={`end-${e.s.name}`}
                  name="ends"
                  data={[{ x: e.x, y: e.y, label: formatByUnit(e.y, unit) }]}
                  size={4}
                  labelComponent={
                    <VictoryLabel
                      textAnchor="start"
                      dx={8}
                      dy={e.dy}
                      style={{ fontFamily: fonts.mono400, fontSize: 10, fill: t.text.secondary }}
                    />
                  }
                  style={{
                    data: { fill: colorOf(e.s.rank), stroke: t.bg.card, strokeWidth: 2 },
                  }}
                />
              ))}
            {narrow &&
              ends.map((e) => (
                <VictoryScatter
                  key={`end-${e.s.name}`}
                  name="ends"
                  data={[{ x: e.x, y: e.y }]}
                  size={4}
                  style={{
                    data: { fill: colorOf(e.s.rank), stroke: t.bg.card, strokeWidth: 2 },
                  }}
                />
              ))}
            {hoverIdx !== null && (
              <VictoryLine
                name="cross"
                data={[
                  { x: hoverIdx, y: lo },
                  { x: hoverIdx, y: hi },
                ]}
                style={{ data: { stroke: t.border.strong, strokeWidth: 1 } }}
              />
            )}
            {hoverIdx !== null && (
              <VictoryScatter
                name="dots"
                data={hoverRows.map((r) => ({ x: hoverIdx, y: r.v, color: colorOf(r.s.rank) }))}
                size={3}
                style={{
                  data: {
                    fill: ({ datum }: { datum?: { color?: string } }) => datum?.color ?? t.trend.mid,
                    stroke: t.bg.card,
                    strokeWidth: 2,
                  },
                }}
              />
            )}
          </VictoryChart>
        )}
        {hoverIdx !== null && hoverRows.length > 0 && (
          <View
            pointerEvents="none"
            onLayout={(e) => setTipW(e.nativeEvent.layout.width)}
            style={[
              styles.tip,
              {
                left: tipLeft,
                top: PAD.top,
                backgroundColor: t.bg.panel,
                borderColor: t.border.strong,
              },
            ]}
          >
            <Text style={[styles.tipHead, { color: t.text.subtle }]}>{labels[hoverIdx - 1]}</Text>
            {hoverRows.map(({ s, v }) => (
              <View key={s.name} style={styles.tipRow}>
                <View style={[styles.tipKey, { backgroundColor: colorOf(s.rank) }]} />
                <Text style={[styles.tipName, { color: t.text.secondary }]} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={[styles.tipVal, { color: t.text.primary }]}>
                  {formatByUnit(v, unit)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Pressable>
      {multi && (
        <View style={styles.legend}>
          {byAvg.map((s) => {
            const selected = pinned === s.name;
            const glyph = s.rank === "top" ? "▲ " : s.rank === "bottom" ? "▼ " : "";
            return (
              <Pressable
                key={s.name}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onHoverIn={() => setHoverName(s.name)}
                onHoverOut={() => setHoverName((c) => (c === s.name ? null : c))}
                onPress={() => setPinned((c) => (c === s.name ? null : s.name))}
                style={(state: PressableStateCallbackType) => {
                  const hovered = (state as PressableStateCallbackType & { hovered?: boolean })
                    .hovered;
                  return [
                    styles.legendItem,
                    {
                      borderColor: selected || hovered ? t.border.strongHover : "transparent",
                      opacity: focus !== null && focus !== s.name ? 0.5 : 1,
                    },
                  ];
                }}
              >
                <View style={[styles.legendKey, { backgroundColor: colorOf(s.rank) }]} />
                <Text style={[styles.legendText, { color: t.text.secondary }]}>
                  {glyph ? <Text style={{ color: t.text.dim }}>{glyph}</Text> : null}
                  {s.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
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
  tip: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: radius.button,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 3,
  },
  tipHead: { fontFamily: fonts.sans400, fontSize: 11, marginBottom: 2 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tipKey: { width: 10, height: 2 },
  tipName: { fontFamily: fonts.sans400, fontSize: 11, flexShrink: 1 },
  tipVal: { fontFamily: fonts.mono400, fontSize: 11, marginLeft: "auto", paddingLeft: 10, ...tabular },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 6, rowGap: 2, marginTop: 10 },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderRadius: radius.button,
  },
  legendKey: { width: 14, height: 2 },
  legendText: { fontFamily: fonts.sans400, fontSize: 11 },
});
