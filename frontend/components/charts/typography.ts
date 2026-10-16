import { fonts } from "../../theme/tokens.ts";

export const COMPACT_W = 360;
export const isCompact = (width: number) => width > 0 && width < COMPACT_W;

export type ChartType = {
  tier: "compact" | "base" | "wide" | "xwide";
  tick: number;
  label: number;
  legend: number;
  title: number;
  lineH: number;
  rowH: number;
  rowHWrapped: number;
  barW: number;
  monoAdvance: number;
  sansAdvance: number;
  tickFont: { fontFamily: typeof fonts.mono400; fontSize: number };
  labelFont: { fontFamily: typeof fonts.sans400; fontSize: number };
};

const TIERS = {
  compact: { tick: 10, label: 11, legend: 11, title: 13 },
  base: { tick: 11, label: 12, legend: 12, title: 13 },
  wide: { tick: 13, label: 14, legend: 13, title: 14 },
  xwide: { tick: 14, label: 15, legend: 14, title: 15 },
} as const;

/** Stepped type scale keyed to measured chart width; width <= 0 (pre-layout) => base. */
export function chartType(width: number): ChartType {
  const tier: ChartType["tier"] =
    width <= 0 ? "base" : width < COMPACT_W ? "compact" : width < 900 ? "base" : width < 1400 ? "wide" : "xwide";
  const { tick, label, legend, title } = TIERS[tier];
  return {
    tier,
    tick,
    label,
    legend,
    title,
    lineH: Math.round(label * 1.2),
    rowH: Math.round(label * 2.4),
    rowHWrapped: Math.round(label * 3.3),
    barW: Math.round(tick * 1.6),
    monoAdvance: tick * 0.62,
    sansAdvance: label * 0.55,
    tickFont: { fontFamily: fonts.mono400, fontSize: tick },
    labelFont: { fontFamily: fonts.sans400, fontSize: label },
  };
}

/** Gutter fitting `chars` sans characters. */
export function nameGutter(chars: number, ty: ChartType, pad = 13): number {
  return Math.round(chars * ty.sansAdvance + pad);
}

export function nameLayout(ty: ChartType): { chars: number; left: number } {
  const chars = ty.tier === "compact" ? 18 : 26;
  return { chars, left: nameGutter(chars, ty) };
}
