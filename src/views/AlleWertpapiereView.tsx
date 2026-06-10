import { useState, useMemo } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { SplitPane } from '../components/SplitPane';
import { Toolbar, TabBar, ColorMarker, getColor, ValueArrow } from '../components/PPElements';
import { euro, stueck, datumKurz, prozent } from '../utils/format';
import type { Wertpapier } from '../types/portfolio';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const COLUMNS: PPColumn<Wertpapier>[] = [
  {
    id: 'name', label: 'Name', width: 240, minWidth: 120,
    render: wp => (
      <span className="flex items-center gap-1.5">
        <ColorMarker color={getColor(wp.isin || wp.name)} />
        {wp.name}
      </span>
    ),
    sortFn: (a, b) => a.name.localeCompare(b.name),
  },
  { id: 'isin', label: 'ISIN', width: 120, render: wp => wp.isin || '', sortFn: (a, b) => a.isin.localeCompare(b.isin) },
  { id: 'symbol', label: 'Symbol', width: 70, render: wp => wp.symbol || '' },
  { id: 'wkn', label: 'WKN', width: 70, render: wp => wp.wkn || '' },
  {
    id: 'letzterKurs', label: 'Letzter Kurs', width: 100, align: 'right',
    render: wp => wp.letzterKurs ? euro(wp.letzterKurs) : (wp.bestand > 0 ? euro(wp.durchschnittskurs) : ''),
    sortFn: (a, b) => (a.letzterKurs ?? a.durchschnittskurs) - (b.letzterKurs ?? b.durchschnittskurs),
  },
  { id: 'stueck', label: 'Stück', width: 80, align: 'right', render: wp => wp.bestand > 0 ? stueck(wp.bestand) : '', sortFn: (a, b) => a.bestand - b.bestand },
  { id: 'investiert', label: 'Einstandspreis', width: 110, align: 'right', render: wp => wp.investiert > 0 ? euro(wp.investiert) : '', sortFn: (a, b) => a.investiert - b.investiert },
  {
    id: 'marktwert', label: 'Marktwert', width: 110, align: 'right',
    render: wp => wp.marktwert ? euro(wp.marktwert) : '',
    sortFn: (a, b) => (a.marktwert ?? 0) - (b.marktwert ?? 0),
  },
  {
    id: 'delta', label: 'Δ Gewinn', width: 110, align: 'right',
    render: wp => {
      const g = wp.unrealisierterGewinn;
      if (g == null) return '';
      return (
        <span className="inline-flex items-center gap-0.5" style={{ color: g >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>
          {euro(g)} <ValueArrow value={g} />
        </span>
      );
    },
    sortFn: (a, b) => (a.unrealisierterGewinn ?? 0) - (b.unrealisierterGewinn ?? 0),
  },
  {
    id: 'deltaPct', label: 'Δ %', width: 70, align: 'right',
    render: wp => {
      const p = wp.unrealisierterGewinnProzent;
      if (p == null) return '';
      return <span style={{ color: p >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{prozent(p)}</span>;
    },
  },
  { id: 'dividenden', label: 'Dividenden', width: 100, align: 'right', render: wp => wp.dividendenGesamt > 0 ? <span style={{ color: 'var(--pp-green-text)' }}>{euro(wp.dividendenGesamt)}</span> : '', sortFn: (a, b) => a.dividendenGesamt - b.dividendenGesamt },
  { id: 'waehrung', label: 'Währung', width: 65, render: wp => wp.waehrung },
];

const DETAIL_TABS = [
  { id: 'diagramm', label: 'Diagramm' },
  { id: 'historische-kurse', label: 'Historische Kurse' },
  { id: 'umsaetze', label: 'Umsätze' },
  { id: 'trades', label: 'Trades' },
  { id: 'ereignisse', label: 'Ereignisse' },
  { id: 'datenqualitaet', label: 'Datenqualität' },
];

interface AlleWertpapiereViewProps {
  filterTyp?: Wertpapier['typ'] | 'Währung';
  title?: string;
}

export default function AlleWertpapiereView({ filterTyp, title }: AlleWertpapiereViewProps = {}) {
  const { state } = usePortfolio();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detailTab, setDetailTab] = useState('umsaetze');

  const wps = useMemo(() => {
    let list = Object.values(state.wertpapiere);
    if (filterTyp) {
      list = list.filter(wp => wp.typ === filterTyp);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(wp => wp.name.toLowerCase().includes(q) || wp.isin.toLowerCase().includes(q) || (wp.symbol ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [state.wertpapiere, search, filterTyp]);

  const selectedWp = selected ? state.wertpapiere[selected] : null;

  const kursChartData = useMemo(() => {
    if (!selectedWp?.kursHistorie?.length) return [];
    return selectedWp.kursHistorie.map(k => ({
      datum: datumKurz(k.datum),
      kurs: k.kurs,
    }));
  }, [selectedWp]);

  const masterPanel = (
    <div className="flex flex-col h-full">
      <Toolbar title={title ?? 'Wertpapiere (Standard)'} searchValue={search} onSearchChange={setSearch} />
      <PPTable columns={COLUMNS} data={wps} rowKey={wp => wp.isin || wp.name} selectedKey={selected} onSelect={setSelected} storageKey="alle-wertpapiere" />
    </div>
  );

  const detailPanel = (
    <div className="flex flex-col h-full">
      {selectedWp ? (
        <>
          <div className="flex items-center gap-2 px-2 py-[3px]" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
            <ColorMarker color={getColor(selectedWp.isin || selectedWp.name)} />
            <span className="text-[12px] font-semibold" style={{ color: 'var(--pp-text)' }}>{selectedWp.name}</span>
            {selectedWp.letzterKurs && (
              <span className="text-[11px] ml-auto" style={{ color: 'var(--pp-text-muted)' }}>
                {euro(selectedWp.letzterKurs)} {selectedWp.letzterKursDatum && `(${datumKurz(selectedWp.letzterKursDatum)})`}
              </span>
            )}
          </div>
          <TabBar tabs={DETAIL_TABS} active={detailTab} onChange={setDetailTab} />
          <div className="flex-1 overflow-auto">
            {detailTab === 'diagramm' ? (
              kursChartData.length > 0 ? (
                <div className="p-3 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={kursChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
                      <XAxis dataKey="datum" tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} width={60} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }} formatter={(v) => [euro(v as number), 'Kurs']} />
                      <Line type="monotone" dataKey="kurs" stroke="var(--pp-accent)" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
                  Keine Kurshistorie vorhanden
                </div>
              )
            ) : detailTab === 'historische-kurse' ? (
              selectedWp.kursHistorie?.length ? (
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Datum</th>
                      <th className="right" style={{ width: 100 }}>Kurs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selectedWp.kursHistorie].reverse().slice(0, 500).map((k, i) => (
                      <tr key={i} className="pp-row">
                        <td className="mono">{datumKurz(k.datum)}</td>
                        <td className="right mono">{euro(k.kurs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
                  Keine Kurshistorie vorhanden
                </div>
              )
            ) : detailTab === 'umsaetze' ? (
              <table className="pp-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Datum</th>
                    <th style={{ width: 100 }}>Typ</th>
                    <th className="right" style={{ width: 100 }}>Betrag</th>
                    <th className="right" style={{ width: 80 }}>Stück</th>
                    <th className="right" style={{ width: 90 }}>pro Aktie</th>
                    <th className="right" style={{ width: 80 }}>Gebühren</th>
                    <th className="right" style={{ width: 80 }}>Steuern</th>
                    <th style={{ width: 150 }}>Notiz</th>
                  </tr>
                </thead>
                <tbody>
                  {[...selectedWp.transaktionen].reverse().map(tx => (
                    <tr key={tx.id} className="pp-row">
                      <td className="mono">{datumKurz(tx.datum)}</td>
                      <td>{tx.typ === 'kauf' ? 'Kauf' : tx.typ === 'verkauf' ? 'Verkauf' : tx.typ === 'dividende' ? 'Dividende' : 'Ausschüttung'}</td>
                      <td className="right mono">{euro(tx.betrag)}</td>
                      <td className="right mono">{stueck(tx.stueck)}</td>
                      <td className="right mono">{tx.kurs > 0 ? euro(tx.kurs) : ''}</td>
                      <td className="right mono" style={{ color: tx.gebuehren > 0 ? 'var(--pp-red-text)' : '' }}>{tx.gebuehren > 0 ? euro(tx.gebuehren) : ''}</td>
                      <td className="right mono" style={{ color: tx.steuern > 0 ? 'var(--pp-red-text)' : '' }}>{tx.steuern > 0 ? euro(tx.steuern) : ''}</td>
                      <td style={{ color: 'var(--pp-text-muted)' }}>{tx.notiz || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
                Wird in einer späteren Phase implementiert.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Kein Wertpapier ausgewählt
        </div>
      )}
    </div>
  );

  return <SplitPane top={masterPanel} bottom={detailPanel} storageKey="alle-wertpapiere" />;
}
