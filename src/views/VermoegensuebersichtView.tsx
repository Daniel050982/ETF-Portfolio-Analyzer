import { useMemo } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar, ColorMarker, getColor } from '../components/PPElements';
import { euro, stueck, num } from '../utils/format';

export default function VermoegensuebersichtView() {
  const { state } = usePortfolio();

  const wps = useMemo(() =>
    Object.values(state.wertpapiere).filter(wp => wp.bestand > 0).sort((a, b) => b.investiert - a.investiert),
    [state.wertpapiere]
  );

  const totalInvestiert = wps.reduce((s, wp) => s + wp.investiert, 0);
  const totalDividenden = wps.reduce((s, wp) => s + wp.dividendenGesamt, 0);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Vermögensaufstellung" showSearch={false} />
      <div className="flex-1 overflow-auto">
        <table className="pp-table">
          <thead>
            <tr>
              <th style={{ width: 260 }}>Name</th>
              <th style={{ width: 120 }}>ISIN</th>
              <th className="right" style={{ width: 80 }}>Bestand</th>
              <th className="right" style={{ width: 110 }}>Einstandskurs</th>
              <th className="right" style={{ width: 110 }}>Einstandspreis</th>
              <th className="right" style={{ width: 80 }}>Anteil in %</th>
              <th className="right" style={{ width: 100 }}>Dividenden</th>
              <th style={{ width: 70 }}>Währung</th>
            </tr>
          </thead>
          <tbody>
            <tr className="pp-sum">
              <td>Summe</td><td /><td /><td />
              <td className="right mono">{euro(totalInvestiert)}</td>
              <td className="right mono">100,00</td>
              <td className="right mono" style={{ color: totalDividenden > 0 ? 'var(--pp-green-text)' : '' }}>{euro(totalDividenden)}</td>
              <td />
            </tr>
            <tr className="pp-group">
              <td colSpan={8}>Exchange Traded Fund ({wps.length})</td>
            </tr>
            {wps.map(wp => {
              const key = wp.isin || wp.name;
              const anteil = totalInvestiert > 0 ? (wp.investiert / totalInvestiert) * 100 : 0;
              return (
                <tr key={key} className="pp-row">
                  <td style={{ paddingLeft: 20 }}>
                    <span className="flex items-center gap-1.5">
                      <ColorMarker color={getColor(key)} />
                      {wp.name}
                    </span>
                  </td>
                  <td style={{ color: 'var(--pp-text-muted)' }}>{wp.isin}</td>
                  <td className="right mono">{stueck(wp.bestand)}</td>
                  <td className="right mono">{euro(wp.durchschnittskurs)}</td>
                  <td className="right mono">{euro(wp.investiert)}</td>
                  <td className="right mono">{num(anteil)}</td>
                  <td className="right mono" style={{ color: wp.dividendenGesamt > 0 ? 'var(--pp-green-text)' : '' }}>
                    {wp.dividendenGesamt > 0 ? euro(wp.dividendenGesamt) : ''}
                  </td>
                  <td>{wp.waehrung}</td>
                </tr>
              );
            })}
            <tr className="pp-sum">
              <td>Summe</td><td /><td /><td />
              <td className="right mono">{euro(totalInvestiert)}</td>
              <td className="right mono">100,00</td>
              <td className="right mono" style={{ color: totalDividenden > 0 ? 'var(--pp-green-text)' : '' }}>{euro(totalDividenden)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
