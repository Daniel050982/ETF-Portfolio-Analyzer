import { useMemo } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar, ColorMarker, getColor } from '../components/PPElements';
import { euro } from '../utils/format';

export default function GruppierteKontenView() {
  const { state } = usePortfolio();

  const gruppen = useMemo(() => {
    const kontenList = Object.values(state.konten);
    const depotsList = Object.values(state.depots);
    const wps = Object.values(state.wertpapiere).filter(wp => wp.bestand > 0);
    const depotWert = wps.reduce((s, wp) => s + (wp.marktwert ?? wp.investiert), 0);
    const kontoWert = kontenList.reduce((s, k) => s + k.saldo, 0);

    return {
      gesamt: depotWert + kontoWert,
      konten: kontenList.length > 0 ? kontenList : [{ name: 'Verrechnungskonto', saldo: kontoWert, waehrung: 'EUR' }],
      depots: depotsList.length > 0 ? depotsList.map(d => ({ name: d.name, wert: depotWert })) : [{ name: 'Depot', wert: depotWert }],
      depotWert,
      kontoWert,
    };
  }, [state.konten, state.depots, state.wertpapiere]);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Gruppierte Konten" showSearch={false} />
      <div className="flex-1 overflow-auto">
        <table className="pp-table">
          <thead>
            <tr>
              <th style={{ width: 300 }}>Name</th>
              <th className="right" style={{ width: 150 }}>Wert</th>
              <th className="right" style={{ width: 100 }}>Anteil</th>
            </tr>
          </thead>
          <tbody>
            <tr className="pp-sum">
              <td>Gesamt</td>
              <td className="right mono">{euro(gruppen.gesamt)}</td>
              <td className="right mono">100,00 %</td>
            </tr>
            <tr className="pp-group"><td colSpan={3}>Depots</td></tr>
            {gruppen.depots.map(d => (
              <tr key={d.name} className="pp-row">
                <td style={{ paddingLeft: 20 }}>
                  <span className="flex items-center gap-1.5"><ColorMarker color={getColor(d.name)} />{d.name}</span>
                </td>
                <td className="right mono">{euro(d.wert)}</td>
                <td className="right mono">{gruppen.gesamt > 0 ? ((d.wert / gruppen.gesamt) * 100).toFixed(1) : '0,0'} %</td>
              </tr>
            ))}
            <tr className="pp-group"><td colSpan={3}>Konten</td></tr>
            {gruppen.konten.map(k => (
              <tr key={k.name} className="pp-row">
                <td style={{ paddingLeft: 20 }}>
                  <span className="flex items-center gap-1.5"><ColorMarker color={getColor(k.name)} />{k.name}</span>
                </td>
                <td className="right mono">{euro(k.saldo)}</td>
                <td className="right mono">{gruppen.gesamt > 0 ? ((k.saldo / gruppen.gesamt) * 100).toFixed(1) : '0,0'} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
