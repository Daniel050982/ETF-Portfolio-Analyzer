import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar, ColorMarker, getColor } from '../components/PPElements';
import { useColumnConfig, ColumnHeader, type ColumnDef } from '../components/useColumnConfig';
import { euro, num } from '../utils/format';

const VERTEILUNG_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Wertpapier' },
  { id: 'value', label: 'Investiert', align: 'right' },
  { id: 'pct', label: 'Anteil', align: 'right' },
];

export default function VerteilungView() {
  const { state } = usePortfolio();
  const cfg = useColumnConfig('verteilung', VERTEILUNG_COLUMNS);

  const data = useMemo(() => {
    const wps = Object.values(state.wertpapiere).filter(wp => wp.investiert > 0);
    const total = wps.reduce((s, wp) => s + wp.investiert, 0);
    return wps
      .map(wp => ({
        name: wp.name,
        value: wp.investiert,
        pct: total > 0 ? (wp.investiert / total) * 100 : 0,
        color: getColor(wp.isin || wp.name),
      }))
      .sort((a, b) => b.value - a.value);
  }, [state.wertpapiere]);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Verteilung nach Wertpapier" showSearch={false} />
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-[1fr_1fr] gap-6 h-full min-h-[300px]">
          <div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="30%" outerRadius="70%" paddingAngle={1} stroke="var(--pp-bg)" strokeWidth={2}>
                  {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(value) => euro(value as number)} contentStyle={{ fontSize: '12px', background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-auto">
            <table className="pp-table">
              <thead>
                <tr>
                  {cfg.orderedColumns.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={cfg} />)}
                </tr>
              </thead>
              <tbody>
                {cfg.sortData(data, (d, id) => id === 'name' ? d.name : id === 'value' ? d.value : d.pct).map((d, i) => (
                  <tr key={i} className="pp-row">
                    {cfg.orderedColumns.map(c => (
                      <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}>
                        {c.id === 'name' ? (
                          <span className="flex items-center gap-1.5">
                            <ColorMarker color={d.color} />
                            {d.name}
                          </span>
                        ) : c.id === 'value' ? euro(d.value)
                          : `${num(d.pct)} %`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
