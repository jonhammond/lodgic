/** Greedy word wrap to at most `maxLines` lines; a lone over-long word is clipped with an ellipsis. */
export function wrapLabel(s: string, chars: number, maxLines = 2): string {
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
  if (lines.length <= maxLines) return lines.join("\n");
  const head = lines.slice(0, maxLines - 1);
  const tail = lines.slice(maxLines - 1).join(" ");
  return [...head, `${tail.slice(0, chars - 1)}…`].join("\n");
}

/** Single-line label: clipped with an ellipsis beyond `chars`. */
export function truncateLabel(s: string, chars: number): string {
  return s.length > chars ? `${s.slice(0, Math.max(1, chars - 1)).trimEnd()}…` : s;
}
