import { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar, ColorMarker, getColor } from '../components/PPElements';
import { prozent } from '../utils/format';

export default function RenditeVolatilitaetView() {
  const { state } = usePortfolio();

  const data = useMemo(() => {
    return Object.values(state.wertpapiere)
      .filter(wp => wp.bestand > 0 && wp.kursHistorie.length > 10)
      .map(wp => {
        const returns: number[] = [];
        for (let i = 1; i < wp.kursHistorie.length; i++) {
          if (wp.kursHistorie[i - 1].kurs > 0) {
            returns.push(wp.kursHistorie[i].kurs / wp.kursHistorie[i - 1].kurs - 1);
          }
        }
        const mean = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
        const variance = returns.length > 1 ? returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1) : 0;
        const vol = Math.sqrt(variance) * Math.sqrt(252) * 100;
        const rendite = wp.unrealisierterGewinnProzent ?? 0;

        return { name: wp.name, rendite, volatilitaet: vol, isin: wp.isin, color: getColor(wp.isin || wp.name) };
      });
  }, [state.wertpapiere]);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Rendite / Volatilität" showSearch={false} />
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Benötigt Kurshistorie — importiere eine PP-XML-Datei mit historischen Kursen.
        </div>
      ) : (
        <div className="flex-1 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
              <XAxis
                type="number" dataKey="volatilitaet" name="Volatilität"
                tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }}
                label={{ value: 'Volatilität (%)', position: 'insideBottom', offset: -5, style: { fontSize: 10, fill: 'var(--pp-text-muted)' } }}
              />
              <YAxis
                type="number" dataKey="rendite" name="Rendite"
                tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }}
                label={{ value: 'Rendite (%)', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'var(--pp-text-muted)' } }}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip
                contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                formatter={(v: number, name: string) => [prozent(v), name === 'volatilitaet' ? 'Volatilität' : 'Rendite']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
              />
              <Scatter data={data} fill="var(--pp-accent)" />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 px-2">
            {data.map(d => (
              <span key={d.isin || d.name} className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--pp-text-secondary)' }}>
                <ColorMarker color={d.color} /> {d.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
