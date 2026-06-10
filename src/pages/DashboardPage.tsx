import { Link } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { usePortfolio } from '../store/PortfolioContext';
import { KpiCard } from '../components/ui/KpiCard';
import { Card } from '../components/ui/Card';
import { euro, stueck } from '../utils/format';

const COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#fb923c', '#2dd4bf', '#e879f9'];

export default function DashboardPage() {
  const { state } = usePortfolio();
  const wps = Object.values(state.wertpapiere);
  const hatDaten = wps.length > 0;

  if (!hatDaten) {
    return (
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-12 text-center">
        <div className="max-w-md mx-auto space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Upload className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Willkommen beim ETF Portfolio Analyzer</h1>
          <p className="text-slate-400">
            Importiere deine Transaktionen aus Portfolio Performance, um loszulegen.
            Das Tool berechnet FIFO-Gewinne, Steueroptimierung und Portfolio-Kennzahlen.
          </p>
          <Link
            to="/import"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400 transition"
          >
            <Upload className="w-4 h-4" />
            CSV importieren
          </Link>
        </div>
      </main>
    );
  }

  const totalInvestiert = wps.reduce((s, wp) => s + wp.investiert, 0);
  const totalBestand = wps.filter(wp => wp.bestand > 0);
  const totalDividenden = wps.reduce((s, wp) => s + wp.dividendenGesamt, 0);
  const totalTransaktionen = state.transaktionen.length;

  const steuerJahre = Object.values(state.steuerJahre).sort((a, b) => b.jahr - a.jahr);

  const pieData = totalBestand
    .map((wp, i) => ({
      name: wp.name.length > 25 ? wp.name.slice(0, 25) + '…' : wp.name,
      value: Math.abs(wp.investiert),
      color: COLORS[i % COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-4 py-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Investiert" value={euro(totalInvestiert)} />
        <KpiCard label="Positionen" value={String(totalBestand.length)} />
        <KpiCard label="Dividenden (gesamt)" value={euro(totalDividenden)} color="green" />
        <KpiCard label="Transaktionen" value={String(totalTransaktionen)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Portfolio-Verteilung">
          {pieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => euro(value as number)}
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem' }}
                    labelStyle={{ color: '#e2e8f0' }}
                    itemStyle={{ color: '#94a3b8' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-500 text-sm py-8 text-center">Kein aktiver Bestand</p>
          )}
          <div className="mt-2 space-y-1">
            {pieData.map((entry, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-slate-400">{entry.name}</span>
                </div>
                <span className="text-slate-200 font-medium">{euro(entry.value)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Steuer-Übersicht">
          {steuerJahre.length > 0 ? (
            <div className="space-y-3">
              {steuerJahre.slice(0, 5).map(sj => (
                <div key={sj.jahr} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{sj.jahr}</p>
                    <p className="text-xs text-slate-500">
                      Gewinne {euro(sj.realisierteGewinne)} / Verluste {euro(sj.realisierteVerluste)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${sj.steuerpflichtig > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {sj.steuerpflichtig > 0 ? euro(sj.steuerGesamt) + ' Steuer' : 'Steuerfrei'}
                    </p>
                    {sj.dividenden > 0 && (
                      <p className="text-xs text-slate-500">Dividenden {euro(sj.dividenden)}</p>
                    )}
                  </div>
                </div>
              ))}
              <Link to="/steuer" className="block text-center text-sm text-emerald-400 hover:text-emerald-300 pt-1">
                Alle Jahre anzeigen →
              </Link>
            </div>
          ) : (
            <p className="text-slate-500 text-sm py-8 text-center">Keine Steuerdaten</p>
          )}
        </Card>
      </div>

      <Card title="Alle Positionen">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-xs text-slate-500">
                <th className="text-left py-2 pr-4">Wertpapier</th>
                <th className="text-right py-2 px-2">Bestand</th>
                <th className="text-right py-2 px-2">Investiert</th>
                <th className="text-right py-2 px-2">Ø Kurs</th>
                <th className="text-right py-2 px-2">Dividenden</th>
              </tr>
            </thead>
            <tbody>
              {wps.sort((a, b) => b.investiert - a.investiert).map(wp => (
                <tr key={wp.isin || wp.name} className="border-b border-slate-800/30 hover:bg-slate-800/30">
                  <td className="py-2 pr-4">
                    <Link to={`/portfolio/${encodeURIComponent(wp.isin || wp.name)}`} className="text-slate-200 hover:text-emerald-400 transition">
                      {wp.name}
                    </Link>
                    {wp.isin && <p className="text-xs text-slate-600">{wp.isin}</p>}
                  </td>
                  <td className="text-right py-2 px-2 text-slate-300 tabular-nums">{wp.bestand > 0 ? stueck(wp.bestand) : '—'}</td>
                  <td className="text-right py-2 px-2 text-slate-300 tabular-nums">{euro(wp.investiert)}</td>
                  <td className="text-right py-2 px-2 text-slate-300 tabular-nums">{wp.bestand > 0 ? euro(wp.durchschnittskurs) : '—'}</td>
                  <td className="text-right py-2 px-2 text-emerald-400 tabular-nums">{wp.dividendenGesamt > 0 ? euro(wp.dividendenGesamt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
