import { useMemo } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar, ColorMarker, getColor } from '../components/PPElements';
import { euro, stueck, datumKurz } from '../utils/format';

export default function BestandView() {
  const { state } = usePortfolio();

  const positionen = useMemo(() =>
    Object.values(state.wertpapiere)
      .filter(wp => wp.bestand > 0)
      .sort((a, b) => (b.marktwert ?? b.investiert) - (a.marktwert ?? a.investiert)),
    [state.wertpapiere]
  );

  const total = positionen.reduce((s, wp) => s + (wp.marktwert ?? wp.investiert), 0);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Bestand" showSearch={false} />
      <div className="flex-1 overflow-auto">
        <table className="pp-table">
          <thead>
            <tr>
              <th style={{ width: 260 }}>Name</th>
              <th style={{ width: 120 }}>ISIN</th>
              <th className="right" style={{ width: 80 }}>Bestand</th>
              <th className="right" style={{ width: 100 }}>Akt. Kurs</th>
              <th className="right" style={{ width: 100 }}>Kurs-Datum</th>
              <th className="right" style={{ width: 110 }}>Marktwert</th>
              <th className="right" style={{ width: 80 }}>Anteil</th>
            </tr>
          </thead>
          <tbody>
            <tr className="pp-sum">
              <td>Summe</td><td /><td /><td /><td />
              <td className="right mono">{euro(total)}</td>
              <td className="right mono">100,0 %</td>
            </tr>
            {positionen.map(wp => {
              const key = wp.isin || wp.name;
              const wert = wp.marktwert ?? wp.investiert;
              const anteil = total > 0 ? (wert / total) * 100 : 0;
              return (
                <tr key={key} className="pp-row">
                  <td>
                    <span className="flex items-center gap-1.5"><ColorMarker color={getColor(key)} />{wp.name}</span>
                  </td>
                  <td style={{ color: 'var(--pp-text-muted)' }}>{wp.isin}</td>
                  <td className="right mono">{stueck(wp.bestand)}</td>
                  <td className="right mono">{wp.letzterKurs ? euro(wp.letzterKurs) : euro(wp.durchschnittskurs)}</td>
                  <td className="right mono" style={{ color: 'var(--pp-text-muted)' }}>{wp.letzterKursDatum ? datumKurz(wp.letzterKursDatum) : '—'}</td>
                  <td className="right mono">{euro(wert)}</td>
                  <td className="right mono">{anteil.toFixed(1)} %</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
