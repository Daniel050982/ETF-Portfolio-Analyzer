/* DashboardData — zentrale Datenversorgung für Dashboard-Widgets.
   PP-Pendant: name.abuchen.portfolio.ui.views.dashboard.DashboardData.
   Liefert berechnete Werte (Performance-Snapshots, Kategorien, Drawdown,
   Volatilität) für ein gegebenes Reporting-Intervall, gecacht pro Schlüssel. */
import type { Transaktion, Wertpapier, Konto, Depot } from '../../types/portfolio';
import {
  berechneSnapshots, berechneTTWROR, berechneTTWRORAnnualized, berechneIRR,
  berechneVolatilitaet, berechneSemivolatilitaet, berechneMaxDrawdown,
  berechneDrawdownSerie, berechneDrawdownDauer, berechneSnapshotKategorien,
} from '../../core/performance';
import type { DrawdownSerie, DrawdownDauer, SnapshotKategorie } from '../../core/performance';
import type { PortfolioSnapshot } from '../../types/portfolio';

export interface Interval {
  start: Date; // inklusiv
  end: Date;   // inklusiv
}

/* Reporting-Period-Codes (PP ReportingPeriod). Vom Tool unterstützt:
   - "Lx Y0"  → letzte x Jahre (z.B. "L1Y0" = letztes Jahr)
   - "T1"     → letzter Handelstag (1 Tag)
   - "Dn"     → letzte n Tage
   - "ALL"    → gesamter Zeitraum
   - "YTD"    → seit Jahresbeginn
   Speicherung im Widget unter Config-Key REPORTING_PERIOD. */
export function resolveReportingPeriod(code: string | undefined, today: Date, earliest: Date): Interval {
  const end = today;
  if (!code || code === 'ALL') return { start: earliest, end };
  if (code === 'YTD') return { start: new Date(today.getFullYear(), 0, 1), end };
  if (code === 'T1') { const s = new Date(end); s.setDate(s.getDate() - 1); return { start: s, end }; }
  const mYear = /^L(\d+)Y\d*$/.exec(code);
  if (mYear) { const s = new Date(end); s.setFullYear(s.getFullYear() - parseInt(mYear[1], 10)); return { start: s, end }; }
  const mDay = /^[DL](\d+)$/.exec(code);
  if (mDay) { const s = new Date(end); s.setDate(s.getDate() - parseInt(mDay[1], 10)); return { start: s, end }; }
  const mMonth = /^L(\d+)M\d*$/.exec(code);
  if (mMonth) { const s = new Date(end); s.setMonth(s.getMonth() - parseInt(mMonth[1], 10)); return { start: s, end }; }
  return { start: earliest, end };
}

export function reportingPeriodLabel(code: string | undefined): string {
  if (!code || code === 'ALL') return 'Gesamter Zeitraum';
  if (code === 'YTD') return 'Aktuelles Jahr (YTD)';
  if (code === 'T1') return 'Letzter Tag';
  const mYear = /^L(\d+)Y\d*$/.exec(code);
  if (mYear) return mYear[1] === '1' ? 'Letztes Jahr' : `Letzte ${mYear[1]} Jahre`;
  const mMonth = /^L(\d+)M\d*$/.exec(code);
  if (mMonth) return `Letzte ${mMonth[1]} Monate`;
  const mDay = /^[DL](\d+)$/.exec(code);
  if (mDay) return `Letzte ${mDay[1]} Tage`;
  return code;
}

/* Die vordefinierten Berichtszeiträume, die im ReportingPeriod-Konfig-Menü
   angeboten werden (PP DefaultReportingPeriods). */
export const REPORTING_PERIOD_OPTIONS: { code: string; label: string }[] = [
  { code: 'ALL', label: 'Gesamter Zeitraum' },
  { code: 'YTD', label: 'Aktuelles Jahr (YTD)' },
  { code: 'T1', label: 'Letzter Tag' },
  { code: 'D30', label: 'Letzte 30 Tage' },
  { code: 'D90', label: 'Letzte 90 Tage' },
  { code: 'L1M0', label: 'Letzter Monat' },
  { code: 'L3M0', label: 'Letzte 3 Monate' },
  { code: 'L6M0', label: 'Letzte 6 Monate' },
  { code: 'L1Y0', label: 'Letztes Jahr' },
  { code: 'L2Y0', label: 'Letzte 2 Jahre' },
  { code: 'L3Y0', label: 'Letzte 3 Jahre' },
  { code: 'L5Y0', label: 'Letzte 5 Jahre' },
  { code: 'L10Y0', label: 'Letzte 10 Jahre' },
];

export interface DashboardContextData {
  transaktionen: Transaktion[];
  wertpapiere: Record<string, Wertpapier>;
  konten: Record<string, Konto>;
  depots: Record<string, Depot>;
  basisWaehrung: string;
  today: Date;
  earliest: Date;
  defaultReportingPeriod: string; // Dashboard-weiter Default
}

/* Ergebnis aller Kennzahlen für ein Intervall (gecacht). */
export interface PerfResult {
  snapshots: PortfolioSnapshot[];
  ttwror: number;
  ttwrorAnnualized: number;
  irr: number;
  volatilitaet: number;
  semivolatilitaet: number;
  maxDrawdown: number;
  currentDrawdown: number;
  drawdownSerie: DrawdownSerie[];
  drawdownDauer: DrawdownDauer;
  kategorien: SnapshotKategorie[];
  anfangswert: number;
  endwert: number;
  delta: number;
  investiertesKapital: number;
}

export class DashboardCalc {
  private cache = new Map<string, PerfResult>();
  public ctx: DashboardContextData;
  constructor(ctx: DashboardContextData) { this.ctx = ctx; }

  intervalFor(code: string | undefined): Interval {
    return resolveReportingPeriod(code ?? this.ctx.defaultReportingPeriod, this.ctx.today, this.ctx.earliest);
  }

  /* Liefert alle Kennzahlen für ein Reporting-Period-Code. Gecacht. */
  perf(code: string | undefined): PerfResult {
    const key = code ?? this.ctx.defaultReportingPeriod ?? 'ALL';
    const cached = this.cache.get(key);
    if (cached) return cached;

    const interval = this.intervalFor(code);
    const allSnaps = berechneSnapshots(this.ctx.transaktionen, this.ctx.wertpapiere);
    const snapshots = allSnaps.filter(s =>
      s.datum.getTime() >= interval.start.getTime() && s.datum.getTime() <= interval.end.getTime());

    const anfangswert = snapshots.length ? snapshots[0].marktwert : 0;
    const endwert = snapshots.length ? snapshots[snapshots.length - 1].marktwert : 0;
    const investiertesKapital = snapshots.length ? snapshots[snapshots.length - 1].investiert : 0;

    const cashflows: { datum: Date; betrag: number }[] = [];
    for (const tx of this.ctx.transaktionen) {
      const t = tx.datum.getTime();
      if (t < interval.start.getTime() || t > interval.end.getTime()) continue;
      if (tx.typ === 'kauf') cashflows.push({ datum: tx.datum, betrag: -(tx.betrag + tx.gebuehren) });
      else if (tx.typ === 'verkauf') cashflows.push({ datum: tx.datum, betrag: tx.betrag - tx.gebuehren });
      else if (tx.typ === 'dividende' || tx.typ === 'ausschuettung') cashflows.push({ datum: tx.datum, betrag: tx.betrag });
    }
    if (snapshots.length) cashflows.push({ datum: snapshots[snapshots.length - 1].datum, betrag: endwert });

    const drawdownSerie = berechneDrawdownSerie(snapshots);
    const result: PerfResult = {
      snapshots,
      ttwror: round2(berechneTTWROR(snapshots)),
      ttwrorAnnualized: round2(berechneTTWRORAnnualized(snapshots)),
      irr: round2(berechneIRR(cashflows)),
      volatilitaet: round2(berechneVolatilitaet(snapshots)),
      semivolatilitaet: round2(berechneSemivolatilitaet(snapshots)),
      maxDrawdown: round2(berechneMaxDrawdown(snapshots)),
      currentDrawdown: drawdownSerie.length ? drawdownSerie[drawdownSerie.length - 1].drawdown : 0,
      drawdownSerie,
      drawdownDauer: berechneDrawdownDauer(snapshots),
      kategorien: berechneSnapshotKategorien(this.ctx.transaktionen, this.ctx.wertpapiere, interval.start, interval.end),
      anfangswert: round2(anfangswert),
      endwert: round2(endwert),
      delta: round2(endwert - anfangswert),
      investiertesKapital: round2(investiertesKapital),
    };
    this.cache.set(key, result);
    return result;
  }
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
