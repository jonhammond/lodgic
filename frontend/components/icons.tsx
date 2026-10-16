import Svg, { Circle, Path, Rect } from "react-native-svg";

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

/** Solid hotel silhouette on a 28-unit grid, drawn 1:1 at 28 px so window edges land on whole pixels. */
export function BuildingIcon({ size, color }: IconProps) {
  const win = (x: number, y: number) => `M${x} ${y} h2 v3 h-2 Z`;
  const d = [
    "M9 2 H19 V26 H9 Z",
    "M1 10 H9 V26 H1 Z",
    "M19 10 H27 V26 H19 Z",
    win(11, 5),
    win(15, 5),
    win(11, 10),
    win(15, 10),
    win(11, 15),
    win(15, 15),
    win(4, 13),
    win(4, 18),
    win(22, 13),
    win(22, 18),
    "M11 26 V20 H17 V26 Z",
  ].join(" ");
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Path d={d} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

/** Sun: centre disc with eight round-capped rays. 24-unit box, draw at 24 px. */
export function SunIcon({ size, color }: IconProps) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const x1 = 12 + Math.cos(a) * 8;
    const y1 = 12 + Math.sin(a) * 8;
    const x2 = 12 + Math.cos(a) * 10.5;
    const y2 = 12 + Math.sin(a) * 10.5;
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }).join(" ");
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="5" fill={color} />
      <Path d={rays} stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Moon: crescent from a full disc minus an offset disc (evenodd). 24-unit box, draw at 24 px. */
export function MoonIcon({ size, color }: IconProps) {
  const d = "M12 2 A10 10 0 1 0 22 12 A7.5 7.5 0 0 1 12 2 Z";
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={color} />
    </Svg>
  );
}
