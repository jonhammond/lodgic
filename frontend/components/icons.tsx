import Svg, { Path, Rect } from "react-native-svg";

type IconProps = { size: number; color: string };

/** Four rising bars under a zigzag arrow climbing to the top right. */
export function GrowthIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect x="3" y="20" width="5" height="10" rx="1.2" fill={color} />
      <Rect x="10" y="17" width="5" height="13" rx="1.2" fill={color} />
      <Rect x="17" y="14" width="5" height="16" rx="1.2" fill={color} />
      <Rect x="24" y="11" width="5" height="19" rx="1.2" fill={color} />
      <Path
        d="M3 14 L10 7.5 L15.5 12 L26 3.5"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M20.5 2 H29 V10.5 Z" fill={color} />
    </Svg>
  );
}

/** Hotel outline: central tower with windows, two lower wings and a door. */
export function BuildingIcon({ size, color }: IconProps) {
  const s = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 3 H16 V21 H8 Z" {...s} />
      <Path d="M2 10 H8 M16 10 H22 M2 10 V21 H22 V10" {...s} />
      <Rect x="10.2" y="6" width="1.8" height="2.2" fill={color} />
      <Rect x="13" y="6" width="1.8" height="2.2" fill={color} />
      <Rect x="10.2" y="10" width="1.8" height="2.2" fill={color} />
      <Rect x="13" y="10" width="1.8" height="2.2" fill={color} />
      <Rect x="4" y="13" width="1.8" height="2.2" fill={color} />
      <Rect x="18.2" y="13" width="1.8" height="2.2" fill={color} />
      <Path d="M10.5 21 V16.5 H13.5 V21" {...s} />
    </Svg>
  );
}
