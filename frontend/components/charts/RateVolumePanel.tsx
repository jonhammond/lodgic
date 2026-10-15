import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { RateVolumePair } from "../../lib/resultMapping";
import { fonts, space } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import { trendColor } from "./format";
import { RateVolumeChart } from "./RateVolumeChart";
import { TrendLineChart } from "./TrendLineChart";

/**
 * Rate trend (one line per property) with a bar+line companion for the pinned
 * property. A single-property result needs no pin: both charts show at once.
 */
export function RateVolumePanel({ pair }: { pair: RateVolumePair }) {
  const { t } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const { rate, volume } = pair;
  const single = rate.series.length === 1;
  const focusName = single ? rate.series[0].name : selected;
  const rateSeries = focusName ? rate.series.find((s) => s.name === focusName) : undefined;
  const volumeSeries = focusName ? volume.series.find((s) => s.name === focusName) : undefined;

  return (
    <View style={styles.stack}>
      <TrendLineChart series={rate} selected={selected} onSelect={setSelected} />
      {rateSeries && volumeSeries ? (
        <RateVolumeChart
          name={rateSeries.name}
          labels={rate.labels}
          rate={{
            label: rate.title,
            values: rateSeries.values,
            unit: rate.unit,
            color: trendColor(t, rateSeries, !single),
          }}
          volume={{ label: volume.title, values: volumeSeries.values }}
        />
      ) : (
        <Text style={[styles.hint, { color: t.text.subtle }]}>
          Select a property line or legend item to compare its {rate.title} with{" "}
          {volume.title.toLowerCase()}.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.gap },
  hint: { fontFamily: fonts.sans400, fontSize: 12, paddingHorizontal: 4 },
});
