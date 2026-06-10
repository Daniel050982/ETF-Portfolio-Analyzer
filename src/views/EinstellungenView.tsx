import { Toolbar } from '../components/PPElements';

export default function EinstellungenView() {
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
            <p>Daten werden lokal im Browser gespeichert (localStorage).</p>
            <p>Keine Daten werden an Server gesendet.</p>
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
