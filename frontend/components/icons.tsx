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

/** Solid hotel silhouette: central tower, two lower wings; windows and door punched out with evenodd. */
export function BuildingIcon({ size, color }: IconProps) {
  const win = (x: number, y: number) => `M${x} ${y} h2 v2.6 h-2 Z`;
  const d = [
    "M8 2 H16 V22 H8 Z",
    "M1.5 9 H8 V22 H1.5 Z",
    "M16 9 H22.5 V22 H16 Z",
    win(10, 4.5),
    win(12.9, 4.5),
    win(10, 8.6),
    win(12.9, 8.6),
    win(10, 12.7),
    win(12.9, 12.7),
    win(3.6, 11.5),
    win(3.6, 15.6),
    win(18.4, 11.5),
    win(18.4, 15.6),
    "M10.5 22 V17.5 H13.5 V22 Z",
  ].join(" ");
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={color} fillRule="evenodd" />
    </Svg>
  );
}
