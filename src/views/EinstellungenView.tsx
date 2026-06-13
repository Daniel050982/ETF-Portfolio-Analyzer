import { useState } from 'react';
import { Toolbar } from '../components/PPElements';
import { usePortfolio } from '../store/PortfolioContext';

export default function EinstellungenView() {
  const { resetAll } = usePortfolio();
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!confirm('Alle lokalen Daten (IndexedDB + localStorage) wirklich löschen? Du musst danach die XML-Datei erneut importieren.')) return;
    setResetting(true);
    await resetAll();
    setResetting(false);
  };

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Einstellungen" showSearch={false} />
      <div className="flex-1 overflow-auto p-3 max-w-lg space-y-4">
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--pp-border)' }}>
          <div className="px-3 py-2" style={{ background: 'var(--pp-header-bg)', borderBottom: '1px solid var(--pp-border)' }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--pp-text)' }}>Info</span>
          </div>
          <div className="p-3 text-[12px] space-y-2" style={{ color: 'var(--pp-text-muted)' }}>
            <p><span style={{ color: 'var(--pp-text)' }} className="font-medium">ETF Portfolio Analyzer</span> v1.0</p>
            <p>Daten werden in IndexedDB und localStorage gespeichert.</p>
            <p>Keine Daten werden an Server gesendet.</p>
          </div>
        </div>

        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--pp-border)' }}>
          <div className="px-3 py-2" style={{ background: 'var(--pp-header-bg)', borderBottom: '1px solid var(--pp-border)' }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--pp-text)' }}>Daten</span>
          </div>
          <div className="p-3 text-[12px] space-y-2">
            <p style={{ color: 'var(--pp-text-muted)' }}>
              Alle gespeicherten Daten (Transaktionen, Kurse, Wertpapiere) aus dem Browser löschen.
              Nach dem Reset muss die PP-XML-Datei erneut importiert werden.
            </p>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="px-3 py-1.5 rounded text-[12px] font-medium"
              style={{
                background: resetting ? 'var(--pp-border)' : '#c62828',
                color: '#fff',
                border: 'none',
                cursor: resetting ? 'not-allowed' : 'pointer',
              }}
            >
              {resetting ? 'Wird gelöscht...' : 'Alle Daten löschen & Reset'}
            </button>
          </div>
        </div>

        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--pp-border)' }}>
          <div className="px-3 py-2" style={{ background: 'var(--pp-header-bg)', borderBottom: '1px solid var(--pp-border)' }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--pp-text)' }}>Geplante Features</span>
          </div>
          <div className="p-3 text-[12px] space-y-1" style={{ color: 'var(--pp-text-disabled)' }}>
            <p>Phase 2: TTWROR, IRR, Benchmark-Vergleich</p>
            <p>Phase 3: Portfolio-Überlappungen, Rebalancing</p>
            <p>Phase 4: XML-Import, What-if-Simulator</p>
          </div>
        </div>
      </div>
    </div>
  );
}
