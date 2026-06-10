import { useMemo } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { Toolbar, ValueArrow, ColorMarker, getColor } from '../components/PPElements';
import { euro, prozent, datumKurz } from '../utils/format';

interface WpPerf {
  key: string;
  name: string;
  isin: string;
  typ: string;
  investiert: number;
  marktwert: number;
  gewinnAbs: number;
  gewinnProzent: number;
  dividendenGesamt: number;
  letzterKurs: number;
  letzterKursDatum: Date | undefined;
  ttwror: number;
}

function berechneTtwror(kursHistorie: { datum: Date; kurs: number }[]): number {
  if (kursHistorie.length < 2) return 0;
  const sorted = [...kursHistorie].sort((a, b) => a.datum.getTime() - b.datum.getTime());
  let prod = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].kurs > 0) {
      prod *= sorted[i].kurs / sorted[i - 1].kurs;
    }
  }
  return (prod - 1) * 100;
}

const COLUMNS: PPColumn<WpPerf>[] = [
  { id: 'name', label: 'Name', width: 220, render: r => (
    <span className="flex items-center gap-1.5"><ColorMarker color={getColor(r.key)} />{r.name}</span>
  ), sortFn: (a, b) => a.name.localeCompare(b.name) },
  { id: 'isin', label: 'ISIN', width: 120, render: r => <span style={{ color: 'var(--pp-text-muted)' }}>{r.isin}</span> },
  { id: 'typ', label: 'Typ', width: 70, render: r => r.typ },
  { id: 'investiert', label: 'Investiert', width: 100, align: 'right', render: r => euro(r.investiert), sortFn: (a, b) => a.investiert - b.investiert },
  { id: 'marktwert', label: 'Marktwert', width: 100, align: 'right', render: r => euro(r.marktwert), sortFn: (a, b) => a.marktwert - b.marktwert },
  { id: 'gewinn', label: 'Δ Gewinn', width: 100, align: 'right', render: r => (
    <span className="flex items-center justify-end gap-1" style={{ color: r.gewinnAbs >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>
      <ValueArrow value={r.gewinnAbs} /> {euro(r.gewinnAbs)}
    </span>
  ), sortFn: (a, b) => a.gewinnAbs - b.gewinnAbs },
  { id: 'gewinnProzent', label: 'Δ %', width: 70, align: 'right', render: r => (
    <span style={{ color: r.gewinnProzent >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{prozent(r.gewinnProzent)}</span>
  ), sortFn: (a, b) => a.gewinnProzent - b.gewinnProzent },
  { id: 'dividenden', label: 'Dividenden', width: 100, align: 'right', render: r => euro(r.dividendenGesamt), sortFn: (a, b) => a.dividendenGesamt - b.dividendenGesamt },
  { id: 'ttwror', label: 'TTWROR', width: 80, align: 'right', render: r => (
    <span style={{ color: r.ttwror >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{prozent(r.ttwror)}</span>
  ), sortFn: (a, b) => a.ttwror - b.ttwror },
  { id: 'kurs', label: 'Letzter Kurs', width: 90, align: 'right', render: r => r.letzterKurs > 0 ? euro(r.letzterKurs) : '—' },
  { id: 'kursDatum', label: 'Kurs-Datum', width: 90, align: 'right', render: r => r.letzterKursDatum ? datumKurz(r.letzterKursDatum) : '—' },
];

export default function WertpapierePerfView() {
  const { state } = usePortfolio();

  const data = useMemo<WpPerf[]>(() =>
    Object.values(state.wertpapiere)
      .filter(wp => wp.bestand > 0)
      .map(wp => ({
        key: wp.isin || wp.name,
        name: wp.name,
        isin: wp.isin,
        typ: wp.typ,
        investiert: wp.investiert,
        marktwert: wp.marktwert ?? wp.investiert,
        gewinnAbs: wp.unrealisierterGewinn ?? 0,
        gewinnProzent: wp.unrealisierterGewinnProzent ?? 0,
        dividendenGesamt: wp.dividendenGesamt,
        letzterKurs: wp.letzterKurs ?? 0,
        letzterKursDatum: wp.letzterKursDatum,
        ttwror: berechneTtwror(wp.kursHistorie),
      }))
      .sort((a, b) => b.marktwert - a.marktwert),
    [state.wertpapiere]
  );

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Wertpapiere (Performance)" showSearch={false} />
      {data.length > 0 ? (
        <PPTable columns={COLUMNS} data={data} rowKey={r => r.key} storageKey="wp-perf" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Keine Wertpapiere vorhanden.
        </div>
      )}
    </div>
  );
}
