/* Chart-Widgets (PP ChartWidget-Familie). Nutzen recharts. */
import { AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { euro, datumKurz } from '../../../utils/format';
import { getColor, FALLBACK_PALETTE } from '../../../components/PPElements';
import { LEER } from '../widgetBase';
import type { WidgetProps } from '../widgetBase';
import { CFG } from '../widgetConfig';
import { pct2 } from './indicatorWidgets';

function chartHeight(p: WidgetProps): number {
  return parseInt(p.widget.configuration[CFG.HEIGHT] ?? '140', 10);
}
function showY(p: WidgetProps): boolean {
  return (p.widget.configuration[CFG.SHOW_Y_AXIS] ?? 'true') === 'true';
}
const GRID = <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />;
const TT_STYLE = { fontSize: '11px', background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' };
const xTick = { fontSize: 9, fill: 'var(--pp-text-muted)' };
const yTick = { fontSize: 9, fill: 'var(--pp-text-muted)' };

function emptyBox(label: string, h: number) {
  return <div className="flex items-center justify-center text-[11px]" style={{ height: h, color: 'var(--pp-text-muted)' }}>{label}</div>;
}

/* ── Vermögens-Diagramm (PP ASSET_CHART) — Marktwert über Zeit ── */
export function AssetChartWidget(p: WidgetProps) {
  const h = chartHeight(p);
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  if (r.snapshots.length === 0) return emptyBox('Keine Daten.', h);
  const data = r.snapshots.map(s => ({ datum: datumKurz(s.datum), marktwert: s.marktwert, investiert: s.investiert }));
  return (
    <div style={{ padding: '4px 4px', height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey="datum" tick={xTick} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
          {showY(p) && <YAxis tickFormatter={(v: number) => euro(v)} tick={yTick} tickLine={false} width={70} />}
          <Tooltip formatter={(v) => euro(v as number)} contentStyle={TT_STYLE} />
          <Area type="stepAfter" dataKey="investiert" stroke="#6fc5ee" strokeWidth={1.2} fill="#6fc5ee" fillOpacity={0.08} />
          <Area type="monotone" dataKey="marktwert" stroke="var(--pp-accent)" strokeWidth={1.5} fill="var(--pp-accent)" fillOpacity={0.1} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Performance-Diagramm (PP CHART, UseCase.PERFORMANCE) — TTWROR über Zeit ── */
export function PerformanceChartWidget(p: WidgetProps) {
  const h = chartHeight(p);
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  if (r.snapshots.length === 0) return emptyBox('Keine Daten.', h);
  const base = r.snapshots[0].marktwert;
  let acc = 1; let prev = base;
  const data = r.snapshots.map(s => {
    if (prev > 0) acc *= s.marktwert / prev;
    prev = s.marktwert;
    return { datum: datumKurz(s.datum), perf: Math.round((acc - 1) * 10000) / 100 };
  });
  return (
    <div style={{ padding: '4px 4px', height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey="datum" tick={xTick} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
          {showY(p) && <YAxis tickFormatter={(v: number) => `${v} %`} tick={yTick} tickLine={false} width={50} />}
          <Tooltip formatter={(v) => pct2(v as number)} contentStyle={TT_STYLE} />
          <Line type="monotone" dataKey="perf" stroke="var(--pp-accent)" strokeWidth={1.6} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Drawdown-Diagramm (PP DRAWDOWN_CHART) — Fläche, rot ── */
export function DrawdownChartWidget(p: WidgetProps) {
  const h = chartHeight(p);
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  if (r.drawdownSerie.length === 0) return emptyBox('Keine Daten.', h);
  const data = r.drawdownSerie.map(d => ({ datum: datumKurz(d.datum), dd: d.drawdown }));
  return (
    <div style={{ padding: '4px 4px', height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey="datum" tick={xTick} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
          {showY(p) && <YAxis tickFormatter={(v: number) => `${v} %`} tick={yTick} tickLine={false} width={50} />}
          <Tooltip formatter={(v) => pct2(v as number)} contentStyle={TT_STYLE} />
          <Area type="monotone" dataKey="dd" stroke="#e53935" strokeWidth={1.2} fill="#e53935" fillOpacity={0.15} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Bestand-Donut (PP HOLDINGS_CHART) — aktuelle Positionen ── */
export function HoldingsChartWidget(p: WidgetProps) {
  const h = chartHeight(p);
  const positionen = Object.values(p.calc.ctx.wertpapiere)
    .filter(wp => wp.bestand > 0)
    .map(wp => ({ name: wp.name, key: wp.isin || wp.name, value: wp.marktwert ?? wp.investiert }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value);
  if (positionen.length === 0) return emptyBox('Keine Positionen.', h);
  return (
    <div style={{ padding: '4px', height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={positionen} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={1}>
            {positionen.map((pos) => <Cell key={pos.key} fill={getColor(pos.key)} />)}
          </Pie>
          <Tooltip formatter={(v) => euro(v as number)} contentStyle={TT_STYLE} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Klassifizierungen-Donut (PP TAXONOMY_CHART) ── */
export function TaxonomyChartWidget(p: WidgetProps) {
  const h = chartHeight(p);
  const tax = p.calc.ctx;
  // Erste Taxonomie nutzen, sonst nach Wertpapier-Typ gruppieren
  const taxonomien = (p as unknown as { taxonomien?: unknown });
  void taxonomien; void tax;
  // Gruppierung nach Wertpapier-Typ als Standard-Klassifizierung
  const byTyp = new Map<string, number>();
  for (const wp of Object.values(p.calc.ctx.wertpapiere)) {
    if (wp.bestand <= 0) continue;
    const v = wp.marktwert ?? wp.investiert;
    if (v > 0) byTyp.set(wp.typ, (byTyp.get(wp.typ) ?? 0) + v);
  }
  const data = [...byTyp.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  if (data.length === 0) return emptyBox('Keine Daten.', h);
  return (
    <div style={{ padding: '4px', height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={1}>
            {data.map((d, i) => <Cell key={d.name} fill={FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => euro(v as number)} contentStyle={TT_STYLE} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Rebalancing-Donut (Zielwerte) — ohne Zieldaten: Leerdarstellung ── */
export function RebalancingTargetChartWidget(p: WidgetProps) {
  return emptyBox(LEER, chartHeight(p));
}
/* ── Rebalancing-Balken (Ist vs. Ziel) — ohne Zieldaten: Leerdarstellung ── */
export function RebalancingChartWidget(p: WidgetProps) {
  return emptyBox(LEER, chartHeight(p));
}

/* ── Abgeleitete Datenreihen (PP CLIENT_DATA_SERIES_CHART) ──
   Linien: Gesamtsumme + investiertes Kapital über Zeit. */
export function ClientDataSeriesChartWidget(p: WidgetProps) {
  const h = chartHeight(p);
  const r = p.calc.perf(p.widget.configuration[CFG.REPORTING_PERIOD]);
  if (r.snapshots.length === 0) return emptyBox('Keine Daten.', h);
  const data = r.snapshots.map(s => ({ datum: datumKurz(s.datum), gesamt: s.marktwert, investiert: s.investiert, delta: s.gewinn }));
  return (
    <div style={{ padding: '4px', height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey="datum" tick={xTick} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
          {showY(p) && <YAxis tickFormatter={(v: number) => euro(v)} tick={yTick} tickLine={false} width={70} />}
          <Tooltip formatter={(v) => euro(v as number)} contentStyle={TT_STYLE} />
          <Line type="monotone" dataKey="gesamt" stroke="#000" strokeWidth={1.4} dot={false} />
          <Line type="monotone" dataKey="investiert" stroke="#ebc934" strokeWidth={1.2} dot={false} />
          <Line type="monotone" dataKey="delta" stroke="#2196f3" strokeWidth={1.2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Handelsaktivität (PP ACTIVITY_CHART) — Käufe/Verkäufe pro Monat ── */
export function ActivityWidget(p: WidgetProps) {
  const h = chartHeight(p);
  const filter = p.widget.configuration[CFG.TRANSACTION_FILTER] ?? 'ALL';
  const interval = p.calc.intervalFor(p.widget.configuration[CFG.REPORTING_PERIOD]);
  const byMonth = new Map<string, { kauf: number; verkauf: number }>();
  for (const tx of p.calc.ctx.transaktionen) {
    if (tx.typ !== 'kauf' && tx.typ !== 'verkauf') continue;
    const t = tx.datum.getTime();
    if (t < interval.start.getTime() || t > interval.end.getTime()) continue;
    if (filter === 'BUY' && tx.typ !== 'kauf') continue;
    if (filter === 'SELL' && tx.typ !== 'verkauf') continue;
    const key = `${tx.datum.getFullYear()}-${String(tx.datum.getMonth() + 1).padStart(2, '0')}`;
    const e = byMonth.get(key) ?? { kauf: 0, verkauf: 0 };
    if (tx.typ === 'kauf') e.kauf += 1; else e.verkauf += 1;
    byMonth.set(key, e);
  }
  const data = [...byMonth.entries()].sort().map(([m, v]) => ({ monat: m, ...v }));
  if (data.length === 0) return emptyBox('Keine Buchungen.', h);
  return (
    <div style={{ padding: '4px', height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey="monat" tick={xTick} tickLine={false} interval="preserveStartEnd" minTickGap={30} />
          {showY(p) && <YAxis allowDecimals={false} tick={yTick} tickLine={false} width={30} />}
          <Tooltip contentStyle={TT_STYLE} />
          <Bar dataKey="kauf" stackId="a" fill="#2196f3" name="Käufe" />
          <Bar dataKey="verkauf" stackId="a" fill="#ff9800" name="Verkäufe" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Browser-Widget (PP BrowserWidget) — eingebettete URL ── */
export function BrowserWidget(p: WidgetProps) {
  const url = p.widget.configuration[CFG.URL];
  const h = chartHeight(p);
  if (!url) return emptyBox('Keine URL konfiguriert.', h);
  return <iframe src={url} title={p.widget.label} style={{ width: '100%', height: h, border: 'none' }} />;
}
