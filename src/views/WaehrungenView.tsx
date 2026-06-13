import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar, TabBar } from '../components/PPElements';
import { useColumnConfig, ColumnHeader, type ColumnDef } from '../components/useColumnConfig';
import { datumKurz } from '../utils/format';
import type { Wertpapier } from '../types/portfolio';

const WAEHRUNGEN_LISTE_COLUMNS: ColumnDef[] = [
  { id: 'base', label: 'Basiswährung', width: 120 },
  { id: 'term', label: 'Zielwährung', width: 120 },
  { id: 'source', label: 'Quelle', width: 200 },
  { id: 'lastDate', label: 'Datum letzter Wechselkurs', align: 'right', width: 150 },
];

const WAEHRUNGEN_UMRECHNER_COLUMNS: ColumnDef[] = [
  { id: 'kurs', label: 'Wechselkurs', width: 300 },
  { id: 'wert', label: 'Wert', align: 'right', width: 120 },
];

interface ExchangeRateSeries {
  key: string;
  name: string;
  baseCurrency: string;
  termCurrency: string;
  source: string;
  lastDate?: Date;
  lastRate?: number;
  rates: { datum: Date; kurs: number }[];
}

const TABS = [
  { id: 'list', label: 'Wechselkurse' },
  { id: 'converter', label: 'Währungsumrechner' },
];

function buildExchangeRates(wertpapiere: Record<string, Wertpapier>): ExchangeRateSeries[] {
  const series: ExchangeRateSeries[] = [];
  for (const wp of Object.values(wertpapiere)) {
    if (!wp.isExchangeRate || !wp.targetCurrencyCode) continue;
    const baseCurrency = wp.waehrung || 'EUR';
    const termCurrency = wp.targetCurrencyCode;
    const rates = (wp.kursHistorie ?? [])
      .map(k => ({ datum: k.datum, kurs: k.kurs }))
      .sort((a, b) => a.datum.getTime() - b.datum.getTime());
    const last = rates.length > 0 ? rates[rates.length - 1] : undefined;
    series.push({
      key: wp.isin || wp.name,
      name: wp.name,
      baseCurrency,
      termCurrency,
      source: wp.feed ?? 'Manuell',
      lastDate: last?.datum ?? wp.letzterKursDatum,
      lastRate: last?.kurs ?? wp.letzterKurs,
      rates,
    });
  }
  series.sort((a, b) => a.baseCurrency.localeCompare(b.baseCurrency) || a.termCurrency.localeCompare(b.termCurrency));
  return series;
}

function ExchangeRatesListTab({ series }: { series: ExchangeRateSeries[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const cfg = useColumnConfig('waehrungen-liste', WAEHRUNGEN_LISTE_COLUMNS);
  const sel = series.find(s => s.key === selected);

  const sortVal = (s: ExchangeRateSeries, id: string): number | string | null => {
    switch (id) {
      case 'base': return s.baseCurrency;
      case 'term': return s.termCurrency;
      case 'source': return s.source;
      case 'lastDate': return s.lastDate ? s.lastDate.getTime() : null;
      default: return null;
    }
  };
  const cell = (s: ExchangeRateSeries, id: string): React.ReactNode => {
    switch (id) {
      case 'base': return s.baseCurrency;
      case 'term': return s.termCurrency;
      case 'source': return <span style={{ color: 'var(--pp-text-muted)' }}>{s.source}</span>;
      case 'lastDate': return s.lastDate ? datumKurz(s.lastDate) : '—';
      default: return '';
    }
  };

  const chartData = useMemo(() => {
    if (!sel) return [];
    return sel.rates.map(r => ({
      date: r.datum.toISOString().slice(0, 10),
      kurs: r.kurs,
    }));
  }, [sel]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        {series.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
            Keine Wechselkurse vorhanden.
          </div>
        ) : (
          <table className="pp-table">
            <thead>
              <tr>
                {cfg.orderedColumns.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={cfg} />)}
              </tr>
            </thead>
            <tbody>
              {cfg.sortData(series, sortVal).map(s => (
                <tr
                  key={s.key}
                  className={`pp-row cursor-pointer ${selected === s.key ? 'pp-row-selected' : ''}`}
                  onClick={() => setSelected(s.key)}
                >
                  {cfg.orderedColumns.map(c => (
                    <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}>
                      {cell(s, c.id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sel && chartData.length > 1 && (
        <div className="border-t" style={{ borderColor: 'var(--pp-border)', height: 250, flexShrink: 0 }}>
          <div className="px-3 py-1 text-[11px]" style={{ color: 'var(--pp-text-muted)' }}>
            {sel.baseCurrency}/{sel.termCurrency} ({sel.source})
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                labelFormatter={l => l as string}
                formatter={(v: number) => [v.toFixed(4), 'Kurs']}
              />
              <Line type="monotone" dataKey="kurs" stroke="#4A90D9" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function CurrencyConverterTab({ series }: { series: ExchangeRateSeries[] }) {
  const cfg = useColumnConfig('waehrungen-umrechner', WAEHRUNGEN_UMRECHNER_COLUMNS);
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const s of series) {
      set.add(s.baseCurrency);
      set.add(s.termCurrency);
    }
    if (set.size === 0) { set.add('EUR'); set.add('USD'); }
    return Array.from(set).sort();
  }, [series]);

  const [baseAmount, setBaseAmount] = useState(100);
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [termCurrency, setTermCurrency] = useState(availableCurrencies.includes('USD') ? 'USD' : availableCurrencies[1] ?? 'USD');

  const rate = useMemo(() => {
    if (baseCurrency === termCurrency) return 1;
    const direct = series.find(s => s.baseCurrency === baseCurrency && s.termCurrency === termCurrency);
    if (direct?.lastRate) return direct.lastRate;
    const inverse = series.find(s => s.baseCurrency === termCurrency && s.termCurrency === baseCurrency);
    if (inverse?.lastRate && inverse.lastRate !== 0) return 1 / inverse.lastRate;
    return null;
  }, [series, baseCurrency, termCurrency]);

  const termAmount = rate != null ? baseAmount * rate : null;

  const matchedSeries = series.filter(s =>
    (s.baseCurrency === baseCurrency && s.termCurrency === termCurrency) ||
    (s.baseCurrency === termCurrency && s.termCurrency === baseCurrency)
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="p-4 border-b flex items-end gap-4 flex-wrap" style={{ borderColor: 'var(--pp-border)' }}>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--pp-text-muted)' }}>
          Betrag
          <input
            type="number"
            value={baseAmount}
            onChange={e => setBaseAmount(Number(e.target.value) || 0)}
            className="w-[120px] px-2 py-1 text-[12px] rounded"
            style={{ background: 'var(--pp-input-bg, var(--pp-content-bg))', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--pp-text-muted)' }}>
          Basiswährung
          <select
            value={baseCurrency}
            onChange={e => setBaseCurrency(e.target.value)}
            className="px-2 py-1 text-[12px] rounded"
            style={{ background: 'var(--pp-input-bg, var(--pp-content-bg))', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
          >
            {availableCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--pp-text-muted)' }}>
          Umgerechneter Betrag
          <span className="px-2 py-1 text-[12px] mono" style={{ color: 'var(--pp-text)' }}>
            {termAmount != null ? termAmount.toFixed(2) : '—'}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--pp-text-muted)' }}>
          Zielwährung
          <select
            value={termCurrency}
            onChange={e => setTermCurrency(e.target.value)}
            className="px-2 py-1 text-[12px] rounded"
            style={{ background: 'var(--pp-input-bg, var(--pp-content-bg))', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
          >
            {availableCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => { setBaseCurrency(termCurrency); setTermCurrency(baseCurrency); }}
          className="px-3 py-1 text-[11px] rounded"
          style={{ background: 'var(--pp-btn-bg, var(--pp-header-bg))', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
        >
          ⇄ Währungen tauschen
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {matchedSeries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
            Kein Wechselkurs für {baseCurrency}/{termCurrency} vorhanden.
          </div>
        ) : (
          <table className="pp-table">
            <thead>
              <tr>
                {cfg.orderedColumns.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={cfg} />)}
              </tr>
            </thead>
            <tbody>
              {cfg.sortData(matchedSeries, (s, id) => id === 'wert' ? (s.lastRate ?? null) : `${s.baseCurrency}/${s.termCurrency} (${s.source})`).map(s => (
                <tr key={s.key} className="pp-row">
                  {cfg.orderedColumns.map(c => (
                    <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}>
                      {c.id === 'kurs' ? `${s.baseCurrency}/${s.termCurrency} (${s.source})` : (s.lastRate?.toFixed(4) ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function WaehrungenView() {
  const { state } = usePortfolio();
  const [tab, setTab] = useState('list');

  const series = useMemo(() => buildExchangeRates(state.wertpapiere), [state.wertpapiere]);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Währungen" showSearch={false} />
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'list' ? (
        <ExchangeRatesListTab series={series} />
      ) : (
        <CurrencyConverterTab series={series} />
      )}
    </div>
  );
}
