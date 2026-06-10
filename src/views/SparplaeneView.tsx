import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { Toolbar } from '../components/PPElements';
import { euro, datumKurz } from '../utils/format';
import type { Sparplan } from '../types/portfolio';

const COLUMNS: PPColumn<Sparplan>[] = [
  { id: 'name', label: 'Sparplan', width: 200, render: sp => sp.name, sortFn: (a, b) => a.name.localeCompare(b.name) },
  { id: 'wertpapier', label: 'Wertpapier', width: 200, render: sp => sp.wertpapierKey },
  { id: 'depot', label: 'Depot', width: 120, render: sp => sp.depotName },
  { id: 'konto', label: 'Konto', width: 140, render: sp => sp.kontoName },
  { id: 'betrag', label: 'Betrag', width: 100, align: 'right', render: sp => euro(sp.betrag), sortFn: (a, b) => a.betrag - b.betrag },
  { id: 'intervall', label: 'Intervall', width: 80, render: sp => `${sp.intervall} Monat${sp.intervall > 1 ? 'e' : ''}` },
  { id: 'start', label: 'Start', width: 90, render: sp => datumKurz(sp.startDatum) },
  { id: 'aktiv', label: 'Status', width: 70, render: sp => sp.aktiv ? 'Aktiv' : 'Inaktiv' },
];

export default function SparplaeneView() {
  const { state } = usePortfolio();
  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Sparpläne" showSearch={false} />
      {state.sparplaene.length > 0 ? (
        <PPTable columns={COLUMNS} data={state.sparplaene} rowKey={(sp, i) => `${sp.name}-${i}`} storageKey="sparplaene" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Keine Sparpläne vorhanden. Importiere eine PP-XML-Datei mit Sparplänen.
        </div>
      )}
    </div>
  );
}
