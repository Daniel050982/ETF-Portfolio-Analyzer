import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar, ColorMarker, getColor } from '../components/PPElements';
import { euro, prozent } from '../utils/format';

export default function WaehrungenView() {
  const { state } = usePortfolio();

  const data = useMemo(() => {
    const groups = new Map<string, number>();
    for (const wp of Object.values(state.wertpapiere)) {
      if (wp.bestand <= 0) continue;
      const wert = wp.marktwert ?? wp.investiert;
      const waehrung = wp.waehrung || state.basisWaehrung || 'EUR';
      groups.set(waehrung, (groups.get(waehrung) ?? 0) + wert);
    }
    for (const konto of Object.values(state.konten)) {
      if (konto.saldo !== 0) {
        const waehrung = konto.waehrung || state.basisWaehrung || 'EUR';
        groups.set(waehrung, (groups.get(waehrung) ?? 0) + konto.saldo);
      }
    }
    const total = [...groups.values()].reduce((s, v) => s + v, 0);
    return {
      items: [...groups.entries()]
        .map(([waehrung, wert]) => ({
          name: waehrung,
          value: wert,
          anteil: total > 0 ? (wert / total) * 100 : 0,
          color: getColor(waehrung),
        }))
        .sort((a, b) => b.value - a.value),
      total,
    };
  }, [state.wertpapiere, state.konten, state.basisWaehrung]);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Währungen" showSearch={false} />
      {data.items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Keine Daten vorhanden.
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.items}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="80%"
                  innerRadius="40%"
                  stroke="var(--pp-bg)"
                  strokeWidth={2}
                >
                  {data.items.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                  formatter={(v, name) => [euro(v as number), name as string]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-[300px] overflow-auto border-l" style={{ borderColor: 'var(--pp-border)' }}>
            <table className="pp-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Währung</th>
                  <th className="right" style={{ width: 110 }}>Wert</th>
                  <th className="right" style={{ width: 70 }}>Anteil</th>
                </tr>
              </thead>
              <tbody>
                <tr className="pp-sum">
                  <td>Gesamt</td>
                  <td className="right mono">{euro(data.total)}</td>
                  <td className="right mono">100,0 %</td>
                </tr>
                {data.items.map(d => (
                  <tr key={d.name} className="pp-row">
                    <td>
                      <span className="flex items-center gap-1.5"><ColorMarker color={d.color} />{d.name}</span>
                    </td>
                    <td className="right mono">{euro(d.value)}</td>
                    <td className="right mono">{prozent(d.anteil)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
