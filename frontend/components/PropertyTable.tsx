import { useState } from "react";
import { Pressable, PressableStateCallbackType, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  formatLongDate,
  formatWeekEnding,
  isWeeklySpacing,
  formatPercent,
  humanize,
  isNumeric,
  isPercentLikeKey,
  toNumber,
  trendColor,
} from "./charts/format";
import { ensureContrast } from "../lib/color";
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
// Grouped results list one row per property; the raw `name` key reads better as "Property".
const LABEL_OVERRIDES: Record<string, string> = { name: "Property", property_name: "Property", property: "Property" };

const FLEX_BY_ROLE: Record<Role, number> = { label: 1.1, bar: 1.3, heat: 0.7 };
const FLEX_BY_ROLE_NARROW: Record<Role, number> = { label: 1.5, bar: 1.2, heat: 0.7 };
// Fixed value slots so the numbers form a column under the header and the bar starts at one x.
// Narrow (phone / iframe) widths shrink the value slot and column gap so a label plus two bar columns
// fit without horizontal scrolling; the bar track absorbs the rest.
const VALUE_W = { wide: { currency: 84, count: 64 }, narrow: { currency: 62, count: 46 } } as const;

export function PropertyTable({ title, columns: inputColumns, rows, groupBy, seriesOrder }: Props) {
  const { t, wide, scheme } = useTheme();
  const slotOf = (c: string) => VALUE_W[wide ? "wide" : "narrow"][CURRENCY_RE.test(c) ? "currency" : "count"];
  const gap = wide ? COL_GAP : NARROW_GAP;

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

  // Daily buckets read as plain dates; only seven-day spacing gets the "Week ending" label.
  const weekly = isWeeklySpacing(groups.map((g) => g.key));
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

  const flexOf = (i: number) => (wide ? FLEX_BY_ROLE : FLEX_BY_ROLE_NARROW)[roles[columns[i]]];
  const isLast = (i: number) => i === columns.length - 1;
  // Bar columns are value-then-bar, so their header sits over the value slot on the left;
  // only a trailing heat column right-aligns.
  const alignOf = (i: number) =>
    isLast(i) && roles[columns[i]] === "heat" ? ("right" as const) : ("left" as const);
  const headerOf = (c: string) =>
    (groupBy && roles[c] === "label" && LABEL_OVERRIDES[c.toLowerCase()]) || humanize(c);

  const money = (c: string, v: number) =>
    !CURRENCY_RE.test(c)
      ? formatNumber(v)
      : Math.abs(v) >= 1e6
        ? formatCompactCurrency(v)
        : formatCurrency(v);

  const aggregate = (c: string, vals: number[]): string => {
    if (vals.length === 0) return "";
    const sum = vals.reduce((a, x) => a + x, 0);
    const summed = SUM_RE.test(c);
    const val = summed ? sum : sum / vals.length;
    const text = roles[c] === "heat" ? formatPercent(val) : money(c, val);
    return summed ? text : `avg ${text}`;
  };
  const totalFor = (c: string) => aggregate(c, nums(c));
  const subtotalFor = (c: string, rs: Record<string, unknown>[]) =>
    aggregate(
      c,
      rs.filter((r) => isNumeric(r[c])).map((r) => toNumber(r[c])),
    );

  const cell = (c: string, i: number, r: Record<string, unknown>) => {
    const rampColor =
      groupBy && labelCol && seriesOrder
        ? ensureContrast(
            trendColor(t, { order: seriesOrder[String(r[labelCol]).trim()] }, Object.keys(seriesOrder).length > 1),
            t.bg.card,
            scheme,
          )
        : undefined;
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
    // One coloured bar per row: the lead metric takes the property ramp colour (same as the
    // trend chart); every later bar column is the thin grey volume bar the combo chart uses.
    const lead = barIdx[c] === 0;
    const color = lead ? (rampColor ?? t.table.adrBar) : t.trend.volumeActive;
    const size = lead ? styles.barTall : styles.barThin;
    return (
      <View key={c} style={style}>
        <View style={styles.barCell}>
          <Text
            numberOfLines={1}
            style={[
              styles.text,
              styles.barValue,
              { width: slotOf(c), color: t.text.primary },
            ]}
          >
            {money(c, v)}
          </Text>
          <View style={[styles.barTrack, size]}>
            <View style={[size, { width: `${pct}%`, backgroundColor: color }]} />
          </View>
        </View>
      </View>
    );
  };

  // Group header suffix (wide only, so the narrow scrolling layout keeps the date on one
  // line): the row count while open, the leader while collapsed. Rows are sorted desc by `firstBar`.
  const suffixFor = (rs: Record<string, unknown>[], open: boolean): string => {
    if (!wide) return "";
    if (open) {
      const noun = labelCol && LABEL_OVERRIDES[labelCol.toLowerCase()] ? "properties" : "rows";
      return `${rs.length} ${noun}`;
    }
    if (!firstBar || !labelCol) return "";
    const lead = rs.find((r) => isNumeric(r[firstBar]));
    const name = lead && lead[labelCol] != null ? String(lead[labelCol]).trim() : "";
    return lead && name ? `${name} led at ${money(firstBar, toNumber(lead[firstBar]))}` : "";
  };

  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: t.text.primary }]}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.inner, wide ? styles.innerWide : null]}>
          <View style={[styles.headerRow, { gap, borderBottomColor: t.border.strong }]}>
            {columns.map((c, i) => (
              <View key={c} style={{ flex: flexOf(i) }}>
                <Text style={[styles.headText, { color: t.text.secondary, textAlign: alignOf(i) }]}>
                  {headerOf(c)}
                </Text>
              </View>
            ))}
          </View>
          {groupBy
            ? groups.map((g) => {
                const open = expanded.has(g.key);
                const suffix = suffixFor(g.rows, open);
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
                          {
                            gap,
                            backgroundColor: t.bg.panel,
                            borderBottomColor: hovered ? t.border.strongHover : t.border.strong,
                          },
                        ];
                      }}
                    >
                      {columns.map((c, i) =>
                        i === 0 ? (
                          <View key={c} style={[styles.cell, styles.groupLabel, { flex: flexOf(i) }]}>
                            <Text style={[styles.text, { color: t.text.dim }]}>{open ? "▾" : "▸"}</Text>
                            <Text style={[styles.text, styles.bold, styles.date, { color: t.text.primary }]}>
                              {weekly ? formatWeekEnding(g.key) : formatLongDate(g.key)}
                            </Text>
                            {suffix ? (
                              <Text
                                numberOfLines={1}
                                style={[styles.subtotal, styles.suffix, { color: t.text.secondary }]}
                              >
                                {suffix}
                              </Text>
                            ) : null}
                          </View>
                        ) : (
                          <View key={c} style={[styles.cell, { flex: flexOf(i) }]}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.subtotal,
                                { color: t.text.secondary },
                                // Bar columns: same fixed slot as the row values so the digits line up
                                // (wide only; the narrow slot is too small for the "avg" prefix).
                                roles[c] === "bar" && wide
                                  ? { width: slotOf(c), textAlign: "right" }
                                  : { textAlign: alignOf(i) },
                              ]}
                            >
                              {subtotalFor(c, g.rows)}
                            </Text>
                          </View>
                        ),
                      )}
                    </Pressable>
                    {open &&
                      g.rows.map((r, ri) => (
                        <View key={ri} style={[styles.row, { gap, borderBottomColor: t.border.row }]}>
                          {columns.map((c, i) => cell(c, i, r))}
                        </View>
                      ))}
                  </View>
                );
              })
            : rows.map((r, ri) => (
                <View key={ri} style={[styles.row, { gap, borderBottomColor: t.border.row }]}>
                  {columns.map((c, i) => cell(c, i, r))}
                </View>
              ))}
          {!groupBy && (
          <View style={[styles.totalRow, { gap }]}>
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

const COL_GAP = 20;
const NARROW_GAP = 10;

const styles = StyleSheet.create({
  card: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 10 },
  title: { fontFamily: fonts.sans700, fontSize: 13, marginBottom: 10 },
  scrollContent: { flexGrow: 1 },
  inner: { flex: 1 },
  innerWide: { minWidth: 520 },
  headerRow: { flexDirection: "row", gap: COL_GAP, paddingVertical: 8, borderBottomWidth: 1 },
  headText: { fontFamily: fonts.sans600, fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: COL_GAP,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  cell: { justifyContent: "center" },
  text: { fontFamily: fonts.sans400, fontSize: 13, ...tabular },
  bold: { fontFamily: fonts.sans700 },
  heat: { textAlign: "right", paddingVertical: 3, paddingHorizontal: 6, alignSelf: "flex-end" },
  // Value sits in a fixed slot on the left, the bar grows rightwards from it and ends in
  // whitespace before the next column, so a number never touches a neighbouring bar.
  barCell: { height: 22, flexDirection: "row", alignItems: "center", gap: 8 },
  barValue: { textAlign: "right" },
  barTrack: { flex: 1, justifyContent: "center" },
  barTall: { height: 22 },
  barThin: { height: 12 },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: COL_GAP,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  groupLabel: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 8 },
  date: { flexShrink: 0 },
  subtotal: { fontFamily: fonts.sans400, fontSize: 12, ...tabular },
  suffix: { flexShrink: 1 },
  totalRow: { flexDirection: "row", gap: COL_GAP, paddingTop: 10, paddingBottom: 6 },
});
