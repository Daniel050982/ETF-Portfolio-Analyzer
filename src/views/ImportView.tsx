import { useState, useCallback } from 'react';
import { Upload, AlertTriangle, CheckCircle2, Trash2, FileText, FileCode } from 'lucide-react';
import { usePortfolio } from '../store/PortfolioContext';
import { parsePortfolioPerformanceCSV } from '../core/csvParser';
import { parsePortfolioPerformanceXML } from '../core/xmlParser';
import { Toolbar } from '../components/PPElements';
import { euro, datumKurz } from '../utils/format';
import type { Transaktion } from '../types/portfolio';
import type { PPImportResult, ImportDebugLog } from '../core/xmlParser';

type ImportPreview =
  | { type: 'csv'; transaktionen: Transaktion[] }
  | { type: 'xml'; result: PPImportResult };

function DebugPanel({ debug }: { debug: ImportDebugLog }) {
  const g = debug.globalCollector;
  return (
    <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--pp-border)', background: 'rgba(0,0,0,0.2)' }}>
      <span className="text-[11px] font-semibold" style={{ color: 'var(--pp-accent)' }}>Debug: Parser-Analyse</span>

      <div className="text-[10px] font-mono space-y-1" style={{ color: 'var(--pp-text-secondary)' }}>
        <p style={{ color: 'var(--pp-text-muted)' }}>{debug.xmlStructure}</p>

        <div style={{ color: 'var(--pp-green-text)' }}>
          <p className="font-semibold">Global Collector:</p>
          <p className="ml-2">
            XML-Elemente gesamt: {g.totalElements} (Referenzen: {g.refElements}, Parse-Fehler: {g.parseFailed})
          </p>
          <p className="ml-2">
            Unique TX: <span style={{ color: 'var(--pp-accent)' }}>{g.uniqueTx}</span>
            {' '}(Konto: {g.kontoTxCount}, Depot: {g.depotTxCount}, Unzugeordnet: {g.unassignedCount})
          </p>
        </div>

        {debug.sparplaene.length > 0 && (
          <div>
            <p className="font-semibold mt-1" style={{ color: 'var(--pp-text)' }}>
              Sparpläne ({debug.sparplaene.length}) — Generiert: <span style={{ color: 'var(--pp-accent)' }}>{debug.sparplanTxGenerated}</span>
            </p>
            {debug.sparplaene.map((sp, i) => (
              <div key={i} className="ml-2">
                <p>
                  <span style={{ color: 'var(--pp-text)' }}>{sp.name}</span>
                  {' — '}WP: {sp.wpKey || '?'}
                  {' | '}Start: {sp.startDatum}
                  {' | '}Intervall: {sp.intervall}M
                  {' | '}Betrag: {euro(sp.betrag)}
                  {' | '}Generiert: <span style={{ color: sp.generatedCount > 0 ? 'var(--pp-green-text)' : 'var(--pp-text-muted)' }}>{sp.generatedCount}</span>
                  {sp.skippedDup > 0 && <span style={{ color: 'var(--pp-green-text)' }}> (Dedup: {sp.skippedDup} in XML)</span>}
                  {' | '}Kurse: {sp.kursCount}
                </p>
                <p className="ml-2" style={{ fontSize: '9px', color: 'var(--pp-text-muted)' }}>
                  sec: {sp.secRef?.substring(0, 80) || 'none'} {sp.secResolved ? '✓' : '✗'}
                  {' | '}ptf: {sp.ptfRef?.substring(0, 40) || 'none'}
                  {' | '}acc: {sp.accRef?.substring(0, 40) || 'none'}
                </p>
              </div>
            ))}
          </div>
        )}

        <p className="font-semibold mt-1" style={{ color: 'var(--pp-accent)' }}>
          FINAL: {debug.finalTotal} Transaktionen | {debug.kontenCount} Konten | {debug.depotsCount} Depots
        </p>
      </div>
    </div>
  );
}

export default function ImportView() {
  const { state, importTransaktionen, importXML, clearAll } = usePortfolio();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback((file: File) => {
    setError(null);
    setSuccess(null);
    setPreview(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;

        if (file.name.endsWith('.xml') || text.trimStart().startsWith('<?xml') || text.trimStart().startsWith('<client')) {
          const result = parsePortfolioPerformanceXML(text);
          if (result.transaktionen.length === 0 && result.konten.length === 0) {
            setError('Keine Daten gefunden. Ist das eine gültige Portfolio Performance Datei?');
            return;
          }
          setPreview({ type: 'xml', result });
        } else {
          const transaktionen = parsePortfolioPerformanceCSV(text);
          if (transaktionen.length === 0) {
            setError('Keine Transaktionen gefunden. Stelle sicher, dass es sich um einen Portfolio Performance Export handelt.');
            return;
          }
          setPreview({ type: 'csv', transaktionen });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler beim Parsen');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  const handleDrop = useCallback((ev: React.DragEvent) => {
    ev.preventDefault();
    setDragOver(false);
    const file = ev.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleImport = useCallback(() => {
    if (!preview) return;
    if (preview.type === 'csv') {
      importTransaktionen(preview.transaktionen);
      setSuccess(`${preview.transaktionen.length} Transaktionen erfolgreich importiert!`);
    } else {
      importXML(preview.result);
      const { result } = preview;
      const parts: string[] = [];
      if (result.transaktionen.length) parts.push(`${result.transaktionen.length} Transaktionen`);
      if (result.wertpapierDaten.size) parts.push(`${result.wertpapierDaten.size} Wertpapiere`);
      if (result.konten.length) parts.push(`${result.konten.length} Konten`);
      if (result.depots.length) parts.push(`${result.depots.length} Depots`);
      if (result.sparplaene.length) parts.push(`${result.sparplaene.length} Sparpläne`);
      setSuccess(`Erfolgreich importiert: ${parts.join(', ')}`);
    }
    setPreview(null);
  }, [preview, importTransaktionen, importXML]);

  const handleClear = useCallback(() => {
    if (confirm('Alle Daten löschen? Das kann nicht rückgängig gemacht werden.')) {
      clearAll();
      setSuccess('Alle Daten gelöscht.');
      setPreview(null);
    }
  }, [clearAll]);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Daten importieren" showSearch={false} />

      <div className="flex-1 overflow-auto p-3 space-y-4 max-w-3xl">
        {/* Drag & Drop */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className="rounded-lg border-2 border-dashed p-6 text-center transition"
          style={{
            borderColor: dragOver ? 'var(--pp-accent)' : 'var(--pp-border)',
            background: dragOver ? 'rgba(245,166,35,0.05)' : 'transparent',
          }}
        >
          <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--pp-text-muted)' }} />
          <p className="text-[12px]" style={{ color: 'var(--pp-text-secondary)' }}>
            Portfolio Performance Datei hier ablegen oder{' '}
            <label className="cursor-pointer" style={{ color: 'var(--pp-link)', textDecoration: 'underline' }}>
              Datei wählen
              <input type="file" accept=".xml,.csv,.txt" onChange={handleFileInput} className="hidden" />
            </label>
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--pp-text-muted)' }}>
              <FileCode className="w-3.5 h-3.5" style={{ color: 'var(--pp-accent)' }} />
              <span><strong>.xml</strong> — Vollständiger PP-Export (empfohlen)</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--pp-text-muted)' }}>
              <FileText className="w-3.5 h-3.5" style={{ color: 'var(--pp-link)' }} />
              <span><strong>.csv</strong> — Buchungen-Export</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg p-2 text-[12px]" style={{ background: 'rgba(255,43,48,0.1)', border: '1px solid rgba(255,43,48,0.2)', color: 'var(--pp-red-text)' }}>
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 rounded-lg p-2 text-[12px]" style={{ background: 'rgba(26,173,33,0.1)', border: '1px solid rgba(26,173,33,0.2)', color: 'var(--pp-green-text)' }}>
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Vorschau */}
        {preview && (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--pp-border)' }}>
            <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: 'var(--pp-header-bg)', borderBottom: '1px solid var(--pp-border)' }}>
              <span className="text-[12px] font-medium" style={{ color: 'var(--pp-text)' }}>
                {preview.type === 'xml' ? (
                  <>
                    XML-Import — {preview.result.transaktionen.length} Transaktionen, {preview.result.wertpapierDaten.size} Wertpapiere
                    {preview.result.konten.length > 0 && `, ${preview.result.konten.length} Konten`}
                    {preview.result.depots.length > 0 && `, ${preview.result.depots.length} Depots`}
                  </>
                ) : (
                  <>CSV-Import — {preview.transaktionen.length} Transaktionen</>
                )}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPreview(null)} className="px-2 py-0.5 rounded text-[11px]" style={{ color: 'var(--pp-text-muted)', border: '1px solid var(--pp-border)' }}>
                  Abbrechen
                </button>
                <button type="button" onClick={handleImport} className="px-3 py-0.5 rounded text-[11px]" style={{ background: 'var(--pp-accent)', color: '#1d1f21', fontWeight: 600 }}>
                  Importieren
                </button>
              </div>
            </div>

            {/* XML-Zusammenfassung */}
            {preview.type === 'xml' && (
              <div className="p-3 space-y-2">
                {preview.result.wertpapierDaten.size > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--pp-text)' }}>Wertpapiere ({preview.result.wertpapierDaten.size})</span>
                    <div className="mt-1 space-y-0.5">
                      {[...preview.result.wertpapierDaten.entries()].slice(0, 10).map(([key, wp]) => (
                        <div key={key} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--pp-text-secondary)' }}>
                          <span className="truncate flex-1">{wp.name}</span>
                          <span style={{ color: 'var(--pp-text-muted)' }}>{wp.isin}</span>
                          {wp.kursHistorie && wp.kursHistorie.length > 0 && (
                            <span style={{ color: 'var(--pp-green-text)' }}>{wp.kursHistorie.length} Kurse</span>
                          )}
                        </div>
                      ))}
                      {preview.result.wertpapierDaten.size > 10 && (
                        <span className="text-[10px]" style={{ color: 'var(--pp-text-disabled)' }}>… und {preview.result.wertpapierDaten.size - 10} weitere</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Debug-Info */}
            {preview.type === 'xml' && preview.result.debug && (
              <DebugPanel debug={preview.result.debug} />
            )}

            {/* CSV-Tabelle */}
            {preview.type === 'csv' && (
              <div className="max-h-48 overflow-auto">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Datum</th>
                      <th style={{ width: 100 }}>Typ</th>
                      <th style={{ width: 200 }}>Wertpapier</th>
                      <th className="right" style={{ width: 100 }}>Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.transaktionen.slice(0, 30).map(tx => (
                      <tr key={tx.id} className="pp-row">
                        <td className="mono">{datumKurz(tx.datum)}</td>
                        <td>{tx.typ}</td>
                        <td className="truncate">{tx.wertpapierName}</td>
                        <td className="right mono">{euro(tx.betrag)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.transaktionen.length > 30 && (
                  <p className="text-[11px] text-center py-1" style={{ color: 'var(--pp-text-disabled)' }}>… und {preview.transaktionen.length - 30} weitere</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Datenverwaltung */}
        {state.transaktionen.length > 0 && (
          <div className="rounded-lg p-3 flex items-center justify-between" style={{ border: '1px solid var(--pp-border)' }}>
            <div className="text-[12px]">
              <p style={{ color: 'var(--pp-text)' }}>{state.transaktionen.length} Transaktionen geladen</p>
              <p style={{ color: 'var(--pp-text-muted)' }}>
                {Object.keys(state.wertpapiere).length} Wertpapiere
                {Object.keys(state.konten).length > 0 && ` · ${Object.keys(state.konten).length} Konten`}
                {Object.keys(state.depots).length > 0 && ` · ${Object.keys(state.depots).length} Depots`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px]"
              style={{ border: '1px solid rgba(255,43,48,0.3)', color: 'var(--pp-red-text)' }}
            >
              <Trash2 className="w-3 h-3" />
              Alle löschen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
