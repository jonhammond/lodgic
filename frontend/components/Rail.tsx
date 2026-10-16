import { Ionicons } from "@expo/vector-icons";
import { Pressable, PressableStateCallbackType, StyleSheet, Text, View } from "react-native";
import { fonts, space } from "../theme/tokens";
import { BuildingIcon } from "./icons";
import { Logo } from "./Logo";
import { useTheme } from "../theme/useTheme";

const TOGGLE_VIOLET_LIGHT = "#5b3fa6";
const BAR_H = 48;
const BUTTON_LEN = 48;
const LOGO_GAP = 16;
const BUTTON_GAP = 2;

type Props = {
  selectedCount: number;
  onOpenProperties: () => void;
  scheme: "dark" | "light";
  onToggleTheme: () => void;
};

export function Rail({ selectedCount, onOpenProperties, scheme, onToggleTheme }: Props) {
  const { t, wide } = useTheme();
  // Dark: amber sun. Light: deep violet moon (darker than accent.violet so the white glyph reads on white).
  const toggleBg = scheme === "dark" ? t.accent.amber : TOGGLE_VIOLET_LIGHT;
  // Buttons span the rail: full width in the column, full height in the top bar.
  const block = wide
    ? { width: space.railW, height: BUTTON_LEN }
    : { width: BUTTON_LEN, height: BAR_H - 1 };
  const hoverable = (state: PressableStateCallbackType) =>
    Boolean((state as PressableStateCallbackType & { hovered?: boolean }).hovered) || state.pressed;
  return (
    <View
      style={[
        wide ? styles.column : styles.bar,
        {
          backgroundColor: t.bg.rail,
          borderColor: t.border.rail,
          ...(wide ? { borderRightWidth: 1 } : { borderBottomWidth: 1 }),
        },
      ]}
    >
      {wide ? <Logo width={space.railW} height={space.railW} /> : <Logo width={BAR_H - 1} height={BAR_H - 1} iconSize={24} />}
      <View style={wide ? { height: LOGO_GAP } : { width: LOGO_GAP }} />
      <Pressable
        onPress={onOpenProperties}
        accessibilityRole="button"
        accessibilityLabel="Select properties"
        style={(state) => [
          styles.block,
          block,
          { backgroundColor: hoverable(state) ? t.accent.blueHover : t.accent.blue },
        ]}
      >
        <BuildingIcon size={22} color={t.text.onAccent} />
        <View style={[styles.badge, { backgroundColor: t.accent.pink }]}>
          <Text style={styles.badgeText}>{selectedCount}</Text>
        </View>
      </Pressable>
      <View style={wide ? { height: BUTTON_GAP } : { width: BUTTON_GAP }} />
      <Pressable
        onPress={onToggleTheme}
        accessibilityRole="button"
        accessibilityLabel={scheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        style={(state) => [styles.block, block, { backgroundColor: toggleBg, opacity: hoverable(state) ? 0.85 : 1 }]}
      >
        <Ionicons name={scheme === "dark" ? "sunny" : "moon"} size={18} color={t.text.onAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    width: space.railW,
    alignItems: "center",
  },
  bar: {
    height: BAR_H,
    flexDirection: "row",
    alignItems: "center",
  },
  block: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontFamily: fonts.sans600,
    fontSize: 10,
    lineHeight: 12,
  },
});
