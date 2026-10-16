// Pure colour helpers for the ranked single-hue bar ramp. No React / RN deps so node --test can import it.

type Rgb = [number, number, number];
type Scheme = "light" | "dark";

const HEX6 = /^#[0-9a-f]{6}$/i;

export function hexToRgb(hex: string): Rgb {
  if (!HEX6.test(hex)) throw new Error(`expected 6-digit hex, got ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex(rgb: Rgb): string {
  return "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

// sRGB lerp from a to b, t in [0, 1].
export function mix(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex(ra.map((v, i) => v + (rb[i] - v) * t) as Rgb);
}

// WCAG 2.x relative luminance.
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio, >= 1.
export function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Dense rank, 0 = largest; ties share a rank.
export function denseRankDesc(values: number[]): number[] {
  const distinct = Array.from(new Set(values)).sort((a, b) => b - a);
  const rank = new Map(distinct.map((v, i) => [v, i]));
  return values.map((v) => rank.get(v) ?? 0);
}

// Ramp anchors. `deepen` mixes the hue toward black (light) or white (dark) for the top bar; `fade` mixes it
// toward the card for the bottom bar. On a dark card "deeper" means brighter: darkening loses contrast, and
// dimming alone leaves low-contrast hues (blueFocus 3.3:1) with almost no span once the fade floor binds.
// The fade is reduced until the bottom bar still clears MIN_FAINT_CONTRAST against the card: light green/amber
// and dark pink would otherwise fall to ~1.5:1. The ordinal-ramp floor is 2:1; per-bar value labels in text ink
// remain the authoritative encoding.
const LIGHT = { deepen: 0.2, fade: 0.5, toward: "#000000" };
const DARK = { deepen: 0.25, fade: 0.4, toward: "#ffffff" };
const MIN_FAINT_CONTRAST = 2;
const FADE_STEP = 0.02;

function faintEnd(hue: string, surface: string, fade: number): string {
  let t = fade;
  while (t > 0 && contrast(mix(hue, surface, t), surface) < MIN_FAINT_CONTRAST) t = Math.max(0, t - FADE_STEP);
  return mix(hue, surface, t);
}

// n shades of `hue` from deep (index 0) to faint (index n-1) for bars on `surface`.
export function barRamp(hue: string, surface: string, scheme: Scheme, n: number): string[] {
  const { deepen, fade, toward } = scheme === "dark" ? DARK : LIGHT;
  const deep = mix(hue, toward, deepen);
  if (n <= 0) return [];
  if (n === 1) return [deep];
  const faint = faintEnd(hue, surface, fade);
  return Array.from({ length: n }, (_, i) => mix(deep, faint, i / (n - 1)));
}

// Thin strokes (2.5px lines) need 3:1 against the card. Ramp hues designed for fills may sit below that, so
// mix toward black (light) or white (dark) just until the stroke clears `min`. Unchanged when already safe.
export function ensureContrast(hex: string, surface: string, scheme: Scheme, min = 3): string {
  const toward = scheme === "dark" ? "#ffffff" : "#000000";
  let t = 0;
  let out = hex;
  while (contrast(out, surface) < min && t < 1) {
    t = Math.min(1, t + FADE_STEP);
    out = mix(hex, toward, t);
  }
  return out;
}
