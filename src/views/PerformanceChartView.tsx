import { useMemo, useState, useEffect } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar, TabBar } from '../components/PPElements';
import { euro, datumKurz, prozent } from '../utils/format';
import { berechneSnapshots } from '../core/performance';
import { fetchKursHistorie } from '../core/kursApi';
import type { KursEintrag } from '../types/portfolio';

const BENCHMARKS = [
  { id: 'none', label: 'Kein Benchmark' },
  { id: 'IWDA.AS', label: 'MSCI World (IWDA)' },
  { id: 'CSPX.L', label: 'S&P 500 (CSPX)' },
  { id: 'VWCE.DE', label: 'FTSE All-World (VWCE)' },
  { id: 'EXS1.DE', label: 'DAX (EXS1)' },
  { id: '^STOXX50E', label: 'Euro Stoxx 50' },
];

const TABS = [
  { id: 'absolut', label: 'Absolut' },
  { id: 'relativ', label: 'Relativ (%)' },
];

export default function PerformanceChartView() {
  const { state } = usePortfolio();
  const [benchmarkId, setBenchmarkId] = useState('none');
  const [benchmarkKurse, setBenchmarkKurse] = useState<KursEintrag[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('absolut');

  useEffect(() => {
    if (benchmarkId === 'none') {
      setBenchmarkKurse([]);
      return;
    }
    setLoading(true);
    fetchKursHistorie(benchmarkId, 'max')
      .then(kurse => setBenchmarkKurse(kurse))
      .finally(() => setLoading(false));
  }, [benchmarkId]);

  const snapshots = useMemo(() =>
    berechneSnapshots(state.transaktionen, state.wertpapiere),
    [state.transaktionen, state.wertpapiere]
  );

  const chartData = useMemo(() => {
    if (snapshots.length === 0) return [];

    const bmMap = new Map<string, number>();
    for (const k of benchmarkKurse) {
      bmMap.set(k.datum.toISOString().slice(0, 10), k.kurs);
    }

    const firstSnap = snapshots[0];
    const firstBmKey = firstSnap.datum.toISOString().slice(0, 10);
    let bmBase = bmMap.get(firstBmKey);
    if (!bmBase) {
      for (const k of benchmarkKurse) {
        if (k.datum.getTime() <= firstSnap.datum.getTime()) bmBase = k.kurs;
      }
    }

    return snapshots.map(s => {
      const dateStr = s.datum.toISOString().slice(0, 10);
      const bmKurs = bmMap.get(dateStr);

      const portfolioRendite = firstSnap.investiert > 0
        ? ((s.marktwert - firstSnap.investiert) / firstSnap.investiert) * 100
        : 0;

      let benchmarkRendite: number | undefined;
      if (bmKurs && bmBase && bmBase > 0) {
        benchmarkRendite = ((bmKurs - bmBase) / bmBase) * 100;
      }

      return {
        datum: datumKurz(s.datum),
        investiert: s.investiert,
        marktwert: s.marktwert,
        gewinn: s.gewinn,
        portfolioRendite: Math.round(portfolioRendite * 100) / 100,
        benchmarkRendite: benchmarkRendite != null ? Math.round(benchmarkRendite * 100) / 100 : undefined,
      };
    });
  }, [snapshots, benchmarkKurse]);

  const benchmarkLabel = BENCHMARKS.find(b => b.id === benchmarkId)?.label ?? '';

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Performance — Diagramm" showSearch={false}>
        <select
          value={benchmarkId}
          onChange={e => setBenchmarkId(e.target.value)}
          className="text-[11px] px-2 py-0.5 rounded"
          style={{ background: 'var(--pp-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }}
        >
          {BENCHMARKS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        {loading && <span className="text-[10px] ml-2" style={{ color: 'var(--pp-text-muted)' }}>Lade Benchmark...</span>}
      </Toolbar>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {chartData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Keine Daten vorhanden.
        </div>
      ) : tab === 'absolut' ? (
        <div className="flex-1 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
              <XAxis dataKey="datum" tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v: number) => euro(v)} tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }} tickLine={false} width={90} />
              <Tooltip
                formatter={(value, name) => [euro(value as number), (name as string) === 'investiert' ? 'Investiert' : (name as string) === 'marktwert' ? 'Marktwert' : 'Gewinn']}
                contentStyle={{ fontSize: '11px', background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
              />
              <Legend formatter={(v: string) => v === 'investiert' ? 'Investiert' : v === 'marktwert' ? 'Marktwert' : 'Gewinn'} />
              <Area type="stepAfter" dataKey="investiert" stroke="#6fc5ee" strokeWidth={1.5} fill="#6fc5ee" fillOpacity={0.1} />
              <Area type="stepAfter" dataKey="marktwert" stroke="var(--pp-accent)" strokeWidth={1.5} fill="var(--pp-accent)" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex-1 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
              <XAxis dataKey="datum" tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v: number) => prozent(v)} tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }} tickLine={false} width={70} />
              <Tooltip
                formatter={(value, name) => [prozent(value as number), (name as string) === 'portfolioRendite' ? 'Portfolio' : benchmarkLabel]}
                contentStyle={{ fontSize: '11px', background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
              />
              <Legend formatter={(v: string) => v === 'portfolioRendite' ? 'Portfolio' : benchmarkLabel} />
              <Line type="monotone" dataKey="portfolioRendite" stroke="var(--pp-accent)" strokeWidth={2} dot={false} />
              {benchmarkId !== 'none' && (
                <Line type="monotone" dataKey="benchmarkRendite" stroke="#6fc5ee" strokeWidth={1.5} dot={false} strokeDasharray="5 3" connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
