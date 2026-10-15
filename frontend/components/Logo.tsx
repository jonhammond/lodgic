import Svg, { Defs, LinearGradient, Polyline, Rect, Stop } from "react-native-svg";

type Props = { size?: number };

/** Lodgic mark: roofline over ascending bars. Source of truth: assets/logo.svg. */
export function Logo({ size = 30 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Lodgic">
      <Defs>
        <LinearGradient id="logoGradient" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ee4a6e" />
          <Stop offset="1" stopColor="#d6286a" />
        </LinearGradient>
      </Defs>
      <Rect width="64" height="64" rx="15" fill="url(#logoGradient)" />
      <Polyline
        points="15,29 32,14 49,29"
        fill="none"
        stroke="#fff"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x="18" y="39" width="8" height="12" rx="2" fill="#fff" />
      <Rect x="28" y="33" width="8" height="18" rx="2" fill="#fff" />
      <Rect x="38" y="27" width="8" height="24" rx="2" fill="#fff" />
    </Svg>
  );
}
