import { useState } from "react";
import { Pressable, PressableStateCallbackType, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  formatWeekEnding,
  formatPercent,
  humanize,
  isNumeric,
  isPercentLikeKey,
  toNumber,
} from "./charts/format";
import { fonts, tabular } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import { Card } from "./Card";

type Props = {
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
  groupBy?: string;
  seriesOrder?: Record<string, number>;
};
type Role = "label" | "heat" | "bar";

const CURRENCY_RE = /revenue|adr|revpar|price|rate_usd/i;
// Totals heuristic: additive metrics are summed, everything else (ADR, occupancy, ...) is averaged.
const SUM_RE = /revenue|rooms_sold|rooms|count|total/i;

const FLEX_BY_ROLE: Record<Role, number> = { label: 1.1, bar: 1.3, heat: 0.7 };

export function PropertyTable({ title, columns: inputColumns, rows, groupBy, seriesOrder }: Props) {
  const { t, wide } = useTheme();
  const barColors = [t.table.revenueBar, t.table.adrBar, t.accent.violet];

  const labelCol = inputColumns.find((c) =>
    rows.some((r) => r[c] != null && !isNumeric(r[c])),
  );
  // Column order follows the mock (Property · Revenue · ADR · Occ.): label first,
  // bar columns next, heat (percent) columns last.
  const rest = inputColumns.filter((c) => c !== labelCol && c !== groupBy);
  const columns = [
    ...(labelCol ? [labelCol] : []),
    ...rest.filter((c) => !isPercentLikeKey(c)),
    ...rest.filter((c) => isPercentLikeKey(c)),
  ];
  const roles: Record<string, Role> = {};
  columns.forEach((c) => {
    roles[c] = c === labelCol ? "label" : isPercentLikeKey(c) ? "heat" : "bar";
  });

  const nums = (c: string) =>
    rows.filter((r) => isNumeric(r[c])).map((r) => toNumber(r[c]));
  const colMax: Record<string, number> = {};
  const heatCuts: Record<string, [number, number]> = {};
  const barIdx: Record<string, number> = {};
  let b = 0;
  columns.forEach((c) => {
    if (roles[c] === "bar") {
      colMax[c] = Math.max(0, ...nums(c));
      barIdx[c] = b++;
    } else if (roles[c] === "heat") {
      const s = nums(c).sort((x, y) => y - x);
      heatCuts[c] = [s[Math.floor(s.length / 3)] ?? 0, s[Math.floor((2 * s.length) / 3)] ?? 0];
    }
  });

  const firstBar = columns.find((c) => roles[c] === "bar");

  const groups = (() => {
    if (!groupBy) return [];
    const m = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
      const k = String(r[groupBy]);
      const g = m.get(k);
      if (g) g.push(r);
      else m.set(k, [r]);
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([key, rs]) => ({
        key,
        rows: firstBar
          ? [...rs].sort((a, b) => toNumber(b[firstBar] ?? -Infinity) - toNumber(a[firstBar] ?? -Infinity))
          : rs,
      }));
  })();

  const [expandedState, setExpanded] = useState<{ rows: typeof rows; set: Set<string> } | null>(null);
  // Reset to the newest group whenever the result set changes.
  const expanded =
    expandedState && expandedState.rows === rows
      ? expandedState.set
      : new Set(groups.length ? [groups[0].key] : []);
  const toggle = (k: string) =>
    setExpanded({
      rows,
      set: (() => {
        const next = new Set(expanded);
        if (!next.delete(k)) next.add(k);
        return next;
      })(),
    });

  const flexOf = (i: number) => FLEX_BY_ROLE[roles[columns[i]]];
  const isLast = (i: number) => i === columns.length - 1;
  const alignOf = (i: number) => (isLast(i) ? ("right" as const) : ("left" as const));

  const money = (c: string, v: number) =>
    !CURRENCY_RE.test(c)
      ? formatNumber(v)
      : Math.abs(v) >= 1e6
        ? formatCompactCurrency(v)
        : formatCurrency(v);

  const totalFor = (c: string): string => {
    const v = nums(c);
    if (v.length === 0) return "";
    const sum = v.reduce((a, x) => a + x, 0);
    const val = SUM_RE.test(c) ? sum : sum / v.length;
    return roles[c] === "heat" ? formatPercent(val) : money(c, val);
  };

  const cell = (c: string, i: number, r: Record<string, unknown>) => {
    const rampColor =
      groupBy && labelCol && seriesOrder ? t.trend.ramp[seriesOrder[String(r[labelCol]).trim()]] : undefined;
    const raw = r[c];
    const style = [styles.cell, { flex: flexOf(i) }];
    if (roles[c] === "label" || !isNumeric(raw)) {
      return (
        <View key={c} style={style}>
          <Text style={[styles.text, { color: t.text.primary, textAlign: alignOf(i) }]}>
            {raw == null ? "" : String(raw)}
          </Text>
        </View>
      );
    }
    const v = toNumber(raw);
    if (roles[c] === "heat") {
      const [hi, mid] = heatCuts[c];
      const bg = v >= hi ? t.table.heat[0] : v >= mid ? t.table.heat[1] : t.table.heat[2];
      return (
        <View key={c} style={style}>
          <Text
            numberOfLines={1}
            style={[styles.text, styles.heat, { backgroundColor: bg, color: t.text.onAccent }]}
          >
            {formatPercent(v)}
          </Text>
        </View>
      );
    }
    const pct = colMax[c] > 0 ? (v / colMax[c]) * 100 : 0;
    return (
      <View key={c} style={style}>
        <View style={styles.barCell}>
          <View
            style={[
              styles.bar,
              { width: `${pct}%`, backgroundColor: (barIdx[c] === 0 ? rampColor : undefined) ?? barColors[barIdx[c] % barColors.length] },
            ]}
          />
          <Text numberOfLines={1} style={[styles.text, styles.barText, { color: t.text.primary }]}>
            {money(c, v)}
          </Text>
        </View>
      </View>
    );
  };

  const groupSummary = (rs: Record<string, unknown>[]): string => {
    if (!firstBar) return "";
    const vals = rs.filter((r) => isNumeric(r[firstBar]));
    if (vals.length === 0) return "";
    const avg = vals.reduce((a, r) => a + toNumber(r[firstBar]), 0) / vals.length;
    const lead = vals[0];
    const leadName = labelCol && lead[labelCol] != null ? String(lead[labelCol]).trim() : "";
    // Narrow layouts (horizontal-scroll table) drop the leader so the header fits the 440px row.
    const leader = wide && leadName ? ` \u00b7 \u25b2 ${leadName} ${money(firstBar, toNumber(lead[firstBar]))}` : "";
    return `avg ${money(firstBar, avg)}${leader}`;
  };

  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: t.text.primary }]}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.inner}>
          <View style={[styles.headerRow, { borderBottomColor: t.border.strong }]}>
            {columns.map((c, i) => (
              <View key={c} style={{ flex: flexOf(i) }}>
                <Text style={[styles.headText, { color: t.text.secondary, textAlign: alignOf(i) }]}>
                  {humanize(c)}
                </Text>
              </View>
            ))}
          </View>
          {groupBy
            ? groups.map((g) => {
                const open = expanded.has(g.key);
                return (
                  <View key={g.key}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      onPress={() => toggle(g.key)}
                      style={(state: PressableStateCallbackType) => {
                        const hovered = (state as PressableStateCallbackType & { hovered?: boolean })
                          .hovered;
                        return [
                          styles.groupHead,
                          wide ? styles.groupHeadWide : styles.groupHeadNarrow,
                          {
                            backgroundColor: t.bg.panel,
                            borderBottomColor: hovered ? t.border.strongHover : t.border.strong,
                          },
                        ];
                      }}
                    >
                      <Text style={[styles.text, { color: t.text.dim }]}>{open ? "\u25be" : "\u25b8"}</Text>
                      <Text style={[styles.text, styles.bold, { color: t.text.primary }]}>
                        {formatWeekEnding(g.key)}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[styles.groupSummary, wide && styles.groupSummaryWide, { color: t.text.secondary }]}
                      >
                        {groupSummary(g.rows)}
                      </Text>
                    </Pressable>
                    {open &&
                      g.rows.map((r, ri) => (
                        <View key={ri} style={[styles.row, { borderBottomColor: t.border.row }]}>
                          {columns.map((c, i) => cell(c, i, r))}
                        </View>
                      ))}
                  </View>
                );
              })
            : rows.map((r, ri) => (
                <View key={ri} style={[styles.row, { borderBottomColor: t.border.row }]}>
                  {columns.map((c, i) => cell(c, i, r))}
                </View>
              ))}
          {!groupBy && (
          <View style={styles.totalRow}>
            {columns.map((c, i) => (
              <View key={c} style={{ flex: flexOf(i) }}>
                <Text
                  numberOfLines={1}
                  style={[styles.text, styles.bold, { color: t.text.primary, textAlign: alignOf(i) }]}
                >
                  {roles[c] === "label" ? "Total" : totalFor(c)}
                </Text>
              </View>
            ))}
          </View>
          )}
        </View>
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 10 },
  title: { fontFamily: fonts.sans700, fontSize: 13, marginBottom: 10 },
  scrollContent: { flexGrow: 1 },
  inner: { minWidth: 440, flex: 1 },
  headerRow: { flexDirection: "row", gap: 10, paddingVertical: 8, borderBottomWidth: 1 },
  headText: { fontFamily: fonts.sans600, fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  cell: { justifyContent: "center" },
  text: { fontFamily: fonts.sans400, fontSize: 13, ...tabular },
  bold: { fontFamily: fonts.sans700 },
  heat: { textAlign: "right", paddingVertical: 3, paddingHorizontal: 6, alignSelf: "flex-end" },
  barCell: { height: 22, position: "relative", justifyContent: "center" },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0 },
  barText: { textAlign: "right", paddingRight: 6 },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  groupHeadWide: { flexWrap: "nowrap" },
  groupHeadNarrow: { flexWrap: "wrap" },
  groupSummary: { fontFamily: fonts.mono400, fontSize: 11, ...tabular, flexShrink: 1 },
  groupSummaryWide: { marginLeft: "auto" },
  totalRow: { flexDirection: "row", gap: 10, paddingTop: 10, paddingBottom: 6 },
});
