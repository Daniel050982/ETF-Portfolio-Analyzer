import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar, TabBar, ColorMarker, getColor } from '../components/PPElements';
import { euro, prozent } from '../utils/format';

const TABS = [
  { id: 'typ', label: 'Wertpapierart' },
  { id: 'taxonomie', label: 'Taxonomie' },
];

const TYPE_COLORS: Record<string, string> = {
  ETF: '#2196f3',
  Aktie: '#4caf50',
  Fonds: '#9c27b0',
  Anleihe: '#ff9800',
  Krypto: '#e91e63',
  Sonstige: '#607d8b',
};

export default function KlassifizierungView() {
  const { state } = usePortfolio();
  const [tab, setTab] = useState('typ');

  const typData = useMemo(() => {
    const groups = new Map<string, number>();
    for (const wp of Object.values(state.wertpapiere)) {
      if (wp.bestand <= 0) continue;
      const wert = wp.marktwert ?? wp.investiert;
      groups.set(wp.typ, (groups.get(wp.typ) ?? 0) + wert);
    }
    const total = [...groups.values()].reduce((s, v) => s + v, 0);
    return [...groups.entries()]
      .map(([name, value]) => ({ name, value, anteil: total > 0 ? (value / total) * 100 : 0, color: TYPE_COLORS[name] ?? getColor(name) }))
      .sort((a, b) => b.value - a.value);
  }, [state.wertpapiere]);

  const taxonomieData = useMemo(() => {
    if (state.taxonomien.length === 0) return [];
    const tax = state.taxonomien[0];
    const results: { name: string; value: number; color: string }[] = [];
    const wpMap = state.wertpapiere;

    function walk(node: typeof tax.wurzel) {
      if (node.zuweisungen.length > 0) {
        let total = 0;
        for (const z of node.zuweisungen) {
          const wp = wpMap[z.wertpapierKey];
          if (wp && wp.bestand > 0) total += (wp.marktwert ?? wp.investiert) * (z.gewicht / 100);
        }
        if (total > 0) results.push({ name: node.name, value: total, color: node.farbe || getColor(node.id) });
      }
      for (const child of node.kinder) walk(child);
    }
    walk(tax.wurzel);

    const grand = results.reduce((s, r) => s + r.value, 0);
    return results.map(r => ({ ...r, anteil: grand > 0 ? (r.value / grand) * 100 : 0 })).sort((a, b) => b.value - a.value);
  }, [state.taxonomien, state.wertpapiere]);

  const data = tab === 'typ' ? typData : taxonomieData;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Klassifizierung" showSearch={false} />
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          {tab === 'taxonomie' ? 'Keine Taxonomie importiert. Importiere eine PP-XML-Datei mit Taxonomien.' : 'Keine Wertpapiere vorhanden.'}
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="80%"
                  innerRadius="40%"
                  stroke="var(--pp-bg)"
                  strokeWidth={2}
                >
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                  formatter={(v: number, name: string) => [euro(v), name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, color: 'var(--pp-text-secondary)' }}
                  formatter={(v: string) => v}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-[300px] overflow-auto border-l" style={{ borderColor: 'var(--pp-border)' }}>
            <table className="pp-table">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Kategorie</th>
                  <th className="right" style={{ width: 80 }}>Wert</th>
                  <th className="right" style={{ width: 60 }}>Anteil</th>
                </tr>
              </thead>
              <tbody>
                <tr className="pp-sum">
                  <td>Gesamt</td>
                  <td className="right mono">{euro(total)}</td>
                  <td className="right mono">100,0 %</td>
                </tr>
                {data.map(d => (
                  <tr key={d.name} className="pp-row">
                    <td>
                      <span className="flex items-center gap-1.5"><ColorMarker color={d.color} />{d.name}</span>
                    </td>
                    <td className="right mono">{euro(d.value)}</td>
                    <td className="right mono">{prozent('anteil' in d ? (d as any).anteil : 0)}</td>
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
