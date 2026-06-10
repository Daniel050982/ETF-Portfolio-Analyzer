import { useState, useMemo } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { SplitPane } from '../components/SplitPane';
import { Toolbar, TabBar, ColorMarker, getColor } from '../components/PPElements';
import { euro, datumKurz } from '../utils/format';
import type { Transaktion } from '../types/portfolio';

interface KontoRow {
  name: string;
  saldo: number;
  waehrung: string;
  notiz: string;
}

const COLUMNS: PPColumn<KontoRow>[] = [
  {
    id: 'name', label: 'Konto', width: 220, minWidth: 100,
    render: k => (
      <span className="flex items-center gap-1.5">
        <ColorMarker color={getColor(k.name)} />
        {k.name}
      </span>
    ),
    sortFn: (a, b) => a.name.localeCompare(b.name),
  },
  { id: 'saldo', label: 'Kontostand', width: 130, align: 'right', render: k => euro(k.saldo), sortFn: (a, b) => a.saldo - b.saldo },
  { id: 'waehrung', label: 'Währung', width: 80, render: k => k.waehrung },
  { id: 'notiz', label: 'Notiz', width: 200, render: k => k.notiz },
];

const DETAIL_TABS = [
  { id: 'umsaetze', label: 'Umsätze' },
  { id: 'kontosaldenverlauf', label: 'Kontosaldenverlauf' },
];

export default function KontenView() {
  const { state } = usePortfolio();
  const [selected, setSelected] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState('umsaetze');
  const [search, setSearch] = useState('');

  const konten = useMemo((): KontoRow[] => {
    const stateKonten = Object.values(state.konten);
    if (stateKonten.length > 0) {
      return stateKonten.map(k => ({ name: k.name, saldo: k.saldo, waehrung: k.waehrung, notiz: k.notiz ?? '' }));
    }

    // Fallback: Verrechnungskonto aus Transaktionen berechnen
    if (state.transaktionen.length === 0) return [];
    let saldo = 0;
    for (const tx of state.transaktionen) {
      if (tx.typ === 'kauf') saldo -= tx.betrag + tx.gebuehren;
      else if (tx.typ === 'verkauf') saldo += tx.betrag - tx.gebuehren;
      else if (tx.typ === 'dividende' || tx.typ === 'ausschuettung') saldo += tx.betrag - tx.steuern;
      else if (tx.typ === 'einlage') saldo += tx.betrag;
      else if (tx.typ === 'entnahme') saldo -= tx.betrag;
    }
    return [{ name: 'Verrechnungskonto', saldo, waehrung: 'EUR', notiz: '' }];
  }, [state.konten, state.transaktionen]);

  const buchungen = useMemo((): Transaktion[] => {
    if (!selected) return [];
    const konto = state.konten[selected];
    let list: Transaktion[];
    if (konto) {
      list = [...konto.transaktionen];
    } else {
      list = [...state.transaktionen];
    }
    list.sort((a, b) => b.datum.getTime() - a.datum.getTime());
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(tx => tx.wertpapierName.toLowerCase().includes(q) || tx.isin.toLowerCase().includes(q));
    }
    return list;
  }, [state.konten, state.transaktionen, selected, search]);

  const typLabel = (t: string) => {
    switch (t) {
      case 'kauf': return 'Kauf';
      case 'verkauf': return 'Verkauf';
      case 'dividende': return 'Dividende';
      case 'ausschuettung': return 'Ausschüttung';
      case 'einlage': return 'Einlage';
      case 'entnahme': return 'Entnahme';
      case 'zinsen': return 'Zinsen';
      case 'gebuehren': return 'Gebühren';
      case 'steuern_tx': return 'Steuern';
      case 'steuererstattung': return 'Steuererstattung';
      case 'umbuchung_ein': return 'Umbuchung (ein)';
      case 'umbuchung_aus': return 'Umbuchung (aus)';
      default: return t;
    }
  };

  const masterPanel = (
    <div className="flex flex-col h-full">
      <Toolbar title="Konten" showSearch={false} />
      <PPTable columns={COLUMNS} data={konten} rowKey={k => k.name} selectedKey={selected} onSelect={setSelected} storageKey="konten" />
    </div>
  );

  const detailPanel = (
    <div className="flex flex-col h-full">
      {selected ? (
        <>
          <div className="flex items-center gap-2 px-2 py-[3px]" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
            <ColorMarker color={getColor(selected)} />
            <span className="text-[12px] font-semibold" style={{ color: 'var(--pp-text)' }}>{selected}</span>
          </div>
          <TabBar tabs={DETAIL_TABS} active={detailTab} onChange={setDetailTab} />
          <div className="flex-1 overflow-auto">
            {detailTab === 'umsaetze' ? (
              <>
                <Toolbar title="" searchValue={search} onSearchChange={setSearch} />
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Datum</th>
                      <th style={{ width: 120 }}>Typ</th>
                      <th className="right" style={{ width: 100 }}>Betrag</th>
                      <th style={{ width: 180 }}>Wertpapier</th>
                      <th className="right" style={{ width: 80 }}>Stück</th>
                      <th className="right" style={{ width: 90 }}>pro Aktie</th>
                      <th style={{ width: 150 }}>Notiz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buchungen.map(tx => (
                      <tr key={tx.id} className="pp-row">
                        <td className="mono">{datumKurz(tx.datum)}</td>
                        <td>{typLabel(tx.typ)}</td>
                        <td className="right mono">{euro(tx.betrag)}</td>
                        <td>{tx.wertpapierName}</td>
                        <td className="right mono">{tx.stueck > 0 ? String(tx.stueck) : ''}</td>
                        <td className="right mono">{tx.kurs > 0 ? euro(tx.kurs) : ''}</td>
                        <td style={{ color: 'var(--pp-text-muted)' }}>{tx.notiz || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
                Kontosaldenverlauf wird in einer späteren Phase implementiert.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Kein Konto ausgewählt
        </div>
      )}
    </div>
  );

  return <SplitPane top={masterPanel} bottom={detailPanel} defaultTopPercent={40} storageKey="konten" />;
}
