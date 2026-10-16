import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { GrowthIcon } from "./icons";

type Props = { width: number; height: number; iconSize?: number };

/** Lodgic mark: growth glyph on the brand gradient. Fills the box it is given; no rounding so it sits flush to the rail edges. */
export function Logo({ width, height, iconSize = 30 }: Props) {
  return (
    <View style={{ width, height }} accessibilityLabel="Lodgic" accessibilityRole="image">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="logoGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#ee4a6e" />
            <Stop offset="1" stopColor="#d6286a" />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#logoGradient)" />
      </Svg>
      <View style={styles.center}>
        <GrowthIcon size={iconSize} color="#ffffff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
