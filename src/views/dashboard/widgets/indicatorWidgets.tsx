/* Indikator-/Kennzahl-Widgets (PP AbstractIndicatorWidget-Familie). */
import { useState } from 'react';
import { euro, datumKurz } from '../../../utils/format';
import { IndicatorBody, HeadingBody, LEER } from '../widgetBase';
import type { WidgetProps } from '../widgetBase';
import { CFG } from '../widgetConfig';

/* PP Values.Percent2: 2 Nachkommastellen mit Vorzeichen-Steuerung über Farbe. */
export function pct2(v: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' %';
}
function coloredSign(v: number): 'pos' | 'neg' | null {
  if (v > 0.0001) return 'pos';
  if (v < -0.0001) return 'neg';
  return null;
}

/* ── Performance-Indikatoren (Prozent) ── */
export function TtwrorWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return <IndicatorBody title={p.widget.label} value={pct2(r.ttwror)} colored={coloredSign(r.ttwror)} />;
}
export function TtwrorAnnualizedWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return <IndicatorBody title={p.widget.label} value={pct2(r.ttwrorAnnualized)} colored={coloredSign(r.ttwrorAnnualized)} />;
}
export function IrrWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return <IndicatorBody title={p.widget.label} value={pct2(r.irr)} colored={coloredSign(r.irr)} />;
}
export function VolatilityWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return <IndicatorBody title={p.widget.label} value={pct2(r.volatilitaet)} />;
}
export function SemiVolatilityWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return <IndicatorBody title={p.widget.label} value={pct2(r.semivolatilitaet)} />;
}
export function MaxDrawdownWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return <IndicatorBody title={p.widget.label} value={pct2(-Math.abs(r.maxDrawdown))} colored="neg" />;
}
export function CurrentDrawdownWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return <IndicatorBody title={p.widget.label} value={pct2(r.currentDrawdown)} colored={coloredSign(r.currentDrawdown)} />;
}

/* ── Vermögens-Indikatoren (Währung) ── */
export function TotalSumWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return <IndicatorBody title={p.widget.label} value={euro(r.endwert)} />;
}
export function AbsoluteChangeWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return <IndicatorBody title={p.widget.label} value={euro(r.delta)} colored={coloredSign(r.delta)} />;
}
export function DeltaWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return <IndicatorBody title={p.widget.label} value={euro(r.delta)} colored={coloredSign(r.delta)} />;
}
export function AbsoluteDeltaWidget(p: WidgetProps) {
  const r = p.calc.perf('ALL');
  return <IndicatorBody title={p.widget.label} value={euro(r.delta)} colored={coloredSign(r.delta)} />;
}
export function InvestedCapitalWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return <IndicatorBody title={p.widget.label} value={euro(r.investiertesKapital)} />;
}
export function AbsoluteInvestedCapitalWidget(p: WidgetProps) {
  const r = p.calc.perf('ALL');
  return <IndicatorBody title={p.widget.label} value={euro(r.investiertesKapital)} />;
}
export function AllTimeHighWidget(p: WidgetProps) {
  const r = p.calc.perf('ALL');
  const ath = r.snapshots.reduce((m, s) => Math.max(m, s.marktwert), 0);
  return <IndicatorBody title={p.widget.label} value={euro(ath)} />;
}
export function SavingsWidget(p: WidgetProps) {
  // Performanceneutrale Bewegungen = Ein-/Auslieferungen + Ein-/Auszahlungen
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  const interval = p.calc.intervalFor(p.widget.configuration[CFG.REPORTING_PERIOD]);
  let sum = 0;
  for (const tx of p.calc.ctx.transaktionen) {
    const t = tx.datum.getTime();
    if (t < interval.start.getTime() || t > interval.end.getTime()) continue;
    if (tx.typ === 'einlage' || tx.typ === 'umbuchung_ein') sum += tx.betrag;
    else if (tx.typ === 'entnahme' || tx.typ === 'umbuchung_aus') sum -= tx.betrag;
  }
  void r;
  return <IndicatorBody title={p.widget.label} value={euro(sum)} colored={coloredSign(sum)} />;
}

/* ── Sonstige Indikatoren ── */
export function CurrentDateWidget(p: WidgetProps) {
  const heute = p.calc.ctx.today;
  return (
    <div style={{ padding: '4px 6px' }}>
      <span className="text-[12px]" style={{ color: 'var(--pp-text)' }}>
        {p.widget.label} {heute.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
      </span>
    </div>
  );
}

export function HeadingWidget(p: WidgetProps) {
  return <HeadingBody text={p.widget.label} />;
}

export function DescriptionWidget(p: WidgetProps) {
  return (
    <div style={{ padding: '6px' }}>
      <span className="text-[11px] whitespace-pre-wrap" style={{ color: 'var(--pp-text-secondary)' }}>{p.widget.label}</span>
    </div>
  );
}

export function VerticalSpacerWidget(p: WidgetProps) {
  const h = parseInt(p.widget.configuration[CFG.HEIGHT] ?? '20', 10);
  return <div style={{ height: Math.max(5, h) }} />;
}

/* PP RatioWidget: Verhältnis Endwert / investiertes Kapital (vereinfachtes
   PP-Verhältnis zweier Datenreihen am Periodenende). */
export function RatioWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  const ratio = r.investiertesKapital > 0 ? (r.endwert / r.investiertesKapital) * 100 : null;
  return <IndicatorBody title={p.widget.label} value={ratio === null ? LEER : pct2(ratio)} />;
}

/* PP MaxDrawdownDurationWidget. */
export function MaxDrawdownDurationWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  const d = r.drawdownDauer;
  const text = d.maxDrawdownDauerTage > 0 ? `${d.maxDrawdownDauerTage} Tage${d.bisPeriodenende ? '+' : ''}` : LEER;
  return <IndicatorBody title={p.widget.label} value={text} />;
}

/* PP PortfolioTaxOrFeeRateWidget — Steuer-/Gebührenquote. */
export function PortfolioTaxRateWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  const steuern = r.kategorien.find(k => k.typ === 'steuern')?.betrag ?? 0;
  const rate = r.endwert > 0 ? (steuern / r.endwert) * 100 : null;
  return <IndicatorBody title={p.widget.label} value={rate === null ? LEER : pct2(rate)} />;
}
export function PortfolioFeeRateWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  const geb = r.kategorien.find(k => k.typ === 'gebuehren')?.betrag ?? 0;
  const rate = r.endwert > 0 ? (geb / r.endwert) * 100 : null;
  return <IndicatorBody title={p.widget.label} value={rate === null ? LEER : pct2(rate)} />;
}

/* PP PerformanceCalculationWidget — Aufschlüsselung Anfangs-→Endwert. */
export function PerformanceCalculationWidget(p: WidgetProps) {
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  const reduced = (p.widget.configuration[CFG.LAYOUT] ?? 'FULL') === 'REDUCED';
  let rows = r.kategorien;
  if (reduced) rows = rows.filter(k => k.typ === 'anfangswert' || k.typ === 'gewinne' || k.typ === 'erträge' || k.typ === 'endwert');
  return (
    <div style={{ padding: '4px 6px' }}>
      <table style={{ width: '100%', fontSize: 11 }}>
        <tbody>
          {rows.map((k, i) => {
            const head = k.typ === 'anfangswert' || k.typ === 'endwert';
            return (
              <tr key={i} style={head ? { fontWeight: 600 } : undefined}>
                <td style={{ width: 14, color: 'var(--pp-text-muted)' }}>{k.vorzeichen === '=' ? '' : k.vorzeichen}</td>
                <td style={{ color: 'var(--pp-text-secondary)' }}>{k.label}</td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--pp-text)' }}>{euro(k.betrag)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* PP FIREWidget — finanzielle Unabhängigkeit. */
export function FireWidget(p: WidgetProps) {
  const cfg = p.widget.configuration;
  const fireNumber = parseFloat(cfg[CFG.FIRE_NUMBER] ?? '1500000');
  const monthly = parseFloat(cfg[CFG.FIRE_MONTHLY_SAVINGS] ?? '500');
  const returns = parseFloat(cfg[CFG.FIRE_RETURNS] ?? '0.07');
  const r = p.calc.perf('L1Y0');
  const current = r.endwert;

  // Zeit bis FIRE (Future-Value-Formel, monatlich)
  let timeToFire = NaN;
  if (current >= fireNumber) timeToFire = 0;
  else if (monthly > 0 || current > 0) {
    const rMonthly = Math.pow(1 + returns, 1 / 12) - 1;
    if (Math.abs(rMonthly) < 1e-9) {
      timeToFire = monthly > 0 ? ((fireNumber - current) / monthly) / 12 : NaN;
    } else {
      // FV = PV(1+r)^n + PMT[((1+r)^n -1)/r] → nach n auflösen via Iteration
      let lo = 0, hi = 600;
      for (let i = 0; i < 80; i++) {
        const n = (lo + hi) / 2;
        const fv = current * Math.pow(1 + rMonthly, n) + monthly * ((Math.pow(1 + rMonthly, n) - 1) / rMonthly);
        if (fv < fireNumber) lo = n; else hi = n;
      }
      timeToFire = ((lo + hi) / 2) / 12;
    }
  }

  const heute = p.calc.ctx.today;
  let zielDatum = LEER;
  if (isFinite(timeToFire) && timeToFire >= 0 && timeToFire < 50) {
    const d = new Date(heute); d.setDate(d.getDate() + Math.round(timeToFire * 365.25));
    zielDatum = datumKurz(d);
  }
  const timeText = !isFinite(timeToFire) ? LEER : timeToFire >= 50 ? '50+ Jahre' : timeToFire === 0 ? 'FIRE erreicht!' : `${timeToFire.toFixed(1)} Jahre`;

  return (
    <div style={{ padding: '4px 6px' }}>
      <span className="text-[11px]" style={{ color: 'var(--pp-text-secondary)' }}>{p.widget.label}</span>
      <table style={{ width: '100%', fontSize: 11, marginTop: 2 }}>
        <tbody>
          <Row label="Aktuelles Nettovermögen" value={euro(current)} />
          <Row label="FIRE-Zahl" value={euro(fireNumber)} />
          <Row label="Gesch. monatliche Sparrate" value={euro(monthly)} />
          <Row label="Gesch. Rendite" value={pct2(returns * 100)} />
          <Row label="Zeit bis FIRE" value={timeText} bold />
          <Row label="FIRE-Datum" value={zielDatum} bold />
        </tbody>
      </table>
    </div>
  );
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr style={bold ? { fontWeight: 600 } : undefined}>
      <td style={{ color: 'var(--pp-text-secondary)' }}>{label}</td>
      <td className="mono" style={{ textAlign: 'right', color: 'var(--pp-text)' }}>{value}</td>
    </tr>
  );
}

/* PP ExchangeRateWidget — vereinfacht: zeigt den letzten Kurs eines
   Wechselkurs-Wertpapiers (isExchangeRate). */
export function ExchangeRateWidget(p: WidgetProps) {
  const wp = Object.values(p.calc.ctx.wertpapiere).find(w => w.isExchangeRate);
  const value = wp?.letzterKurs ? `${wp.waehrung}/${wp.targetCurrencyCode ?? ''} ${wp.letzterKurs.toFixed(4)}` : LEER;
  return <IndicatorBody title={p.widget.label} value={value} />;
}

/* PP CollapsibleSectionWidget — klappbarer Abschnitt. */
export function CollapsibleSectionWidget(p: WidgetProps) {
  const [open, setOpen] = useState((p.widget.configuration[CFG.COLLAPSED] ?? 'false') !== 'true');
  return (
    <div style={{ padding: '8px 6px 4px' }} className="flex items-center gap-1 cursor-pointer"
      onClick={() => { const next = !open; setOpen(next); p.setConfig(CFG.COLLAPSED, next ? 'false' : 'true'); }}>
      <span style={{ fontSize: 10, color: 'var(--pp-text-muted)' }}>{open ? '▼' : '▶'}</span>
      <span className="text-[13px] font-bold" style={{ color: 'var(--pp-heading, var(--pp-accent))' }}>{p.widget.label}</span>
    </div>
  );
}
