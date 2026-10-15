import { StyleSheet, Text, View } from "react-native";
import { fonts } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import { Button } from "./Button";

type Props = {
  propertyCount: number | null;
  totalRooms: number | null;
  sqlOpen: boolean;
  canToggleSql: boolean;
  onToggleSql: () => void;
  canExport: boolean;
  onExport: () => void;
};

export function Header({
  propertyCount,
  totalRooms,
  sqlOpen,
  canToggleSql,
  onToggleSql,
  canExport,
  onExport,
}: Props) {
  const { t } = useTheme();
  const status =
    propertyCount == null || totalRooms == null
      ? "— properties"
      : `${propertyCount} ${propertyCount === 1 ? "property" : "properties"} · ${totalRooms} rooms`;
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={[styles.title, { color: t.text.primary }]}>
        <Text style={{ fontFamily: fonts.sans700 }}>Lodgic </Text>
        <Text style={{ fontFamily: fonts.sans400 }}>| Portfolio Dashboard</Text>
      </Text>
      <View style={styles.right}>
        <View style={[styles.dot, { backgroundColor: t.accent.statusDot }]} />
        <Text style={[styles.status, { color: t.text.dim }]}>{status}</Text>
        <Button
          label={sqlOpen ? "Hide SQL" : "Generated SQL"}
          onPress={onToggleSql}
          disabled={!canToggleSql}
        />
        <Button label="Export" onPress={onExport} disabled={!canExport} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
  },
  title: {
    fontFamily: fonts.sans400,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.26,
    flexShrink: 1,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    flexShrink: 1,
    gap: 8,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  status: { fontFamily: fonts.mono400, fontSize: 12, marginRight: 4 },
});
