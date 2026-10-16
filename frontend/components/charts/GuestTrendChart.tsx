import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  VictoryAxis,
  VictoryChart,
  VictoryLabel,
  VictoryLine,
  VictoryScatter,
  VictoryVoronoiContainer,
} from "victory";
import type { GuestTrend } from "../../lib/npsCsatEngine";
import { fonts, radius, tabular } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { monthLabel } from "./format";
import { niceDomain } from "./scale";
import { pickTickValues } from "./ticks";

const PAD = { top: 10, bottom: 22, left: 40, right: 40 };
const NARROW_W = 360;
const NARROW_RIGHT = 8;
const PLOT_H = 220;
const END_LABEL_MIN_GAP = 12;
const PARTIAL_OPACITY = 0.5;
const X_TICK_FONT = { fontFamily: fonts.sans400, fontSize: 10 };

type Metric = "csat" | "nps";
type Scope = "hotel" | "segment" | "portfolio";
type SeriesDef = { key: string; metric: Metric; scope: Scope; legend: string; tip: string; values: (number | null)[] };

// Scope sets the dash and weight; metric sets the hue. CSAT is stored 1-5 and plotted as percent of 5 (scale 20).
const SCOPES: { scope: Scope; dash?: string; width: number; border: "solid" | "dashed" | "dotted" }[] = [
  { scope: "hotel", width: 2.5, border: "solid" },
  { scope: "segment", dash: "6,4", width: 2, border: "dashed" },
  { scope: "portfolio", dash: "2,3", width: 1.5, border: "dotted" },
];
const METRICS: { metric: Metric; label: string; scale: number; dp: number }[] = [
  { metric: "csat", label: "CSAT", scale: 20, dp: 2 },
  { metric: "nps", label: "NPS", scale: 1, dp: 1 },
];
const scopeStyle = (scope: Scope) => SCOPES.find((x) => x.scope === scope) ?? SCOPES[0];
const yPx = (v: number, top: number, lo: number, hi: number) => top + ((hi - v) / (hi - lo)) * PLOT_H;

/** `yyyy-mm-dd` becomes `d MMM`; other labels (e.g. `Sep 2026`) pass through. */
export function guestTrendLabel(label: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(label) ? `${Number(label.slice(8, 10))} ${monthLabel(label)}` : label;
}

/** One row per bucket for CSV export. CSAT stays on the engine's 1-5 scale; empty string marks a gap. */
export function guestTrendCsvRows(trend: GuestTrend): Record<string, unknown>[] {
  return trend.labels.map((period, i) => {
    const row: Record<string, unknown> = { period };
    for (const { scope } of SCOPES)
      for (const { metric, dp } of METRICS) {
        const v = trend[scope][metric][i] ?? null;
        row[`${scope}_${metric}`] = v === null ? "" : Number(v.toFixed(dp));
      }
    return row;
  });
}

type Props = {
  title: string;
  note: string;
  trend: GuestTrend;
  hotelName: string;
  segmentLabel: string;
  /** Rendered inside the card below the chart. */
  footer?: ReactNode;
};

/** Hotel vs segment vs selected-portfolio CSAT (% of 5) and NPS on one 0-100 axis. Hue = metric, dash = scope. */
export function GuestTrendChart({ title, note, trend, hotelName, segmentLabel, footer }: Props) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const [tipW, setTipW] = useState(190);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { labels, partialLast } = trend;
  const n = labels.length;
  const narrow = width > 0 && width < NARROW_W;
  const pad = { ...PAD, right: narrow ? NARROW_RIGHT : PAD.right };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const height = PLOT_H + pad.top + pad.bottom;
  const hue: Record<Metric, string> = { csat: t.kpi.guest.line, nps: t.kpi.market.line };

  const series = useMemo<SeriesDef[]>(() => {
    const names: Record<Scope, string> = { hotel: hotelName, segment: segmentLabel, portfolio: "Portfolio" };
    return SCOPES.flatMap(({ scope }) =>
      METRICS.map(({ metric, label, scale }) => ({
        key: `${scope}-${metric}`,
        metric,
        scope,
        legend: scope === "hotel" ? `Hotel ${label}${metric === "csat" ? " %" : ""}` : `${names[scope]} ${label} avg`,
        tip: `${names[scope]} ${label}`,
        values: trend[scope][metric].map((v) => (v === null ? null : v * scale)),
      })),
    );
  }, [trend, hotelName, segmentLabel]);

  // 0-100 axis; extends below 0 (or above 100) only when the data does.
  const { lo, hi, ticks: yTicks } = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
    return niceDomain(Math.min(0, ...all), Math.max(100, ...all), 5);
  }, [series]);

  const xTicks = pickTickValues(labels.map(guestTrendLabel), plotW, X_TICK_FONT);
  const tickLabels = { fontFamily: fonts.mono400, fontSize: 10, fill: t.text.tick, padding: 6 };

  // End labels for the hotel lines only; nudged apart when they would collide.
  const ends = useMemo(() => {
    const out = series
      .filter((s) => s.scope === "hotel")
      .map((s) => {
        let i = s.values.length - 1;
        while (i >= 0 && s.values[i] === null) i--;
        return i < 0 ? null : { s, x: i + 1, y: s.values[i] as number, dy: 0 };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    // Only labels sharing an x can collide.
    if (out.length === 2 && out[0].x === out[1].x) {
      const [a, b] = out[0].y >= out[1].y ? [out[0], out[1]] : [out[1], out[0]];
      const gap = yPx(b.y, PAD.top, lo, hi) - yPx(a.y, PAD.top, lo, hi);
      if (gap < END_LABEL_MIN_GAP) {
        const shift = (END_LABEL_MIN_GAP - gap) / 2;
        a.dy = -shift;
        b.dy = shift;
      }
    }
    return out;
  }, [series, lo, hi]);

  const fmt = (s: SeriesDef, v: number) => (s.metric === "csat" ? `${Math.round(v)}%` : String(Math.round(v)));

  const crossX = hoverIdx === null ? 0 : pad.left + (n > 1 ? ((hoverIdx - 1) / (n - 1)) * plotW : 0);
  const tipLeft = Math.max(
    0,
    Math.min(width - tipW, crossX > pad.left + plotW / 2 ? crossX - tipW - 8 : crossX + 8),
  );

  // Line body plus a faded tail segment when the last bucket is incomplete.
  const lineParts = (s: SeriesDef) => {
    const pts = s.values.map((y, i) => ({ x: i + 1, y }));
    return partialLast && pts.length > 1
      ? [
          { id: "body", data: pts.slice(0, -1), faded: false },
          { id: "tail", data: pts.slice(-2), faded: true },
        ]
      : [{ id: "body", data: pts, faded: false }];
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.note, { color: t.text.subtle }]}>{note}</Text>
      </View>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View
              style={{
                width: 16,
                height: 0,
                borderTopWidth: scopeStyle(s.scope).width,
                borderTopColor: hue[s.metric],
                borderStyle: scopeStyle(s.scope).border,
              }}
            />
            <Text style={[styles.legendText, { color: t.text.secondary }]}>{s.legend}</Text>
          </View>
        ))}
      </View>
      <Pressable
        accessible={false}
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
                voronoiBlacklist={["cross", "dots", "ends"]}
                activateData={false}
                onActivated={(pts: { x?: number }[]) => {
                  const x = pts[0]?.x;
                  if (typeof x === "number") setHoverIdx(x);
                }}
                // No onDeactivated: it fires on every active-point change and would cancel the
                // activation above. The wrapping Pressable's onHoverOut clears the crosshair.
              />
            }
          >
            <VictoryAxis
              dependentAxis
              tickValues={yTicks}
              tickFormat={(v: number) => String(v)}
              style={{
                axis: { stroke: "transparent" },
                grid: { stroke: t.border.axis, strokeWidth: 1, strokeDasharray: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: { ...tickLabels, textAnchor: "end" },
              }}
            />
            <VictoryAxis
              tickValues={xTicks}
              tickFormat={(i: number) => guestTrendLabel(labels[i - 1] ?? "")}
              style={{
                axis: { stroke: t.border.axis, strokeWidth: 1 },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
                tickLabels: {
                  ...X_TICK_FONT,
                  fill: t.text.dim,
                  padding: 6,
                  textAnchor: ({ index }: { index?: number | string }) =>
                    Number(index) === xTicks.length - 1 ? "end" : "middle",
                },
              }}
            />
            {/* Draw order: portfolio, segment, then hotel on top. */}
            {[...series].reverse().flatMap((s) =>
              lineParts(s).map((p) => (
                <VictoryLine
                  key={`${s.key}-${p.id}`}
                  name={`s-${s.key}-${p.id}`}
                  interpolation="linear"
                  data={p.data}
                  style={{
                    data: {
                      stroke: hue[s.metric],
                      strokeWidth: scopeStyle(s.scope).width,
                      strokeDasharray: scopeStyle(s.scope).dash,
                      strokeLinejoin: "round",
                      strokeLinecap: "round",
                      opacity: p.faded ? PARTIAL_OPACITY : 1,
                    },
                  }}
                />
              )),
            )}
            {series
              .filter((s) => s.scope === "hotel")
              .map((s) => (
                <VictoryScatter
                  key={`m-${s.key}`}
                  name={`m-${s.key}`}
                  data={s.values.flatMap((y, i) => (y === null ? [] : [{ x: i + 1, y }]))}
                  size={3}
                  style={{
                    data: {
                      fill: ({ datum }: { datum?: { x: number } }) =>
                        partialLast && datum?.x === n ? t.bg.card : hue[s.metric],
                      stroke: hue[s.metric],
                      strokeWidth: 1.5,
                    },
                  }}
                />
              ))}
            {ends.map((e) => (
              <VictoryScatter
                key={`end-${e.s.key}`}
                name="ends"
                data={[{ x: e.x, y: e.y, label: fmt(e.s, e.y) }]}
                size={0}
                labelComponent={
                  <VictoryLabel
                    textAnchor="start"
                    dx={narrow ? -4 : 8}
                    dy={narrow ? -10 + e.dy : e.dy}
                    style={{
                      fontFamily: fonts.mono400,
                      fontSize: 10,
                      fill: t.text.primary,
                      stroke: t.bg.card,
                      strokeWidth: 3,
                      paintOrder: "stroke",
                    }}
                  />
                }
                style={{ data: { fill: "transparent" } }}
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
                data={series
                  .filter((s) => s.values[hoverIdx - 1] != null)
                  .map((s) => ({ x: hoverIdx, y: s.values[hoverIdx - 1] as number, color: hue[s.metric] }))}
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
        {hoverIdx !== null && (
          <View
            pointerEvents="none"
            onLayout={(e) => {
              setTipW(e.nativeEvent.layout.width);
            }}
            style={[
              styles.tip,
              { left: tipLeft, top: pad.top, backgroundColor: t.bg.panel, borderColor: t.border.strong },
            ]}
          >
            <Text style={[styles.tipHead, { color: t.text.subtle }]}>
              {guestTrendLabel(labels[hoverIdx - 1] ?? "")}
              {partialLast && hoverIdx === n ? " (partial)" : ""}
            </Text>
            {series.map((s) => {
              const v = s.values[hoverIdx - 1];
              return (
                <View key={s.key} style={styles.tipRow}>
                  <View style={[styles.tipKey, { backgroundColor: hue[s.metric], height: Math.ceil(scopeStyle(s.scope).width) }]} />
                  <Text style={[styles.tipName, { color: t.text.secondary }]} numberOfLines={1}>
                    {s.tip}
                  </Text>
                  <Text style={[styles.tipVal, { color: t.text.primary }]}>{v == null ? "-" : fmt(s, v)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </Pressable>
      {footer}
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
    marginBottom: 10,
  },
  title: { fontFamily: fonts.sans700, fontSize: 13, flexShrink: 1 },
  note: { fontFamily: fonts.mono400, fontSize: 11, ...tabular },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 2, marginBottom: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
  legendText: { fontFamily: fonts.sans400, fontSize: 11 },
  tip: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: radius.button,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 2,
  },
  tipHead: { fontFamily: fonts.sans400, fontSize: 11, marginBottom: 2 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tipKey: { width: 10, height: 2 },
  tipName: { fontFamily: fonts.sans400, fontSize: 11, flexShrink: 1 },
  tipVal: { fontFamily: fonts.mono400, fontSize: 11, marginLeft: "auto", paddingLeft: 10, ...tabular },
});
