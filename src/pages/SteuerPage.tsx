import { useState } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { Card } from '../components/ui/Card';
import { KpiCard } from '../components/ui/KpiCard';
import { euro, datumKurz, stueck } from '../utils/format';

export default function SteuerPage() {
  const { state } = usePortfolio();
  const jahre = Object.values(state.steuerJahre).sort((a, b) => b.jahr - a.jahr);
  const [selectedJahr, setSelectedJahr] = useState<number | null>(jahre[0]?.jahr ?? null);
  const sj = selectedJahr ? state.steuerJahre[selectedJahr] : undefined;

  if (jahre.length === 0) {
    return (
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-12 text-center">
        <p className="text-slate-400">Keine Steuerdaten vorhanden. Importiere Transaktionen mit Verkäufen oder Dividenden.</p>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-4 py-6 space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        {jahre.map(j => (
          <button
            key={j.jahr}
            type="button"
            onClick={() => setSelectedJahr(j.jahr)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              selectedJahr === j.jahr
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 border border-slate-700 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {j.jahr}
          </button>
        ))}
      </div>

      {sj && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Realisierte Gewinne" value={euro(sj.realisierteGewinne)} color="green" />
            <KpiCard label="Realisierte Verluste" value={euro(sj.realisierteVerluste)} color="red" />
            <KpiCard label="Dividenden" value={euro(sj.dividenden)} color="green" />
            <KpiCard label="Saldo" value={euro(sj.saldo)} color={sj.saldo >= 0 ? 'green' : 'red'} />
          </div>

          <Card title="Steuerberechnung">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-700/30">
                <span className="text-slate-400">Gewinne + Dividenden - Verluste</span>
                <span className="text-slate-200 font-medium">{euro(sj.saldo)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-700/30">
                <span className="text-slate-400">Sparer-Pauschbetrag</span>
                <span className="text-slate-200">−{euro(sj.sparerPauschbetrag)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-700/30 font-semibold">
                <span className="text-slate-200">Steuerpflichtig</span>
                <span className={sj.steuerpflichtig > 0 ? 'text-red-400' : 'text-emerald-400'}>
                  {euro(sj.steuerpflichtig)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-700/30">
                <span className="text-slate-400">Abgeltungsteuer (25%)</span>
                <span className="text-slate-200">{euro(sj.abgeltungsteuer)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-700/30">
                <span className="text-slate-400">Soli (5,5%)</span>
                <span className="text-slate-200">{euro(sj.soli)}</span>
              </div>
              <div className="flex justify-between py-1.5 font-bold text-base">
                <span className="text-slate-200">Steuer gesamt</span>
                <span className={sj.steuerGesamt > 0 ? 'text-red-400' : 'text-emerald-400'}>
                  {euro(sj.steuerGesamt)}
                </span>
              </div>
            </div>
          </Card>

          {sj.positionen.length > 0 && (
            <Card title={`FIFO-Positionen (${sj.positionen.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 text-xs text-slate-500">
                      <th className="text-left py-2">Wertpapier</th>
                      <th className="text-left py-2">Kauf</th>
                      <th className="text-left py-2">Verkauf</th>
                      <th className="text-right py-2">Stück</th>
                      <th className="text-right py-2">Kaufkurs</th>
                      <th className="text-right py-2">Verkaufkurs</th>
                      <th className="text-right py-2">Gewinn/Verlust</th>
                      <th className="text-right py-2">Haltedauer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sj.positionen.map((pos, i) => (
                      <tr key={i} className="border-b border-slate-800/30">
                        <td className="py-1.5 text-slate-300">{pos.name.length > 30 ? pos.name.slice(0, 30) + '…' : pos.name}</td>
                        <td className="py-1.5 text-slate-500">{datumKurz(pos.kaufDatum)}</td>
                        <td className="py-1.5 text-slate-500">{datumKurz(pos.verkaufDatum)}</td>
                        <td className="py-1.5 text-right text-slate-300 tabular-nums">{stueck(pos.stueck)}</td>
                        <td className="py-1.5 text-right text-slate-300 tabular-nums">{euro(pos.kaufkurs)}</td>
                        <td className="py-1.5 text-right text-slate-300 tabular-nums">{euro(pos.verkaufkurs)}</td>
                        <td className={`py-1.5 text-right font-medium tabular-nums ${pos.gewinn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {euro(pos.gewinn)}
                        </td>
                        <td className="py-1.5 text-right text-slate-500 tabular-nums">{pos.haltedauerTage} T</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
