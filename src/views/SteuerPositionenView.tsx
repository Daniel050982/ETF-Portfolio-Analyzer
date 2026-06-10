import { useState, useMemo } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { Toolbar } from '../components/PPElements';
import { euro, stueck, datumKurz } from '../utils/format';
import { berechneSteuerPositionen } from '../core/fifo';
import type { SteuerPosition } from '../types/portfolio';

const COLUMNS: PPColumn<SteuerPosition>[] = [
  { id: 'name', label: 'Wertpapier', width: 220, render: p => p.name, sortFn: (a, b) => a.name.localeCompare(b.name) },
  { id: 'kaufDatum', label: 'Kaufdatum', width: 95, render: p => datumKurz(p.kaufDatum), sortFn: (a, b) => a.kaufDatum.getTime() - b.kaufDatum.getTime() },
  { id: 'verkaufDatum', label: 'Verkaufdatum', width: 95, render: p => datumKurz(p.verkaufDatum), sortFn: (a, b) => a.verkaufDatum.getTime() - b.verkaufDatum.getTime() },
  { id: 'stueck', label: 'Stück', width: 70, align: 'right', render: p => stueck(p.stueck) },
  { id: 'kaufkurs', label: 'Kaufkurs', width: 95, align: 'right', render: p => euro(p.kaufkurs) },
  { id: 'verkaufkurs', label: 'Verkaufkurs', width: 95, align: 'right', render: p => euro(p.verkaufkurs) },
  {
    id: 'gewinn', label: 'Gewinn/Verlust', width: 110, align: 'right',
    render: p => <span style={{ color: p.gewinn >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{euro(p.gewinn)}</span>,
    sortFn: (a, b) => a.gewinn - b.gewinn,
  },
  { id: 'haltedauer', label: 'Haltedauer', width: 90, align: 'right', render: p => `${p.haltedauerTage} Tage` },
];

export default function SteuerPositionenView() {
  const { state } = usePortfolio();
  const [filterJahr, setFilterJahr] = useState<number | 'alle'>('alle');

  const positionen = useMemo(() => berechneSteuerPositionen(state.transaktionen), [state.transaktionen]);

  const jahre = useMemo(() => {
    const set = new Set(positionen.map(p => p.verkaufDatum.getFullYear()));
    return [...set].sort((a, b) => b - a);
  }, [positionen]);

  const filtered = useMemo(() => {
    if (filterJahr === 'alle') return positionen;
    return positionen.filter(p => p.verkaufDatum.getFullYear() === filterJahr);
  }, [positionen, filterJahr]);

  const totalGewinn = filtered.reduce((s, p) => s + p.gewinn, 0);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="FIFO-Positionen" showSearch={false}>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setFilterJahr('alle')}
            className="px-2 py-0.5 rounded text-[11px]"
            style={{
              background: filterJahr === 'alle' ? 'var(--pp-accent)' : 'transparent',
              color: filterJahr === 'alle' ? '#1d1f21' : 'var(--pp-text-muted)',
              fontWeight: filterJahr === 'alle' ? 600 : 400,
            }}
          >
            Alle
          </button>
          {jahre.map(j => (
            <button
              key={j}
              type="button"
              onClick={() => setFilterJahr(j)}
              className="px-2 py-0.5 rounded text-[11px]"
              style={{
                background: filterJahr === j ? 'var(--pp-accent)' : 'transparent',
                color: filterJahr === j ? '#1d1f21' : 'var(--pp-text-muted)',
                fontWeight: filterJahr === j ? 600 : 400,
              }}
            >
              {j}
            </button>
          ))}
        </div>
        <span className="text-[11px]" style={{ color: 'var(--pp-text-muted)' }}>{filtered.length} Positionen</span>
      </Toolbar>
      <PPTable
        columns={COLUMNS}
        data={filtered}
        rowKey={(_, i) => String(i)}
        storageKey="steuer-positionen"
        summaryRow={cols => filtered.length > 0 ? (
          <tr className="pp-sum">
            {cols.map(c => (
              <td key={c.id} className={c.align === 'right' ? 'right mono' : ''}>
                {c.id === 'name' ? 'Gesamt' : c.id === 'gewinn' ? (
                  <span style={{ color: totalGewinn >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{euro(totalGewinn)}</span>
                ) : ''}
              </td>
            ))}
          </tr>
        ) : undefined}
      />
    </div>
  );
}
