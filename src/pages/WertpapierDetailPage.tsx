import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePortfolio } from '../store/PortfolioContext';
import { Card } from '../components/ui/Card';
import { KpiCard } from '../components/ui/KpiCard';
import { euro, stueck, datumKurz } from '../utils/format';

export default function WertpapierDetailPage() {
  const { id } = useParams();
  const { state } = usePortfolio();
  const wp = id ? state.wertpapiere[id] ?? state.wertpapiere[decodeURIComponent(id)] : undefined;

  if (!wp) {
    return (
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-12 text-center">
        <p className="text-slate-400">Wertpapier nicht gefunden.</p>
        <Link to="/portfolio" className="text-emerald-400 hover:underline mt-2 inline-block">Zurück zum Portfolio</Link>
      </main>
    );
  }

  const kaeufe = wp.transaktionen.filter(tx => tx.typ === 'kauf');
  const verkaeufe = wp.transaktionen.filter(tx => tx.typ === 'verkauf');
  const dividenden = wp.transaktionen.filter(tx => tx.typ === 'dividende' || tx.typ === 'ausschuettung');

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/portfolio" className="p-2 rounded-lg hover:bg-slate-800 transition">
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-100">{wp.name}</h1>
          {wp.isin && <p className="text-sm text-slate-500">{wp.isin}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Bestand" value={wp.bestand > 0 ? stueck(wp.bestand) : '0'} />
        <KpiCard label="Investiert" value={euro(wp.investiert)} />
        <KpiCard label="Ø Kaufkurs" value={wp.bestand > 0 ? euro(wp.durchschnittskurs) : '—'} />
        <KpiCard label="Dividenden" value={euro(wp.dividendenGesamt)} color="green" />
      </div>

      {wp.fifoPosten.length > 0 && (
        <Card title="FIFO-Bestand">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-xs text-slate-500">
                <th className="text-left py-2">Kaufdatum</th>
                <th className="text-right py-2">Stück</th>
                <th className="text-right py-2">Kaufkurs</th>
                <th className="text-right py-2">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {wp.fifoPosten.filter(p => p.stueck > 0.0001).map((p, i) => (
                <tr key={i} className="border-b border-slate-800/30">
                  <td className="py-1.5 text-slate-400">{datumKurz(p.kaufDatum)}</td>
                  <td className="py-1.5 text-right text-slate-300 tabular-nums">{stueck(p.stueck)}</td>
                  <td className="py-1.5 text-right text-slate-300 tabular-nums">{euro(p.kaufkurs)}</td>
                  <td className="py-1.5 text-right text-slate-300 tabular-nums">{euro(p.kaufbetrag)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title={`Transaktionen (${wp.transaktionen.length})`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-xs text-slate-500">
              <th className="text-left py-2">Datum</th>
              <th className="text-left py-2">Typ</th>
              <th className="text-right py-2">Stück</th>
              <th className="text-right py-2">Kurs</th>
              <th className="text-right py-2">Betrag</th>
              <th className="text-right py-2">Gebühren</th>
            </tr>
          </thead>
          <tbody>
            {[...wp.transaktionen].reverse().map(tx => {
              const typColor = tx.typ === 'kauf' ? 'text-blue-400'
                : tx.typ === 'verkauf' ? 'text-orange-400'
                : 'text-emerald-400';
              const typLabel = tx.typ === 'kauf' ? 'Kauf'
                : tx.typ === 'verkauf' ? 'Verkauf'
                : tx.typ === 'dividende' ? 'Dividende'
                : 'Ausschüttung';
              return (
                <tr key={tx.id} className="border-b border-slate-800/30">
                  <td className="py-1.5 text-slate-400">{datumKurz(tx.datum)}</td>
                  <td className={`py-1.5 font-medium ${typColor}`}>{typLabel}</td>
                  <td className="py-1.5 text-right text-slate-300 tabular-nums">{stueck(tx.stueck)}</td>
                  <td className="py-1.5 text-right text-slate-300 tabular-nums">{euro(tx.kurs)}</td>
                  <td className="py-1.5 text-right text-slate-300 tabular-nums">{euro(tx.betrag)}</td>
                  <td className="py-1.5 text-right text-slate-500 tabular-nums">{tx.gebuehren > 0 ? euro(tx.gebuehren) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
