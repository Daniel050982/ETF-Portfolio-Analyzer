import { Link } from 'react-router-dom';
import { usePortfolio } from '../store/PortfolioContext';
import { Card } from '../components/ui/Card';
import { euro, stueck, datumKurz } from '../utils/format';

export default function PortfolioPage() {
  const { state } = usePortfolio();
  const wps = Object.values(state.wertpapiere).sort((a, b) => b.investiert - a.investiert);

  if (wps.length === 0) {
    return (
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-12 text-center">
        <p className="text-slate-400">Keine Wertpapiere vorhanden. <Link to="/import" className="text-emerald-400 hover:underline">CSV importieren</Link></p>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-4 py-6 space-y-4">
      {wps.map(wp => {
        const key = wp.isin || wp.name;
        const letzteKaeufe = wp.fifoPosten.slice(-3);
        return (
          <Card key={key}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Link
                  to={`/portfolio/${encodeURIComponent(key)}`}
                  className="text-base font-semibold text-slate-200 hover:text-emerald-400 transition"
                >
                  {wp.name}
                </Link>
                {wp.isin && <p className="text-xs text-slate-600 mt-0.5">{wp.isin}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold text-slate-100">{euro(wp.investiert)}</p>
                <p className="text-xs text-slate-500">
                  {wp.bestand > 0 ? `${stueck(wp.bestand)} Stück · Ø ${euro(wp.durchschnittskurs)}` : 'Kein Bestand'}
                </p>
              </div>
            </div>
            {letzteKaeufe.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700/30">
                <p className="text-xs text-slate-500 mb-1">FIFO-Posten (letzte {letzteKaeufe.length})</p>
                <div className="grid grid-cols-3 gap-2">
                  {letzteKaeufe.map((p, i) => (
                    <div key={i} className="text-xs text-slate-400 bg-slate-900/50 rounded-lg px-2 py-1.5">
                      <span className="text-slate-500">{datumKurz(p.kaufDatum)}</span>
                      <span className="mx-1">·</span>
                      <span>{stueck(p.stueck)} × {euro(p.kaufkurs)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {wp.dividendenGesamt > 0 && (
              <div className="mt-2 text-xs text-emerald-400">
                Dividenden gesamt: {euro(wp.dividendenGesamt)}
              </div>
            )}
          </Card>
        );
      })}
    </main>
  );
}
