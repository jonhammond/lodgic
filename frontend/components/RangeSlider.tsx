import { Platform, StyleSheet, Text, View } from "react-native";
import { fonts, tabular, type } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import { Button } from "./Button";

export type RangeSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
};

export function RangeSlider({ label, value, min, max, step, format, onChange }: RangeSliderProps) {
  const { t } = useTheme();
  const nudge = (dir: 1 | -1) => onChange(Math.min(max, Math.max(min, value + dir * step)));
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[type.label14, { color: t.text.dim }]}>{label}</Text>
        <Text style={[styles.value, { color: t.text.primary }]}>{format(value)}</Text>
      </View>
      {Platform.OS === "web" ? (
        <input
          type="range"
          aria-label={label}
          aria-valuetext={format(value)}
          name={label.toLowerCase().replace(/\W+/g, "-")}
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ accentColor: t.accent.blue, width: "100%" }}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
        />
      ) : (
        <View style={styles.steppers}>
          <Button label="−" disabled={value <= min} onPress={() => nudge(-1)} />
          <Button label="+" disabled={value >= max} onPress={() => nudge(1)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minWidth: 200, gap: 4 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  value: { fontFamily: fonts.mono500, fontSize: 13, ...tabular },
  steppers: { flexDirection: "row", gap: 8 },
});
