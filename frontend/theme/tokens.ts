export type KpiColors = { line: string; glow: string; bar: string; barPartial: string };

export type Palette = {
  bg: {
    page: string;
    rail: string;
    panel: string;
    card: string;
    button: string;
    chip: string;
    input: string;
    code: string;
    skeleton: string;
  };
  border: {
    rail: string;
    row: string;
    chip: string;
    axis: string;
    strong: string;
    strongHover: string;
    panelAccent: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    dim: string;
    subtle: string;
    tick: string;
    onAccent: string;
  };
  accent: {
    blue: string;
    blueHover: string;
    blueFocus: string;
    green: string;
    pink: string;
    violet: string;
    amber: string;
    logo: string;
    statusDot: string;
    link: string;
    linkHover: string;
    ring: string;
  };
  delta: { up: string; down: string; error: string };
  tier: { above: string; below: string; critical: string };
  kpi: Record<
    "revenue" | "adr" | "revpar" | "occupancy" | "distribution" | "cost" | "market" | "guest",
    KpiColors
  >;
  table: { revenueBar: string; adrBar: string; heat: [string, string, string] };
  trend: {
    ramp: readonly string[] | string[];
    mid: string;
    reference: string;
    volume: string;
    volumeActive: string;
    volumeSolid: string;
  };
};

const accents = {
  blue: "#305eb7",
  blueHover: "#3d70d1",
  blueFocus: "#4c7dd9",
  green: "#2acc8a",
  pink: "#d6286a",
  violet: "#b9a4ff",
  amber: "#e0a526",
  logo: "#e13156",
  statusDot: "#23d891",
  ring: "#305eb71f",
};

const kpi: Palette["kpi"] = {
  revenue: { line: accents.blue, glow: "#305eb7bf", bar: accents.blue, barPartial: "#305eb78c" },
  adr: { line: accents.green, glow: "#2acc8a99", bar: accents.green, barPartial: "#2acc8a8c" },
  revpar: { line: accents.violet, glow: "#7b57c8b3", bar: accents.violet, barPartial: "#b9a4ff8c" },
  occupancy: { line: accents.pink, glow: "#d6286ab3", bar: accents.pink, barPartial: "#d6286a8c" },
  distribution: { line: accents.green, glow: "#2acc8a99", bar: accents.green, barPartial: "#2acc8a8c" },
  cost: { line: accents.amber, glow: "#e0a526a6", bar: accents.amber, barPartial: "#e0a5268c" },
  market: { line: accents.violet, glow: "#7b57c8b3", bar: accents.violet, barPartial: "#b9a4ff8c" },
  guest: { line: accents.pink, glow: "#d6286ab3", bar: accents.pink, barPartial: "#d6286a8c" },
};

const tableColors: Palette["table"] = {
  revenueBar: accents.blue,
  adrBar: "#00a166",
  heat: ["#bd1359", "#c7436d", "#cf7188"],
};

export const dark: Palette = {
  bg: {
    page: "#1c2126",
    rail: "#161a1e",
    panel: "#262d33",
    card: "#2a3138",
    button: "#232a30",
    chip: "#1f252b",
    input: "#161a1e",
    code: "#161a1e",
    skeleton: "#2f373e",
  },
  border: {
    rail: "#262c32",
    row: "#262c32",
    chip: "#353d44",
    axis: "#3a434b",
    strong: "#4a535c",
    strongHover: "#9aa4ad",
    panelAccent: "#305eb799",
  },
  text: {
    primary: "#eef0f2",
    secondary: "#c3cad0",
    muted: "#aab3bb",
    dim: "#9aa4ad",
    subtle: "#7d8790",
    tick: "#8b959e",
    onAccent: "#ffffff",
  },
  accent: {
    ...accents,
    link: "#8fb0ff",
    linkHover: "#c2d3ff",
  },
  delta: { up: "#7fe0b4", down: "#ff8fa8", error: "#ff8fa8" },
  tier: { above: accents.violet, below: "#6b7d90", critical: "#ff8fa8" },
  kpi: {
    ...kpi,
    revenue: { line: accents.blueFocus, glow: "#4c7dd9bf", bar: accents.blueFocus, barPartial: "#4c7dd98c" },
  },
  table: { ...tableColors, revenueBar: accents.blueFocus },
  trend: {
    ramp: ["#34c98a", "#148c7a", "#62b4f0", "#3356c4", "#c0a8ff", "#7e3bb0", "#f58ab8", "#b5265f", "#ffa040", "#c44711"],
    mid: "#5b6670",
    reference: "#9aa4ad",
    volume: "#4a5867",
    volumeActive: "#6b7d90",
    volumeSolid: "#6b7d90",
  },
};

// Design extrapolation: the handoff specifies dark only; light inverts the neutrals and keeps accents.
export const light: Palette = {
  bg: {
    page: "#f6f7f8",
    rail: "#ffffff",
    panel: "#ffffff",
    card: "#ffffff",
    button: "#ffffff",
    chip: "#eef0f2",
    input: "#ffffff",
    code: "#eef0f2",
    skeleton: "#e3e6e9",
  },
  border: {
    rail: "#e3e6e9",
    row: "#e3e6e9",
    chip: "#d5dade",
    axis: "#c3cad0",
    strong: "#aab3bb",
    strongHover: "#5b6670",
    panelAccent: "#305eb799",
  },
  text: {
    primary: "#14181c",
    secondary: "#2f373e",
    muted: "#4a535c",
    dim: "#5b6670",
    subtle: "#7d8790",
    tick: "#7d8790",
    onAccent: "#ffffff",
  },
  accent: {
    ...accents,
    violet: "#7b57c8",
    link: "#305eb7",
    linkHover: "#3d70d1",
  },
  delta: { up: "#0f8a5a", down: "#c4204f", error: "#c4204f" },
  tier: { above: "#7b57c8", below: "#7f8c98", critical: "#c4204f" },
  kpi: {
    ...kpi,
    revpar: { line: "#7b57c8", glow: "#7b57c880", bar: "#7b57c8", barPartial: "#7b57c88c" },
    market: { line: "#7b57c8", glow: "#7b57c880", bar: "#7b57c8", barPartial: "#7b57c88c" },
  },
  table: tableColors,
  trend: {
    ramp: ["#0f8a5a", "#26c4ac", "#1f6fb8", "#58a0ea", "#6a44c0", "#b07fe0", "#b82d78", "#e66fa6", "#b54d15", "#f08c3a"],
    mid: "#aab3bb",
    reference: "#7d8790",
    volume: "#b4c1cd",
    volumeActive: "#8a9cae",
    volumeSolid: "#7f8c98",
  },
};

export const radius = { button: 5, ask: 6, logo: 7, input: 8, rail: 9, card: 12, pill: 999 } as const;

export const space = {
  gap: 16,
  railW: 60,
  breakpoint: 640,
  mainPad: 24,
  mainPadNarrow: 16,
} as const;

export const fonts = {
  sans400: "InstrumentSans_400Regular",
  sans500: "InstrumentSans_500Medium",
  sans600: "InstrumentSans_600SemiBold",
  sans700: "InstrumentSans_700Bold",
  mono400: "IBMPlexMono_400Regular",
  mono500: "IBMPlexMono_500Medium",
} as const;

export const type = {
  title26: { fontFamily: fonts.sans700, fontSize: 26, lineHeight: 32 },
  kpiValue28: { fontFamily: fonts.sans600, fontSize: 28, lineHeight: 34 },
  summary18: { fontFamily: fonts.sans500, fontSize: 18, lineHeight: 26 },
  input16: { fontFamily: fonts.sans400, fontSize: 16, lineHeight: 22 },
  label14: { fontFamily: fonts.sans500, fontSize: 14, lineHeight: 20 },
  body13: { fontFamily: fonts.sans400, fontSize: 13, lineHeight: 19 },
  small12: { fontFamily: fonts.sans400, fontSize: 12, lineHeight: 16 },
  meta11: { fontFamily: fonts.mono400, fontSize: 11, lineHeight: 15 },
  axis10: { fontFamily: fonts.mono400, fontSize: 10, lineHeight: 14 },
} as const;

export const tabular = { fontVariant: ["tabular-nums" as const] };
