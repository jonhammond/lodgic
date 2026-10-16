import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { VictoryPie } from "victory";
import { barRamp } from "../../lib/color";
import { formatByUnit } from "../../lib/resultMapping";
import type { PieSeries } from "../../lib/explicitCharts";
import { fonts, tabular } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { Card } from "../Card";
import { formatPercent } from "./format";

const SIDE_BY_SIDE_W = 480;
const DONUT_MAX = 220;

/** Share-of-total donut; the legend carries the exact values, so slices are unlabelled. */
export function PieChart({ series }: { series: PieSeries }) {
  const { t, scheme } = useTheme();
  const [width, setWidth] = useState(0);
  const { slices, unit } = series;
  const n = slices.length;
  // Slices arrive sorted largest-first (trailing "Other"): deepest shade on the largest.
  const ramp = barRamp(t.kpi.market.bar, t.bg.card, scheme, n);
  const wide = width >= SIDE_BY_SIDE_W;
  const size = Math.max(0, Math.min(DONUT_MAX, wide ? width / 2 : width));

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]}>{series.title}</Text>
      </View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.body, wide && styles.bodyWide]}
      >
        {width > 0 && n > 0 && (
          <>
            <View style={{ width: size, height: size }}>
              <VictoryPie
                standalone
                width={size}
                height={size}
                padding={4}
                data={slices.map((s) => ({ x: s.label, y: Math.max(0, s.value) }))}
                colorScale={ramp}
                innerRadius={size * 0.3}
                padAngle={1.5}
                cornerRadius={2}
                labels={() => null}
                style={{ data: { stroke: t.bg.card, strokeWidth: 1 } }}
              />
            </View>
            <View style={[styles.legend, wide && styles.legendWide]}>
              {slices.map((s, i) => (
                <View key={`${i}-${s.label}`} style={styles.row}>
                  <View style={[styles.key, { backgroundColor: ramp[i] }]} />
                  <Text style={[styles.name, { color: t.text.secondary }]} numberOfLines={2}>
                    {s.label}
                  </Text>
                  <Text style={[styles.value, { color: t.text.primary }]}>
                    {formatByUnit(s.value, unit)}
                  </Text>
                  <Text style={[styles.pct, { color: t.text.subtle }]}>{formatPercent(s.pct)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14 },
  header: { marginBottom: 10 },
  title: { fontFamily: fonts.sans700, fontSize: 13 },
  body: { alignItems: "center", gap: 12 },
  bodyWide: { flexDirection: "row", gap: 20 },
  legend: { alignSelf: "stretch", gap: 4 },
  legendWide: { flex: 1, alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  key: { width: 10, height: 10, borderRadius: 2 },
  name: { fontFamily: fonts.sans400, fontSize: 11, flex: 1 },
  value: { fontFamily: fonts.mono400, fontSize: 11, ...tabular, textAlign: "right" },
  pct: { fontFamily: fonts.mono400, fontSize: 11, ...tabular, width: 48, textAlign: "right" },
});
