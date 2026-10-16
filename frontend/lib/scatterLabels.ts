export type LabelPoint = { px: number; py: number; name: string };
export type LabelPlacement = { dx: number; dy: number; anchor: "start" | "middle" | "end" } | null;

const CHAR_W = 5.4;
const LABEL_H = 12;
const DISC_R = 6 + 2;

type Box = { x0: number; y0: number; x1: number; y1: number };

const hit = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Greedy label placement. Candidates (above, below, right, left) are tried per point in x order; one is rejected when
 * its box leaves the plot rect, hits a placed label, or hits another point's disc. No fit -> null (label hidden).
 * dy is the Victory label offset from the point (text baseline), so the box spans [py+dy-LABEL_H, py+dy] vertically.
 */
export function placeLabels(points: LabelPoint[], plotW: number, plotH: number): LabelPlacement[] {
  const out: LabelPlacement[] = points.map(() => null);
  const placed: Box[] = [];
  const order = points.map((_, i) => i).sort((a, b) => points[a].px - points[b].px);
  for (const i of order) {
    const p = points[i];
    const w = p.name.length * CHAR_W;
    const cands: { dx: number; dy: number; anchor: "start" | "middle" | "end"; box: Box }[] = [
      { dx: 0, dy: -12, anchor: "middle", box: { x0: p.px - w / 2, x1: p.px + w / 2, y0: p.py - 12 - LABEL_H, y1: p.py - 12 } },
      { dx: 0, dy: 16, anchor: "middle", box: { x0: p.px - w / 2, x1: p.px + w / 2, y0: p.py + 16 - LABEL_H, y1: p.py + 16 } },
      { dx: 9, dy: 4, anchor: "start", box: { x0: p.px + 9, x1: p.px + 9 + w, y0: p.py + 4 - LABEL_H, y1: p.py + 4 } },
      { dx: -9, dy: 4, anchor: "end", box: { x0: p.px - 9 - w, x1: p.px - 9, y0: p.py + 4 - LABEL_H, y1: p.py + 4 } },
    ];
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
