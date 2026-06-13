import { useState } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { Toolbar, ValueArrow } from '../components/PPElements';
import { useColumnConfig, ColumnHeader, type ColumnDef } from '../components/useColumnConfig';
import { euro } from '../utils/format';

const STEUER_DETAILS_COLUMNS: ColumnDef[] = [
  { id: 'jahr', label: 'Jahr' },
  { id: 'gewinne', label: 'Gewinne', align: 'right' },
  { id: 'verluste', label: 'Verluste', align: 'right' },
  { id: 'dividenden', label: 'Dividenden', align: 'right' },
  { id: 'verlustvortrag', label: 'Verlustvortr.', align: 'right' },
  { id: 'steuer', label: 'Steuer', align: 'right' },
];

export default function SteuerView() {
  const { state } = usePortfolio();
  const detailsCfg = useColumnConfig('steuer-details', STEUER_DETAILS_COLUMNS);
  const jahre = Object.values(state.steuerJahre).sort((a, b) => b.jahr - a.jahr);
  const [selectedJahr, setSelectedJahr] = useState<number | null>(jahre[0]?.jahr ?? null);
  const sj = selectedJahr ? state.steuerJahre[selectedJahr] : undefined;

  type SteuerJahr = typeof jahre[number];
  const detailSortVal = (j: SteuerJahr, id: string): number | string | null => {
    switch (id) {
      case 'jahr': return j.jahr;
      case 'gewinne': return j.realisierteGewinne;
      case 'verluste': return j.realisierteVerluste;
      case 'dividenden': return j.dividenden;
      case 'verlustvortrag': return j.verlustvortrag;
      case 'steuer': return j.steuerGesamt;
      default: return null;
    }
  };
  const detailCell = (j: SteuerJahr, id: string): React.ReactNode => {
    switch (id) {
      case 'jahr': return <span className="mono" style={{ fontWeight: 500 }}>{j.jahr}</span>;
      case 'gewinne': return <span style={{ color: 'var(--pp-green-text)' }}>{euro(j.realisierteGewinne)}</span>;
      case 'verluste': return <span style={{ color: 'var(--pp-red-text)' }}>{euro(j.realisierteVerluste)}</span>;
      case 'dividenden': return <span style={{ color: 'var(--pp-green-text)' }}>{euro(j.dividenden)}</span>;
      case 'verlustvortrag': return <span style={{ color: j.verlustvortrag < 0 ? 'var(--pp-red-text)' : 'var(--pp-text-muted)' }}>{j.verlustvortrag !== 0 ? euro(j.verlustvortrag) : '—'}</span>;
      case 'steuer': return <span style={{ color: j.steuerGesamt > 0 ? 'var(--pp-red-text)' : 'var(--pp-green-text)', fontWeight: 500 }}>{euro(j.steuerGesamt)}</span>;
      default: return '';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Steuer-Übersicht" showSearch={false}>
        <div className="flex items-center gap-0.5">
          {jahre.map(j => (
            <button
              key={j.jahr}
              type="button"
              onClick={() => setSelectedJahr(j.jahr)}
              className="px-2 py-0.5 rounded text-[11px]"
              style={{
                background: selectedJahr === j.jahr ? 'var(--pp-accent)' : 'transparent',
                color: selectedJahr === j.jahr ? '#1d1f21' : 'var(--pp-text-muted)',
                fontWeight: selectedJahr === j.jahr ? 600 : 400,
              }}
            >
              {j.jahr}
            </button>
          ))}
        </div>
      </Toolbar>

      <div className="flex-1 overflow-auto p-3">
        {!sj ? (
          <p className="text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>Keine Steuerdaten vorhanden.</p>
        ) : (
          <div className="flex gap-6 flex-wrap">
            <table className="pp-table" style={{ maxWidth: 400, border: '1px solid var(--pp-border)' }}>
              <thead><tr><th colSpan={2}>Steuerberechnung {selectedJahr}</th></tr></thead>
              <tbody>
                {([
                  { l: 'Realisierte Gewinne', v: euro(sj.realisierteGewinne), c: 'var(--pp-green-text)' },
                  { l: 'Realisierte Verluste', v: euro(sj.realisierteVerluste), c: 'var(--pp-red-text)' },
                  { l: 'Dividenden', v: euro(sj.dividenden), c: 'var(--pp-green-text)' },
                  { l: 'Saldo', v: euro(sj.saldo), c: sj.saldo >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' },
                  ...(sj.verlustvortrag !== 0 ? [{ l: 'Verlustvortrag', v: euro(sj.verlustvortrag), c: 'var(--pp-red-text)' }] : []),
                  { l: `Sparer-Pauschbetrag`, v: `−${euro(sj.sparerPauschbetrag)}`, c: '' },
                  { l: 'Steuerpflichtig', v: euro(sj.steuerpflichtig), c: sj.steuerpflichtig > 0 ? 'var(--pp-red-text)' : 'var(--pp-green-text)' },
                  { l: 'Abgeltungsteuer (25%)', v: euro(sj.abgeltungsteuer), c: '' },
                  { l: 'Soli (5,5%)', v: euro(sj.soli), c: '' },
                  { l: 'Steuer gesamt', v: euro(sj.steuerGesamt), c: sj.steuerGesamt > 0 ? 'var(--pp-red-text)' : 'var(--pp-green-text)' },
                ] as const).map(({ l, v, c }) => (
                  <tr key={l} className="pp-row">
                    <td style={{ color: 'var(--pp-text-muted)' }}>{l}</td>
                    <td className="right mono" style={{ color: c || 'var(--pp-text)', fontWeight: l === 'Steuer gesamt' ? 600 : 400 }}>
                      <span className="inline-flex items-center gap-1">
                        {v}
                        {l === 'Steuer gesamt' && <ValueArrow value={-sj.steuerGesamt} />}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="pp-table" style={{ border: '1px solid var(--pp-border)' }}>
              <thead>
                <tr>
                  {detailsCfg.orderedColumns.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={detailsCfg} />)}
                </tr>
              </thead>
              <tbody>
                {detailsCfg.sortData(jahre, detailSortVal).map(j => (
                  <tr
                    key={j.jahr}
                    className={`pp-row${selectedJahr === j.jahr ? ' selected' : ''}`}
                    onClick={() => setSelectedJahr(j.jahr)}
                    style={{ cursor: 'pointer' }}
                  >
                    {detailsCfg.orderedColumns.map(c => (
                      <td key={c.id} className={c.align === 'right' ? 'right mono' : 'mono'}>
                        {detailCell(j, c.id)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
