import { useMemo } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar, ColorMarker, getColor } from '../components/PPElements';
import { useColumnConfig, ColumnHeader, type ColumnDef } from '../components/useColumnConfig';
import { euro, kurs, stueck, datumKurz } from '../utils/format';

const BESTAND_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', width: 260 },
  { id: 'isin', label: 'ISIN', width: 120 },
  { id: 'bestand', label: 'Bestand', align: 'right', width: 80 },
  { id: 'kurs', label: 'Akt. Kurs', align: 'right', width: 100 },
  { id: 'kursdatum', label: 'Kurs-Datum', align: 'right', width: 100 },
  { id: 'marktwert', label: 'Marktwert', align: 'right', width: 110 },
  { id: 'anteil', label: 'Anteil', align: 'right', width: 80 },
];

export default function BestandView() {
  const { state } = usePortfolio();
  const cfg = useColumnConfig('bestand', BESTAND_COLUMNS);

  const positionen = useMemo(() =>
    Object.values(state.wertpapiere)
      .filter(wp => wp.bestand > 0)
      .sort((a, b) => (b.marktwert ?? b.investiert) - (a.marktwert ?? a.investiert)),
    [state.wertpapiere]
  );

  const total = positionen.reduce((s, wp) => s + (wp.marktwert ?? wp.investiert), 0);

  const cols = cfg.orderedColumns;
  const wertOf = (wp: typeof positionen[number]) => wp.marktwert ?? wp.investiert;
  const anteilOf = (wp: typeof positionen[number]) => total > 0 ? (wertOf(wp) / total) * 100 : 0;

  const sortVal = (wp: typeof positionen[number], id: string): number | string | null => {
    switch (id) {
      case 'name': return wp.name;
      case 'isin': return wp.isin;
      case 'bestand': return wp.bestand;
      case 'kurs': return wp.letzterKurs ?? wp.durchschnittskurs;
      case 'kursdatum': return wp.letzterKursDatum ? wp.letzterKursDatum.getTime() : null;
      case 'marktwert': return wertOf(wp);
      case 'anteil': return anteilOf(wp);
      default: return null;
    }
  };

  const cell = (wp: typeof positionen[number], id: string): React.ReactNode => {
    const key = wp.isin || wp.name;
    switch (id) {
      case 'name': return (
        <span className="flex items-center gap-1.5"><ColorMarker color={getColor(key)} inaktiv={wp.istInaktiv} />{wp.name}</span>
      );
      case 'isin': return <span style={{ color: 'var(--pp-text-muted)' }}>{wp.isin}</span>;
      case 'bestand': return stueck(wp.bestand);
      case 'kurs': return wp.letzterKurs ? kurs(wp.letzterKurs) : kurs(wp.durchschnittskurs);
      case 'kursdatum': return <span style={{ color: 'var(--pp-text-muted)' }}>{wp.letzterKursDatum ? datumKurz(wp.letzterKursDatum) : '—'}</span>;
      case 'marktwert': return euro(wertOf(wp));
      case 'anteil': return `${anteilOf(wp).toFixed(1)} %`;
      default: return '';
    }
  };

  const sorted = cfg.sortData(positionen, sortVal);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Bestand" showSearch={false} />
      <div className="flex-1 overflow-auto">
        <table className="pp-table">
          <thead>
            <tr>
              {cols.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={cfg} />)}
            </tr>
          </thead>
          <tbody>
            <tr className="pp-sum">
              {cols.map(c => (
                <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}>
                  {c.id === 'name' ? 'Summe'
                    : c.id === 'marktwert' ? euro(total)
                    : c.id === 'anteil' ? '100,0 %'
                    : ''}
                </td>
              ))}
            </tr>
            {sorted.map(wp => {
              const key = wp.isin || wp.name;
              return (
                <tr key={key} className="pp-row">
                  {cols.map(c => (
                    <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}>
                      {cell(wp, c.id)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
