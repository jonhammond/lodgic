# TODO

## ADR rate/volume charts (2026-10-15 leftovers)

- [x] `/fn-deploy` the summary prompt change (commit d770fd4); production still runs the old summary prompt. Manual only.

## Visual QA findings (2026-10-15, chart-reviewer)

- [x] Unpinned lines and legend swatches in the multi-property `TrendLineChart` are alpha-dimmed to near-invisible (pastel on white, dim on the dark card); only readable after pinning. Raise the dim floor.
- [ ] `ScoreComboChart` at 360px: x tick labels truncate ("Upper Midsc…"), and the title truncates because the subtitle shares its row. Abbreviate/rotate ticks on narrow; wrap the subtitle onto its own line.
- [ ] Result header at 360px: the "Answer" heading butts against the period/rows meta text with no gap and the meta wraps under it. Add `gap` / `flexWrap` in the header row.
- [ ] Light `GroupedBarChart` ADR green `#16956a` and CPOR amber `#b07f12` have near-identical luminance, so they separate by hue only under deuteranopia/protanopia. Legend, value labels and fixed bar order mitigate; consider a lightness offset.
- [ ] `PropertyTable` at 360px: all property names wrap (two to three lines); collapsed week headers truncate the subtotal ("avg $314.…") because the bar-column slot is fixed-width; Rooms Sold bars are 13–29px so close values (86 vs 97) look identical. Widen the narrow label flex and drop the fixed slot on the narrow group header.
