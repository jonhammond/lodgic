import { Pressable, PressableStateCallbackType, StyleSheet, Text, View } from "react-native";
import { fonts, space } from "../theme/tokens";
import { BuildingIcon, MoonIcon, SunIcon } from "./icons";
import { Logo } from "./Logo";
import { useTheme } from "../theme/useTheme";

const TOGGLE_AMBER = { base: "#e0a526", hover: "#c9931f" };
const TOGGLE_VIOLET = { base: "#5b3fa6", hover: "#4a3388" };
const BAR_H = 48;
const BUTTON_LEN = 48;
const RULE_AIR = 12;

type Props = {
  selectedCount: number;
  onOpenProperties: () => void;
  scheme: "dark" | "light";
  onToggleTheme: () => void;
};

export function Rail({ selectedCount, onOpenProperties, scheme, onToggleTheme }: Props) {
  const { t, wide } = useTheme();
  // Dark: amber sun. Light: deep violet moon (darker than accent.violet so the white glyph reads on white).
  const toggle = scheme === "dark" ? TOGGLE_AMBER : TOGGLE_VIOLET;
  // Buttons span the rail: full width in the column, full height in the top bar (minus its bottom border).
  const inner = BAR_H - 1;
  const block = wide ? { width: space.railW, height: BUTTON_LEN } : { width: BUTTON_LEN, height: inner };
  // Hairlines in the rail's own border colour separate the app mark from the controls and the two controls from each other.
  const rule = wide ? { width: space.railW, height: 1 } : { width: 1, height: inner };
  const air = wide ? { height: RULE_AIR } : { width: RULE_AIR };
  const hovered = (state: PressableStateCallbackType) =>
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
      {wide ? <Logo width={space.railW} height={space.railW} /> : <Logo width={inner} height={inner} iconSize={24} />}
      <View style={air} />
      <View style={[rule, { backgroundColor: t.border.rail }]} />
      <View style={air} />
      <Pressable
        onPress={onOpenProperties}
        accessibilityRole="button"
        accessibilityLabel="Select properties"
        style={(state) => [styles.block, block, { backgroundColor: hovered(state) ? t.accent.blueHover : t.accent.blue }]}
      >
        <BuildingIcon size={28} color={t.text.onAccent} />
        <View style={[styles.badge, { backgroundColor: t.accent.pink }]}>
          <Text style={styles.badgeText}>{selectedCount}</Text>
        </View>
      </Pressable>
      <View style={[rule, { backgroundColor: t.border.rail }]} />
      <Pressable
        onPress={onToggleTheme}
        accessibilityRole="button"
        accessibilityLabel={scheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        style={(state) => [styles.block, block, { backgroundColor: hovered(state) ? toggle.hover : toggle.base }]}
      >
        {scheme === "dark" ? <SunIcon size={24} color={t.text.onAccent} /> : <MoonIcon size={24} color={t.text.onAccent} />}
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
