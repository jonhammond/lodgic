import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, type } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

export type SegmentedControlProps<K extends string> = {
  label: string;
  options: { key: K; label: string }[];
  value: K | null;
  onChange: (k: K) => void;
};

export function SegmentedControl<K extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<K>) {
  const { t } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.track, { backgroundColor: t.bg.chip }]}
    >
      {options.map((o) => {
        const checked = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            onPress={() => onChange(o.key)}
            style={[
              styles.segment,
              checked && { backgroundColor: t.bg.card, borderColor: t.border.strong },
            ]}
          >
            <Text style={[type.label14, { color: checked ? t.text.primary : t.text.dim }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", padding: 2, borderRadius: radius.input, alignSelf: "flex-start" },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.input - 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
});
