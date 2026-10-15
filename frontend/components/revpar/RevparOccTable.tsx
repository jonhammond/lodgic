import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Portfolio, PropertyCalc, SortKey, Tier } from "../../lib/revparEngine";
import { fonts, radius, space, tabular } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { formatCurrency, formatNumber, formatPercent } from "../charts/format";

export type RevparOccTableProps = {
  rows: PropertyCalc[];
  portfolio: Portfolio;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
};

const TIER_LABEL: Record<Tier, string> = { above: "Above", below: "Below", critical: "Critical" };
const SORT_LABEL: Record<SortKey, string> = {
  name: "Property",
  rooms: "Rooms",
  occupancy: "Occupancy",
  adr: "ADR",
  revpar: "RevPAR",
};

export function RevparOccTable({ rows, portfolio, sort, onSort }: RevparOccTableProps) {
  const { t } = useTheme();
  const narrow = useWindowDimensions().width < space.breakpoint;
  const keys: SortKey[] = narrow
    ? ["name", "occupancy", "adr", "revpar"]
    : ["name", "rooms", "occupancy", "adr", "revpar"];
  const flexOf = (k: SortKey) => (k === "name" ? 1.6 : 1);
  const align = (k: SortKey) => (k === "name" ? ("left" as const) : ("right" as const));

  const header = (k: SortKey) => {
    const active = sort.key === k;
    const glyph = active ? (sort.dir === "asc" ? " ▴" : " ▾") : "";
    return (
      <Pressable
        key={k}
        accessibilityRole="button"
        accessibilityLabel={`Sort by ${SORT_LABEL[k]}`}
        onPress={() => onSort(k)}
        style={{ flex: flexOf(k) }}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.headText,
            { color: active ? t.text.primary : t.text.secondary, textAlign: align(k) },
          ]}
        >
          {SORT_LABEL[k] + glyph}
        </Text>
      </Pressable>
    );
  };

  const value = (k: SortKey, r: Pick<PropertyCalc, "rooms" | "occupancy" | "adr" | "revpar">) =>
    k === "rooms"
      ? formatNumber(r.rooms)
      : k === "occupancy"
        ? formatPercent(r.occupancy * 100)
        : k === "adr"
          ? formatCurrency(r.adr)
          : formatCurrency(r.revpar);

  const tierWidth = narrow ? 20 : 80;

  return (
    <Card style={styles.card}>
      <View style={[styles.headerRow, { borderBottomColor: t.border.strong }]}>
        {keys.map(header)}
        <View style={{ width: tierWidth }}>
          {!narrow && <Text style={[styles.headText, { color: t.text.secondary }]}>Tier</Text>}
        </View>
      </View>
      {rows.map((r) => (
        <View key={r.id} style={[styles.row, { borderBottomColor: t.border.row }]}>
          {keys.map((k) => (
            <View key={k} style={{ flex: flexOf(k) }}>
              <Text
                numberOfLines={1}
                style={[
                  k === "name" ? styles.text : styles.num,
                  { color: t.text.primary, textAlign: align(k) },
                ]}
              >
                {k === "name" ? r.name : value(k, r)}
              </Text>
            </View>
          ))}
          <View
            style={[styles.tier, { width: tierWidth }]}
            accessible
            accessibilityLabel={`Tier: ${TIER_LABEL[r.tier]}`}
          >
            <View style={[styles.dot, { backgroundColor: t.tier[r.tier] }]} />
            {!narrow && (
              <Text style={[styles.text, { color: t.text.primary }]}>{TIER_LABEL[r.tier]}</Text>
            )}
          </View>
        </View>
      ))}
      <View style={styles.totalRow}>
        {keys.map((k) => (
          <View key={k} style={{ flex: flexOf(k) }}>
            <Text
              numberOfLines={1}
              style={[styles.num, styles.bold, { color: t.text.primary, textAlign: align(k) }]}
            >
              {k === "name" ? "Portfolio" : value(k, portfolio)}
            </Text>
          </View>
        ))}
        <View style={{ width: tierWidth }} />
      </View>
    </Card>
  );
}

const COL_GAP = 12;

const styles = StyleSheet.create({
  card: { paddingTop: 8, paddingHorizontal: 18, paddingBottom: 10, borderRadius: radius.card },
  headerRow: { flexDirection: "row", gap: COL_GAP, paddingVertical: 8, borderBottomWidth: 1 },
  headText: { fontFamily: fonts.sans600, fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: COL_GAP,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  text: { fontFamily: fonts.sans400, fontSize: 13 },
  num: { fontFamily: fonts.mono400, fontSize: 13, ...tabular },
  bold: { fontFamily: fonts.mono500 },
  tier: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  totalRow: { flexDirection: "row", gap: COL_GAP, paddingTop: 10, paddingBottom: 6 },
});
