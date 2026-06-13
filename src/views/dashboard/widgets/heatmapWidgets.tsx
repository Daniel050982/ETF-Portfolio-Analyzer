/* Heatmap-Widgets (PP AbstractMonthlyHeatmapWidget-Familie).
   Monatliche Grids: Zeilen = Jahre, Spalten = Jan..Dez + Σ. */
import { HeatmapGrid } from '../widgetBase';
import type { HeatmapModel, HeatmapCell } from '../widgetBase';
import type { WidgetProps } from '../widgetBase';
import { CFG } from '../widgetConfig';
import { euro } from '../../../utils/format';
import { pct2 } from './indicatorWidgets';
import type { Transaktion } from '../../../types/portfolio';

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/* Baut ein monatliches Heatmap-Modell. valueFn liefert pro (jahr, monat) den
   Wert; fmt formatiert die Zelle. */
function buildMonthly(
  interval: { start: Date; end: Date },
  valueFn: (year: number, month: number) => number | null,
  fmt: (v: number) => string,
  withSum: boolean,
): HeatmapModel {
  const startYear = interval.start.getFullYear();
  const endYear = interval.end.getFullYear();
  const rows: HeatmapModel['rows'] = [];
  for (let y = startYear; y <= endYear; y++) {
    const cells: HeatmapCell[] = [];
    let sum = 0; let hasAny = false;
    for (let m = 0; m < 12; m++) {
      const v = valueFn(y, m);
      cells.push({ value: v, text: v === null ? '' : fmt(v) });
      if (v !== null) { sum += v; hasAny = true; }
    }
    if (withSum) cells.push({ value: hasAny ? sum : null, text: hasAny ? fmt(sum) : '' });
    rows.push({ label: String(y), cells });
  }
  return { columnLabels: withSum ? [...MONATE, 'Σ'] : MONATE, rows };
}

/* ── Performance-Heatmap (PP HEATMAP) — Monatsrenditen in % ── */
export function PerformanceHeatmapWidget(p: WidgetProps) {
  const schema = p.widget.configuration[CFG.COLOR_SCHEMA] ?? 'GREEN_RED';
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  const interval = p.calc.intervalFor(p.widget.configuration[CFG.REPORTING_PERIOD]);
  // Marktwert je Monatsende → Monatsrendite
  const monthEnd = new Map<string, number>();
  for (const s of r.snapshots) {
    const key = `${s.datum.getFullYear()}-${s.datum.getMonth()}`;
    monthEnd.set(key, s.marktwert);
  }
  const model = buildMonthly(interval, (y, m) => {
    const cur = monthEnd.get(`${y}-${m}`);
    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    const prev = monthEnd.get(`${prevY}-${prevM}`);
    if (cur === undefined || prev === undefined || prev <= 0) return null;
    return Math.round((cur / prev - 1) * 10000) / 100;
  }, pct2, false);
  return <HeatmapGrid model={model} schema={schema} />;
}

/* ── Jahres-Heatmap (PP HEATMAP_YEARLY) — Jahresrenditen ── */
export function YearlyPerformanceHeatmapWidget(p: WidgetProps) {
  const schema = p.widget.configuration[CFG.COLOR_SCHEMA] ?? 'GREEN_RED';
  const r = p.calc.perf('ALL');
  const yearEnd = new Map<number, number>();
  for (const s of r.snapshots) yearEnd.set(s.datum.getFullYear(), s.marktwert);
  const years = [...yearEnd.keys()].sort();
  const rows = years.map(y => {
    const cur = yearEnd.get(y)!;
    const prev = yearEnd.get(y - 1);
    const v = prev && prev > 0 ? Math.round((cur / prev - 1) * 10000) / 100 : null;
    return { label: String(y), cells: [{ value: v, text: v === null ? '' : pct2(v) }] };
  });
  return <HeatmapGrid model={{ columnLabels: ['Rendite'], rows }} schema={schema} />;
}

/* Generische monatliche Geldbetrag-Heatmap aus gefilterten Transaktionen. */
function moneyHeatmap(p: WidgetProps, pick: (tx: Transaktion) => number | null) {
  const interval = p.calc.intervalFor(p.widget.configuration[CFG.REPORTING_PERIOD]);
  const byKey = new Map<string, number>();
  for (const tx of p.calc.ctx.transaktionen) {
    const t = tx.datum.getTime();
    if (t < interval.start.getTime() || t > interval.end.getTime()) continue;
    const v = pick(tx);
    if (v === null || v === 0) continue;
    const key = `${tx.datum.getFullYear()}-${tx.datum.getMonth()}`;
    byKey.set(key, (byKey.get(key) ?? 0) + v);
  }
  return buildMonthly(interval, (y, m) => {
    const v = byKey.get(`${y}-${m}`);
    return v === undefined ? null : Math.round(v * 100) / 100;
  }, euro, true);
}

/* ── Investitions-Heatmap (PP HEATMAP_INVESTMENTS) ── */
export function InvestmentHeatmapWidget(p: WidgetProps) {
  const schema = p.widget.configuration[CFG.COLOR_SCHEMA] ?? 'GREEN_RED';
  const model = moneyHeatmap(p, tx => {
    if (tx.typ === 'kauf') return tx.betrag + tx.gebuehren;
    if (tx.typ === 'verkauf') return -tx.betrag;
    return null;
  });
  return <HeatmapGrid model={model} schema={schema} />;
}

/* ── Steuer-Heatmap (PP HEATMAP_TAXES) ── */
export function TaxHeatmapWidget(p: WidgetProps) {
  const schema = p.widget.configuration[CFG.COLOR_SCHEMA] ?? 'GREEN_RED';
  const model = moneyHeatmap(p, tx => {
    if (tx.typ === 'steuern_tx') return tx.betrag;
    return tx.steuern || null;
  });
  return <HeatmapGrid model={model} schema={schema} />;
}

/* ── Gebühren-Heatmap (PP HEATMAP_FEES) ── */
export function FeeHeatmapWidget(p: WidgetProps) {
  const schema = p.widget.configuration[CFG.COLOR_SCHEMA] ?? 'GREEN_RED';
  const model = moneyHeatmap(p, tx => {
    if (tx.typ === 'gebuehren') return tx.betrag;
    return tx.gebuehren || null;
  });
  return <HeatmapGrid model={model} schema={schema} />;
}

/* ── Erträge-Heatmap (PP HEATMAP_EARNINGS) ── */
export function EarningsHeatmapWidget(p: WidgetProps) {
  const schema = p.widget.configuration[CFG.COLOR_SCHEMA] ?? 'GREEN_RED';
  const earningType = p.widget.configuration[CFG.EARNING_TYPE] ?? 'EARNINGS';
  const model = moneyHeatmap(p, tx => {
    const isDiv = tx.typ === 'dividende' || tx.typ === 'ausschuettung';
    const isInt = tx.typ === 'zinsen';
    if (earningType === 'DIVIDENDS' && !isDiv) return null;
    if (earningType === 'INTEREST' && !isInt) return null;
    if (!isDiv && !isInt) return null;
    return tx.betrag;
  });
  return <HeatmapGrid model={model} schema={schema} />;
}

/* ── Monatliche performanceneutrale Bewegungen (PP MONTHLY_PN_TRANSFERS) ── */
export function MonthlyPNTransfersWidget(p: WidgetProps) {
  const schema = p.widget.configuration[CFG.COLOR_SCHEMA] ?? 'GREEN_RED';
  const model = moneyHeatmap(p, tx => {
    if (tx.typ === 'einlage' || tx.typ === 'umbuchung_ein') return tx.betrag;
    if (tx.typ === 'entnahme' || tx.typ === 'umbuchung_aus') return -tx.betrag;
    return null;
  });
  return <HeatmapGrid model={model} schema={schema} />;
}
