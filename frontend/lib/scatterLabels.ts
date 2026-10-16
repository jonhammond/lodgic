export type LabelPoint = { px: number; py: number; name: string };
export type LabelPlacement = { dx: number; dy: number; anchor: "start" | "middle" | "end" } | null;

const DISC_R = 6 + 2;

type Box = { x0: number; y0: number; x1: number; y1: number };

const hit = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Greedy label placement. Candidates (above, below, right, left) are tried per point in x order; one is rejected when
 * its box leaves the plot rect, hits a placed label, or hits another point's disc. No fit -> null (label hidden).
 * dy is the Victory label offset from the point (text baseline), so the box spans [py+dy-m.labelH, py+dy] vertically.
 */
export function placeLabels(
  points: LabelPoint[],
  plotW: number,
  plotH: number,
  m: { charW: number; labelH: number } = { charW: 5.4, labelH: 12 },
): LabelPlacement[] {
  const s = m.labelH / 12;
  const out: LabelPlacement[] = points.map(() => null);
  const placed: Box[] = [];
  const order = points.map((_, i) => i).sort((a, b) => points[a].px - points[b].px);
  for (const i of order) {
    const p = points[i];
    const w = p.name.length * m.charW;
    const cand = (dx: number, dy: number, anchor: "start" | "middle" | "end") => {
      const x0 = anchor === "middle" ? p.px - w / 2 : anchor === "start" ? p.px + dx : p.px + dx - w;
      return { dx, dy, anchor, box: { x0, x1: x0 + w, y0: p.py + dy - m.labelH, y1: p.py + dy } as Box };
    };
    const cands = [cand(0, -12 * s, "middle"), cand(0, 16 * s, "middle"), cand(9 * s, 4 * s, "start"), cand(-9 * s, 4 * s, "end")];
    const fit = cands.find((c) => {
      const b = c.box;
      if (b.x0 < 0 || b.y0 < 0 || b.x1 > plotW || b.y1 > plotH) return false;
      if (placed.some((o) => hit(b, o))) return false;
      return !points.some((o, j) => j !== i && hit(b, { x0: o.px - DISC_R, x1: o.px + DISC_R, y0: o.py - DISC_R, y1: o.py + DISC_R }));
    });
    if (fit) {
      out[i] = { dx: fit.dx, dy: fit.dy, anchor: fit.anchor };
      placed.push(fit.box);
    }
  }
  return out;
}
