import { Portfolio } from "../../lib/revparEngine";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency, formatPercent } from "../charts/format";
import { Grid } from "../Grid";
import { KpiCard } from "../KpiCard";

export type RevparOccCardsProps = {
  portfolio: Portfolio;
  /** Portfolio at demandShift 1.0 when the slider is not at 100%, else null (no delta shown). */
  baseline: Portfolio | null;
  /** Per-day portfolio series over the window, oldest first, for the sparklines. */
  series: { occupancy: number[]; adr: number[]; revpar: number[] };
};

const MINUS = "−";
const signed = (v: number, digits: number, fmt: (abs: number) => string, suffix = "") => {
  const r = Math.round(Math.abs(v) * 10 ** digits) / 10 ** digits;
  const sign = r === 0 ? "" : v < 0 ? MINUS : "+";
  return `${sign}${fmt(r)}${suffix}`;
};
const pointsDelta = (cur: number, base: number) => {
  const d = (cur - base) * 100;
  return signed(d, 1, (a) => a.toFixed(1), " pts");
};
const currencyDelta = (cur: number, base: number) => {
  const d = cur - base;
  return signed(d, 2, formatCurrency);
};

export function RevparOccCards({ portfolio, baseline, series }: RevparOccCardsProps) {
  const { t } = useTheme();
  const prior = baseline ? "baseline" : null;
  return (
    <Grid minWidth={220}>
      <KpiCard
        label="Portfolio occupancy"
        value={formatPercent(portfolio.occupancy * 100)}
        delta={baseline ? pointsDelta(portfolio.occupancy, baseline.occupancy) : null}
        priorLabel={prior}
        series={series.occupancy}
        colors={t.kpi.occupancy}
      />
      <KpiCard
        label="Portfolio ADR"
        value={formatCurrency(portfolio.adr)}
        delta={baseline ? currencyDelta(portfolio.adr, baseline.adr) : null}
        priorLabel={prior}
        series={series.adr}
        colors={t.kpi.adr}
      />
      <KpiCard
        label="Portfolio RevPAR"
        value={formatCurrency(portfolio.revpar)}
        delta={baseline ? currencyDelta(portfolio.revpar, baseline.revpar) : null}
        priorLabel={prior}
        series={series.revpar}
        colors={t.kpi.revpar}
      />
    </Grid>
  );
}
