import { fonts } from "../../theme/tokens";

export const ROW_H = 26;
export const ROW_H_WRAPPED = 36;
export const BAR_W = 16;
export const LABEL_FONT = { fontFamily: fonts.sans400, fontSize: 11 };
export const VALUE_CHAR_W = 6.2; // mono 10px advance
// Name-axis budget: chars per line and the gutter that fits them.
export const WIDE = { chars: 26, left: 170 };
export const NARROW = { chars: 18, left: 122 };

/** Greedy word wrap to at most two lines; a lone over-long word is clipped with an ellipsis. */
export function wrapLabel(s: string, chars: number): string {
  const words = s.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= chars) cur = `${cur} ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  lines.push(cur);
  if (lines.length <= 2) return lines.join("\n");
  const second = lines.slice(1).join(" ");
  return `${lines[0]}\n${second.slice(0, chars - 1)}…`;
}
