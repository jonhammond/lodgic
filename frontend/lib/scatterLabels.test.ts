import assert from "node:assert/strict";
import { test } from "node:test";
import { placeLabels } from "./scatterLabels.ts";

const box = (p: { px: number; py: number; name: string }, l: { dx: number; dy: number; anchor: string }) => {
  const w = p.name.length * 5.4;
  const x0 = l.anchor === "start" ? p.px + l.dx : l.anchor === "end" ? p.px + l.dx - w : p.px - w / 2;
  return { x0, x1: x0 + w, y0: p.py + l.dy - 12, y1: p.py + l.dy };
};
const hit = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

test("second of two adjacent points is not placed above", () => {
  const pts = [
    { px: 200, py: 100, name: "Alpha" },
    { px: 204, py: 100, name: "Bravo" },
  ];
  const out = placeLabels(pts, 600, 300);
  assert.ok(out[0]);
  assert.ok(out[1]);
  assert.notEqual(out[1]!.dy, -12);
});

test("a cluster of three yields no intersecting label boxes", () => {
  const pts = [
    { px: 300, py: 100, name: "Larkspur" },
    { px: 310, py: 104, name: "Lakeside" },
    { px: 320, py: 98, name: "Meridian" },
  ];
  const out = placeLabels(pts, 700, 300);
  const boxes = out.flatMap((l, i) => (l ? [box(pts[i], l)] : []));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!hit(boxes[i], boxes[j]));
});

test("a point at the right edge does not anchor start past the plot", () => {
  const pts = [{ px: 595, py: 100, name: "Edge Hotel" }];
  const out = placeLabels(pts, 600, 300);
  assert.ok(out[0]);
  assert.notEqual(out[0]!.anchor, "start");
  const b = box(pts[0], out[0]!);
  assert.ok(b.x1 <= 600 && b.x0 >= 0);
});

test("an impossible slot returns null", () => {
  const pts = [{ px: 20, py: 10, name: "A very long property name indeed" }];
  assert.deepEqual(placeLabels(pts, 60, 30), [null]);
});
