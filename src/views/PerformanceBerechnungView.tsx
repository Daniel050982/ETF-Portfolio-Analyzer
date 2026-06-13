import { useMemo } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar } from '../components/PPElements';
import { useResizableColumns } from '../components/useResizableColumns';
import { euro, prozent } from '../utils/format';
import { berechnePerformance } from '../core/performance';

export default function PerformanceBerechnungView() {
  const { state } = usePortfolio();
  const perf1Ref = useResizableColumns<HTMLTableElement>('perf-1');
  const perf2Ref = useResizableColumns<HTMLTableElement>('perf-2');
  const perf3Ref = useResizableColumns<HTMLTableElement>('perf-3');

  const perf = useMemo(() => berechnePerformance(state.transaktionen, state.wertpapiere), [state.transaktionen, state.wertpapiere]);

  const stats = useMemo(() => {
    let kaeufe = 0, verkaeufe = 0, dividenden = 0, gebuehren = 0, steuern = 0;
    for (const tx of state.transaktionen) {
      if (tx.typ === 'kauf') kaeufe += tx.betrag;
      else if (tx.typ === 'verkauf') verkaeufe += tx.betrag;
      else if (tx.typ === 'dividende' || tx.typ === 'ausschuettung') dividenden += tx.betrag;
      gebuehren += tx.gebuehren;
      steuern += tx.steuern;
    }
    const steuerJahre = Object.values(state.steuerJahre);
    const investiert = Object.values(state.wertpapiere).reduce((s, wp) => s + wp.investiert, 0);
    const marktwert = Object.values(state.wertpapiere).reduce((s, wp) => s + (wp.marktwert ?? wp.investiert), 0);
    return {
      kaeufe, verkaeufe, dividenden, gebuehren, steuern,
      realisierteGewinne: steuerJahre.reduce((s, sj) => s + sj.realisierteGewinne, 0),
      realisierteVerluste: steuerJahre.reduce((s, sj) => s + sj.realisierteVerluste, 0),
      investiert,
      marktwert,
      unrealisiert: marktwert - investiert,
    };
  }, [state]);

  const Row = ({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) => (
    <tr className="pp-row">
      <td style={{ color: 'var(--pp-text-muted)' }}>{label}</td>
      <td className="right mono" style={{ color: color || 'var(--pp-text)', fontWeight: bold ? 600 : 400 }}>{value}</td>
    </tr>
  );

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Performance — Berechnung" showSearch={false} />
      <div className="flex-1 overflow-auto p-3">
        <div className="flex gap-6 flex-wrap">
          {/* Performance-Kennzahlen */}
          <table className="pp-table" ref={perf1Ref} style={{ maxWidth: 380, border: '1px solid var(--pp-border)' }}>
            <thead><tr><th colSpan={2}>Performance-Kennzahlen</th></tr></thead>
            <tbody>
              <Row label="TTWROR (zeitgew. Rendite)" value={prozent(perf.ttwror)} color={perf.ttwror >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)'} bold />
              <Row label="IZF / IRR (int. Zinsfuß)" value={prozent(perf.irr)} color={perf.irr >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)'} bold />
              <Row label="Max. Drawdown" value={prozent(perf.maxDrawdown)} color="var(--pp-red-text)" />
              <Row label="Volatilität (ann.)" value={prozent(perf.volatilitaet)} />
            </tbody>
          </table>

          {/* Kapitalflüsse */}
          <table className="pp-table" ref={perf2Ref} style={{ maxWidth: 380, border: '1px solid var(--pp-border)' }}>
            <thead><tr><th colSpan={2}>Kapitalflüsse</th></tr></thead>
            <tbody>
              <Row label="Käufe" value={euro(stats.kaeufe)} />
              <Row label="Verkäufe" value={euro(stats.verkaeufe)} />
              <Row label="Dividenden" value={euro(stats.dividenden)} color="var(--pp-green-text)" />
              <Row label="Gebühren" value={euro(stats.gebuehren)} color="var(--pp-red-text)" />
              <Row label="Steuern" value={euro(stats.steuern)} color="var(--pp-red-text)" />
            </tbody>
          </table>

          {/* Ergebnisse */}
          <table className="pp-table" ref={perf3Ref} style={{ maxWidth: 380, border: '1px solid var(--pp-border)' }}>
            <thead><tr><th colSpan={2}>Ergebnisse</th></tr></thead>
            <tbody>
              <Row label="Realisierte Gewinne" value={euro(stats.realisierteGewinne)} color="var(--pp-green-text)" />
              <Row label="Realisierte Verluste" value={euro(stats.realisierteVerluste)} color="var(--pp-red-text)" />
              <Row label="Investiert" value={euro(stats.investiert)} />
              <Row label="Marktwert" value={euro(stats.marktwert)} bold />
              <Row label="Unrealisierter Gewinn" value={euro(stats.unrealisiert)} color={stats.unrealisiert >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)'} bold />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
