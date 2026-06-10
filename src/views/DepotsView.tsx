import { useState, useMemo } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { SplitPane } from '../components/SplitPane';
import { Toolbar, TabBar, ColorMarker, getColor } from '../components/PPElements';
import { euro, stueck, num, datumKurz } from '../utils/format';

interface DepotRow {
  name: string;
  referenzkonto: string;
  volumen: number;
  notiz: string;
}

const COLUMNS: PPColumn<DepotRow>[] = [
  {
    id: 'name', label: 'Depot', width: 220, minWidth: 100,
    render: d => (
      <span className="flex items-center gap-1.5">
        <ColorMarker color={getColor(d.name)} />
        {d.name}
      </span>
    ),
  },
  { id: 'referenzkonto', label: 'Referenzkonto', width: 160, render: d => d.referenzkonto },
  { id: 'volumen', label: 'Depotvolumen', width: 130, align: 'right', render: d => euro(d.volumen), sortFn: (a, b) => a.volumen - b.volumen },
  { id: 'notiz', label: 'Notiz', width: 200, render: d => d.notiz },
];

const DETAIL_TABS = [
  { id: 'vermoegensuebersicht', label: 'Vermögensaufstellung' },
  { id: 'umsaetze', label: 'Umsätze' },
  { id: 'diagramm', label: 'Diagramm' },
  { id: 'bestand', label: 'Bestand' },
];

export default function DepotsView() {
  const { state } = usePortfolio();
  const [selected, setSelected] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState('vermoegensuebersicht');

  const wps = useMemo(() =>
    Object.values(state.wertpapiere).filter(wp => wp.bestand > 0).sort((a, b) => a.name.localeCompare(b.name)),
    [state.wertpapiere]
  );

  const depotVolumen = wps.reduce((s, wp) => s + (wp.marktwert ?? wp.investiert), 0);

  const depots = useMemo((): DepotRow[] => {
    const stateDepots = Object.values(state.depots);
    if (stateDepots.length > 0) {
      return stateDepots.map(d => ({
        name: d.name,
        referenzkonto: d.referenzkontoName ?? '',
        volumen: depotVolumen,
        notiz: d.notiz ?? '',
      }));
    }
    return [{ name: 'Depot', referenzkonto: 'Verrechnungskonto', volumen: depotVolumen, notiz: '' }];
  }, [state.depots, depotVolumen]);

  const selectedDepot = selected ?? depots[0]?.name;

  const masterPanel = (
    <div className="flex flex-col h-full">
      <Toolbar title="Depots" showSearch={false} />
      <PPTable columns={COLUMNS} data={depots} rowKey={d => d.name} selectedKey={selectedDepot} onSelect={setSelected} storageKey="depots" />
    </div>
  );

  const detailPanel = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-[3px]" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
        <ColorMarker color={getColor(selectedDepot || 'Depot')} />
        <span className="text-[12px] font-semibold" style={{ color: 'var(--pp-text)' }}>{selectedDepot || 'Depot'}</span>
      </div>
      <TabBar tabs={DETAIL_TABS} active={detailTab} onChange={setDetailTab} />
      <div className="flex-1 overflow-auto">
        {detailTab === 'vermoegensuebersicht' ? (
          <table className="pp-table">
            <thead>
              <tr>
                <th style={{ width: 250 }}>Name</th>
                <th className="right" style={{ width: 80 }}>Bestand</th>
                <th className="right" style={{ width: 110 }}>Einstandskurs</th>
                <th className="right" style={{ width: 110 }}>Investiert</th>
                <th className="right" style={{ width: 110 }}>Marktwert</th>
                <th className="right" style={{ width: 80 }}>Anteil in %</th>
              </tr>
            </thead>
            <tbody>
              <tr className="pp-sum">
                <td>Summe</td><td /><td />
                <td className="right mono">{euro(wps.reduce((s, wp) => s + wp.investiert, 0))}</td>
                <td className="right mono">{euro(depotVolumen)}</td>
                <td className="right mono">100,00</td>
              </tr>
              <tr className="pp-group">
                <td colSpan={6}>Exchange Traded Fund ({wps.length})</td>
              </tr>
              {wps.map(wp => {
                const key = wp.isin || wp.name;
                const wert = wp.marktwert ?? wp.investiert;
                const anteil = depotVolumen > 0 ? (wert / depotVolumen) * 100 : 0;
                return (
                  <tr key={key} className="pp-row">
                    <td style={{ paddingLeft: 20 }}>
                      <span className="flex items-center gap-1.5">
                        <ColorMarker color={getColor(key)} />
                        {wp.name}
                      </span>
                    </td>
                    <td className="right mono">{stueck(wp.bestand)}</td>
                    <td className="right mono">{euro(wp.durchschnittskurs)}</td>
                    <td className="right mono">{euro(wp.investiert)}</td>
                    <td className="right mono">{euro(wert)}</td>
                    <td className="right mono">{num(anteil)}</td>
                  </tr>
                );
              })}
              <tr className="pp-sum">
                <td>Summe</td><td /><td />
                <td className="right mono">{euro(wps.reduce((s, wp) => s + wp.investiert, 0))}</td>
                <td className="right mono">{euro(depotVolumen)}</td>
                <td className="right mono">100,00</td>
              </tr>
            </tbody>
          </table>
        ) : detailTab === 'umsaetze' ? (
          <table className="pp-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Datum</th>
                <th style={{ width: 100 }}>Typ</th>
                <th style={{ width: 200 }}>Wertpapier</th>
                <th className="right" style={{ width: 80 }}>Stück</th>
                <th className="right" style={{ width: 100 }}>Betrag</th>
                <th className="right" style={{ width: 80 }}>Gebühren</th>
              </tr>
            </thead>
            <tbody>
              {[...state.transaktionen]
                .filter(tx => tx.typ === 'kauf' || tx.typ === 'verkauf')
                .sort((a, b) => b.datum.getTime() - a.datum.getTime())
                .map(tx => (
                  <tr key={tx.id} className="pp-row">
                    <td className="mono">{datumKurz(tx.datum)}</td>
                    <td>{tx.typ === 'kauf' ? 'Einlieferung' : 'Auslieferung'}</td>
                    <td>{tx.wertpapierName}</td>
                    <td className="right mono">{stueck(tx.stueck)}</td>
                    <td className="right mono">{euro(tx.betrag)}</td>
                    <td className="right mono" style={{ color: tx.gebuehren > 0 ? 'var(--pp-red-text)' : '' }}>{tx.gebuehren > 0 ? euro(tx.gebuehren) : ''}</td>
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
    </div>
  );

  return <SplitPane top={masterPanel} bottom={detailPanel} defaultTopPercent={35} storageKey="depots" />;
}
