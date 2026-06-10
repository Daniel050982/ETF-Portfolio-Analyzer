import { useMemo } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { Toolbar, ValueArrow, ColorMarker, getColor } from '../components/PPElements';
import { euro, stueck, datumKurz } from '../utils/format';
import type { Transaktion } from '../types/portfolio';

interface Trade {
  id: string;
  datum: Date;
  typ: 'kauf' | 'verkauf';
  isin: string;
  name: string;
  stueck: number;
  kurs: number;
  betrag: number;
  gebuehren: number;
  steuern: number;
  netto: number;
  depotName: string;
}

const COLUMNS: PPColumn<Trade>[] = [
  { id: 'datum', label: 'Datum', width: 90, render: t => datumKurz(t.datum), sortFn: (a, b) => a.datum.getTime() - b.datum.getTime() },
  { id: 'typ', label: 'Typ', width: 70, render: t => (
    <span style={{ color: t.typ === 'kauf' ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>
      {t.typ === 'kauf' ? 'Kauf' : 'Verkauf'}
    </span>
  ) },
  { id: 'name', label: 'Wertpapier', width: 200, render: t => (
    <span className="flex items-center gap-1.5"><ColorMarker color={getColor(t.isin || t.name)} />{t.name}</span>
  ), sortFn: (a, b) => a.name.localeCompare(b.name) },
  { id: 'isin', label: 'ISIN', width: 120, render: t => <span style={{ color: 'var(--pp-text-muted)' }}>{t.isin}</span> },
  { id: 'stueck', label: 'Stück', width: 80, align: 'right', render: t => stueck(t.stueck), sortFn: (a, b) => a.stueck - b.stueck },
  { id: 'kurs', label: 'Kurs', width: 90, align: 'right', render: t => euro(t.kurs) },
  { id: 'betrag', label: 'Betrag', width: 100, align: 'right', render: t => euro(t.betrag), sortFn: (a, b) => a.betrag - b.betrag },
  { id: 'gebuehren', label: 'Gebühren', width: 80, align: 'right', render: t => t.gebuehren > 0 ? euro(t.gebuehren) : '—' },
  { id: 'steuern', label: 'Steuern', width: 80, align: 'right', render: t => t.steuern > 0 ? euro(t.steuern) : '—' },
  { id: 'netto', label: 'Netto', width: 100, align: 'right', render: t => (
    <span className="flex items-center justify-end gap-1">
      <ValueArrow value={t.typ === 'kauf' ? -1 : 1} /> {euro(t.netto)}
    </span>
  ), sortFn: (a, b) => a.netto - b.netto },
  { id: 'depot', label: 'Depot', width: 120, render: t => t.depotName },
];

export default function TradesView() {
  const { state } = usePortfolio();

  const trades = useMemo<Trade[]>(() =>
    state.transaktionen
      .filter((tx): tx is Transaktion & { typ: 'kauf' | 'verkauf' } => tx.typ === 'kauf' || tx.typ === 'verkauf')
      .map(tx => ({
        id: tx.id,
        datum: tx.datum,
        typ: tx.typ,
        isin: tx.isin,
        name: tx.wertpapierName,
        stueck: tx.stueck,
        kurs: tx.kurs,
        betrag: tx.betrag,
        gebuehren: tx.gebuehren,
        steuern: tx.steuern,
        netto: tx.typ === 'kauf' ? -(tx.betrag + tx.gebuehren + tx.steuern) : tx.betrag - tx.gebuehren - tx.steuern,
        depotName: tx.depotName ?? '—',
      }))
      .sort((a, b) => b.datum.getTime() - a.datum.getTime()),
    [state.transaktionen]
  );

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Trades" showSearch={false} />
      {trades.length > 0 ? (
        <PPTable columns={COLUMNS} data={trades} rowKey={t => t.id} storageKey="trades" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Keine Trades vorhanden.
        </div>
      )}
    </div>
  );
}
