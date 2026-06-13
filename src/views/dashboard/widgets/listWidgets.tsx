/* Listen-, Trades- und Earnings-Widgets. */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { euro, datumKurz } from '../../../utils/format';
import { getColor, ColorMarker } from '../../../components/PPElements';
import { IndicatorBody, ListBody, LEER } from '../widgetBase';
import type { WidgetProps } from '../widgetBase';
import { CFG } from '../widgetConfig';
import { pct2 } from './indicatorWidgets';
import { berechneSteuerPositionen } from '../../../core/fifo';
import type { SteuerPosition, Transaktion } from '../../../types/portfolio';

const TT_STYLE = { fontSize: '11px', background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' };

/* Geschlossene Trades im Intervall (FIFO). */
function tradesInInterval(p: WidgetProps): SteuerPosition[] {
  const interval = p.calc.intervalFor(p.widget.configuration[CFG.REPORTING_PERIOD]);
  return berechneSteuerPositionen(p.calc.ctx.transaktionen)
    .filter(t => t.verkaufDatum.getTime() >= interval.start.getTime() && t.verkaufDatum.getTime() <= interval.end.getTime());
}

/* ── Top Contributors (Wert) — Beitrag pro WP zum Gewinn ── */
export function TopContributorsWidget(p: WidgetProps) {
  const count = parseInt(p.widget.configuration[CFG.COUNT] ?? '3', 10);
  const beitraege = Object.values(p.calc.ctx.wertpapiere)
    .filter(wp => wp.bestand > 0 && wp.unrealisierterGewinn != null)
    .map(wp => ({ name: wp.name, key: wp.isin || wp.name, value: wp.unrealisierterGewinn ?? 0 }))
    .sort((a, b) => b.value - a.value);
  if (beitraege.length === 0) return <ListBody empty>{null}</ListBody>;
  const top = beitraege.slice(0, count);
  const bottom = beitraege.slice(-count).filter(b => !top.includes(b));
  return (
    <ListBody>
      <span className="text-[10px] px-1" style={{ color: 'var(--pp-text-muted)' }}>{p.widget.label}</span>
      {top.map(b => <ContribRow key={b.key} {...b} />)}
      {bottom.length > 0 && <div style={{ borderTop: '1px solid var(--pp-border)', margin: '2px 0' }} />}
      {bottom.map(b => <ContribRow key={b.key} {...b} />)}
    </ListBody>
  );
}
/* ── Top Performer (TTWROR) ── */
export function TopContributorsReturnWidget(p: WidgetProps) {
  const count = parseInt(p.widget.configuration[CFG.COUNT] ?? '3', 10);
  const perf = Object.values(p.calc.ctx.wertpapiere)
    .filter(wp => wp.bestand > 0 && wp.unrealisierterGewinnProzent != null)
    .map(wp => ({ name: wp.name, key: wp.isin || wp.name, value: wp.unrealisierterGewinnProzent ?? 0 }))
    .sort((a, b) => b.value - a.value);
  if (perf.length === 0) return <ListBody empty>{null}</ListBody>;
  const top = perf.slice(0, count);
  const bottom = perf.slice(-count).filter(b => !top.includes(b));
  return (
    <ListBody>
      <span className="text-[10px] px-1" style={{ color: 'var(--pp-text-muted)' }}>{p.widget.label}</span>
      {top.map(b => <ContribRow key={b.key} {...b} pct />)}
      {bottom.length > 0 && <div style={{ borderTop: '1px solid var(--pp-border)', margin: '2px 0' }} />}
      {bottom.map(b => <ContribRow key={b.key} {...b} pct />)}
    </ListBody>
  );
}
function ContribRow({ name, key, value, pct }: { name: string; key: string; value: number; pct?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-1 py-[1px] text-[11px]">
      <ColorMarker color={getColor(key)} />
      <span className="flex-1 truncate" style={{ color: 'var(--pp-text)' }}>{name}</span>
      <span className="mono" style={{ color: value >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>
        {pct ? pct2(value) : euro(value)}
      </span>
    </div>
  );
}

/* ── Trades: Anzahl mit Gewinn/Verlust (PP TRADES_BASIC_STATISTICS) ── */
export function TradesWidget(p: WidgetProps) {
  const trades = tradesInInterval(p);
  const gewinn = trades.filter(t => t.gewinn > 0).length;
  const verlust = trades.filter(t => t.gewinn < 0).length;
  return (
    <div style={{ padding: '4px 6px' }}>
      <span className="text-[11px]" style={{ color: 'var(--pp-text-secondary)' }}>{p.widget.label}</span>
      <div className="text-[18px] font-semibold mono" style={{ color: 'var(--pp-text)' }}>
        {trades.length}{' '}
        <span style={{ color: 'var(--pp-green-text)', fontSize: 13 }}>↑{gewinn}</span>{' '}
        <span style={{ color: 'var(--pp-red-text)', fontSize: 13 }}>↓{verlust}</span>
      </div>
    </div>
  );
}
/* ── Trades: Gewinn/Verlust-Summe (PP TRADES_PROFIT_LOSS) ── */
export function TradesProfitLossWidget(p: WidgetProps) {
  const trades = tradesInInterval(p);
  const sum = trades.reduce((s, t) => s + t.gewinn, 0);
  return <IndicatorBody title={p.widget.label} value={euro(sum)} colored={sum > 0 ? 'pos' : sum < 0 ? 'neg' : null} />;
}
/* ── Trades: mittlere Haltedauer (PP TRADES_AVERAGE_HOLDING_PERIOD) ── */
export function TradesAverageHoldingPeriodWidget(p: WidgetProps) {
  const metric = p.widget.configuration[CFG.METRIC] ?? 'DAY';
  const trades = tradesInInterval(p);
  if (trades.length === 0) return <IndicatorBody title={p.widget.label} value={LEER} />;
  const totalVal = trades.reduce((s, t) => s + t.kaufkurs * t.stueck, 0);
  const avgDays = totalVal > 0
    ? trades.reduce((s, t) => s + t.haltedauerTage * (t.kaufkurs * t.stueck), 0) / totalVal
    : trades.reduce((s, t) => s + t.haltedauerTage, 0) / trades.length;
  const text = metric === 'YEAR' ? `${(avgDays / 365).toFixed(1)} Jahre` : `${Math.round(avgDays)} Tage`;
  return <IndicatorBody title={p.widget.label} value={text} />;
}
/* ── Portfolio Turnover Rate (PP TRADES_TURNOVER_RATIO) ── */
export function TradesTurnoverWidget(p: WidgetProps) {
  const interval = p.calc.intervalFor(p.widget.configuration[CFG.REPORTING_PERIOD]);
  let umsatz = 0;
  for (const tx of p.calc.ctx.transaktionen) {
    const t = tx.datum.getTime();
    if (t < interval.start.getTime() || t > interval.end.getTime()) continue;
    if (tx.typ === 'kauf' || tx.typ === 'verkauf') umsatz += tx.betrag;
  }
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  const rate = r.endwert > 0 ? (umsatz / 2 / r.endwert) * 100 : null;
  return <IndicatorBody title={p.widget.label} value={rate === null ? LEER : pct2(rate)} />;
}

/* ── Anstehende Dividenden (PP DIVIDEND_EVENT_LIST) ── */
export function DividendListWidget(p: WidgetProps) {
  // Letzte Dividenden-Buchungen als Annäherung an anstehende Ereignisse
  const divs = p.calc.ctx.transaktionen
    .filter(tx => tx.typ === 'dividende' || tx.typ === 'ausschuettung')
    .sort((a, b) => b.datum.getTime() - a.datum.getTime())
    .slice(0, 15);
  if (divs.length === 0) return <ListBody empty>{null}</ListBody>;
  return (
    <ListBody>
      {divs.map(d => (
        <div key={d.id} className="flex items-center gap-1.5 px-1 py-[1px] text-[11px]">
          <ColorMarker color={getColor(d.isin || d.wertpapierName)} />
          <span className="flex-1 truncate" style={{ color: 'var(--pp-text)' }}>{d.wertpapierName}</span>
          <span style={{ color: 'var(--pp-text-muted)', fontSize: 10 }}>{datumKurz(d.datum)}</span>
          <span className="mono" style={{ color: 'var(--pp-green-text)' }}>{euro(d.betrag)}</span>
        </div>
      ))}
    </ListBody>
  );
}

/* ── Event-Liste (PP EVENT_LIST) — Käufe/Verkäufe/Dividenden chronologisch ── */
export function EventListWidget(p: WidgetProps) {
  const interval = p.calc.intervalFor(p.widget.configuration[CFG.REPORTING_PERIOD]);
  const events = p.calc.ctx.transaktionen
    .filter(tx => { const t = tx.datum.getTime(); return t >= interval.start.getTime() && t <= interval.end.getTime(); })
    .sort((a, b) => b.datum.getTime() - a.datum.getTime())
    .slice(0, 20);
  if (events.length === 0) return <ListBody empty>{null}</ListBody>;
  return (
    <ListBody>
      {events.map(e => (
        <div key={e.id} className="flex items-center gap-1.5 px-1 py-[1px] text-[11px]">
          <span style={{ color: 'var(--pp-text-muted)', fontSize: 10, width: 64 }}>{datumKurz(e.datum)}</span>
          <span className="flex-1 truncate" style={{ color: 'var(--pp-text)' }}>{e.wertpapierName || e.typ}</span>
          <span style={{ color: 'var(--pp-text-muted)' }}>{e.typ}</span>
        </div>
      ))}
    </ListBody>
  );
}

/* ── Limit-/Follow-Up-Listen (ohne Kursalarm-Daten: Leerdarstellung) ── */
export function LimitExceededWidget(p: WidgetProps) {
  void p; return <ListBody empty>{null}</ListBody>;
}
export function FollowUpWidget(p: WidgetProps) {
  void p; return <ListBody empty>{null}</ListBody>;
}

/* ── Erträge pro Jahr/Quartal/Monat (PP EARNINGS_PER_*_CHART) ── */
function earningsBuckets(p: WidgetProps, granularity: 'year' | 'quarter' | 'month') {
  const earningType = p.widget.configuration[CFG.EARNING_TYPE] ?? 'EARNINGS';
  const startYear = parseInt(p.widget.configuration[CFG.START_YEAR] ?? String(p.calc.ctx.today.getFullYear() - 10), 10);
  const pick = (tx: Transaktion): number | null => {
    const isDiv = tx.typ === 'dividende' || tx.typ === 'ausschuettung';
    const isInt = tx.typ === 'zinsen';
    if (earningType === 'DIVIDENDS' && !isDiv) return null;
    if (earningType === 'INTEREST' && !isInt) return null;
    if (!isDiv && !isInt) return null;
    return tx.betrag;
  };
  const map = new Map<string, number>();
  for (const tx of p.calc.ctx.transaktionen) {
    if (tx.datum.getFullYear() < startYear) continue;
    const v = pick(tx);
    if (v === null) continue;
    let key: string;
    if (granularity === 'year') key = String(tx.datum.getFullYear());
    else if (granularity === 'quarter') key = `${tx.datum.getFullYear()} Q${Math.floor(tx.datum.getMonth() / 3) + 1}`;
    else key = `${tx.datum.getFullYear()}-${String(tx.datum.getMonth() + 1).padStart(2, '0')}`;
    map.set(key, (map.get(key) ?? 0) + v);
  }
  return [...map.entries()].sort().map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
}
function EarningsChart(p: WidgetProps, granularity: 'year' | 'quarter' | 'month') {
  const h = parseInt(p.widget.configuration[CFG.HEIGHT] ?? '140', 10);
  const data = earningsBuckets(p, granularity);
  if (data.length === 0) return <div className="flex items-center justify-center text-[11px]" style={{ height: h, color: 'var(--pp-text-muted)' }}>Keine Erträge.</div>;
  return (
    <div style={{ padding: '4px', height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
          {(p.widget.configuration[CFG.SHOW_Y_AXIS] ?? 'true') === 'true' && <YAxis tickFormatter={(v: number) => euro(v)} tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} width={60} />}
          <Tooltip formatter={(v) => euro(v as number)} contentStyle={TT_STYLE} />
          <Bar dataKey="value" fill="var(--pp-accent)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function EarningsPerYearWidget(p: WidgetProps) { return EarningsChart(p, 'year'); }
export function EarningsPerQuarterWidget(p: WidgetProps) { return EarningsChart(p, 'quarter'); }
export function EarningsPerMonthWidget(p: WidgetProps) { return EarningsChart(p, 'month'); }

/* ── Übersicht der Transaktionen (PP EARNINGS list) ── */
export function EarningsListWidget(p: WidgetProps) {
  const earningType = p.widget.configuration[CFG.EARNING_TYPE] ?? 'EARNINGS';
  const events = p.calc.ctx.transaktionen
    .filter(tx => {
      const isDiv = tx.typ === 'dividende' || tx.typ === 'ausschuettung';
      const isInt = tx.typ === 'zinsen';
      if (earningType === 'DIVIDENDS') return isDiv;
      if (earningType === 'INTEREST') return isInt;
      return isDiv || isInt;
    })
    .sort((a, b) => b.datum.getTime() - a.datum.getTime())
    .slice(0, 25);
  if (events.length === 0) return <ListBody empty>{null}</ListBody>;
  return (
    <ListBody>
      {events.map(e => (
        <div key={e.id} className="flex items-center gap-1.5 px-1 py-[1px] text-[11px]">
          <span style={{ color: 'var(--pp-text-muted)', fontSize: 10, width: 64 }}>{datumKurz(e.datum)}</span>
          <span className="flex-1 truncate" style={{ color: 'var(--pp-text)' }}>{e.wertpapierName || (e.typ === 'zinsen' ? 'Zinsen' : 'Ertrag')}</span>
          <span className="mono" style={{ color: 'var(--pp-green-text)' }}>{euro(e.betrag)}</span>
        </div>
      ))}
    </ListBody>
  );
}

/* ── Erträge nach Klassifikation (PP EARNINGS_BY_TAXONOMY) — nach WP-Typ ── */
export function EarningsByTaxonomyWidget(p: WidgetProps) {
  const h = parseInt(p.widget.configuration[CFG.HEIGHT] ?? '140', 10);
  const byTyp = new Map<string, number>();
  for (const tx of p.calc.ctx.transaktionen) {
    if (tx.typ !== 'dividende' && tx.typ !== 'ausschuettung' && tx.typ !== 'zinsen') continue;
    const wp = p.calc.ctx.wertpapiere[tx.isin] ?? p.calc.ctx.wertpapiere[tx.wertpapierName];
    const typ = wp?.typ ?? 'Sonstige';
    byTyp.set(typ, (byTyp.get(typ) ?? 0) + tx.betrag);
  }
  const data = [...byTyp.entries()].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
  if (data.length === 0) return <div className="flex items-center justify-center text-[11px]" style={{ height: h, color: 'var(--pp-text-muted)' }}>Keine Erträge.</div>;
  return (
    <div style={{ padding: '4px', height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
          <XAxis type="number" tickFormatter={(v: number) => euro(v)} tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} width={70} />
          <Tooltip formatter={(v) => euro(v as number)} contentStyle={TT_STYLE} />
          <Bar dataKey="value" fill="var(--pp-accent)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
