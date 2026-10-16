/**
 * Indices of ticks to keep so labels do not overlap. First label is start-anchored, last end-anchored,
 * others centred. Tries stride k = 1.. over {0,k,2k,..} + last; falls back to [first, last].
 */
export function fitTicksByWidth(ticks: number[], widths: number[], plotW: number, gap: number): number[] {
  const n = ticks.length;
  const all = ticks.map((_, i) => i);
  if (n < 3 || plotW <= 0) return all;
  const t0 = ticks[0];
  const span = ticks[n - 1] - t0;
  if (span === 0) return all;
  const box = (i: number) => {
    const x = (plotW * (ticks[i] - t0)) / span;
    const w = widths[i];
    return i === 0 ? [x, x + w] : i === n - 1 ? [x - w, x] : [x - w / 2, x + w / 2];
  };
  for (let k = 1; k < n; k++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i += k) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    let ok = true;
    for (let j = 0; j + 1 < idx.length && ok; j++) ok = box(idx[j])[1] + gap <= box(idx[j + 1])[0];
    if (ok) return idx;
  }
  return [0, n - 1];
}
