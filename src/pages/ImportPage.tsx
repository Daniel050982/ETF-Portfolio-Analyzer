import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { usePortfolio } from '../store/PortfolioContext';
import { parsePortfolioPerformanceCSV } from '../core/csvParser';
import { Card } from '../components/ui/Card';
import { euro, datumKurz } from '../utils/format';
import type { Transaktion } from '../types/portfolio';

export default function ImportPage() {
  const { state, importTransaktionen, clearAll } = usePortfolio();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Transaktion[] | null>(null);
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
        const transaktionen = parsePortfolioPerformanceCSV(text);
        if (transaktionen.length === 0) {
          setError('Keine Transaktionen in der CSV gefunden. Stelle sicher, dass es sich um einen Portfolio Performance Export handelt.');
          return;
        }
        setPreview(transaktionen);
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
    importTransaktionen(preview);
    setSuccess(`${preview.length} Transaktionen erfolgreich importiert!`);
    setPreview(null);
    setTimeout(() => navigate('/'), 1500);
  }, [preview, importTransaktionen, navigate]);

  const handleClear = useCallback(() => {
    if (confirm('Alle Daten löschen? Das kann nicht rückgängig gemacht werden.')) {
      clearAll();
      setSuccess('Alle Daten gelöscht.');
      setPreview(null);
    }
  }, [clearAll]);

  return (
    <main className="max-w-3xl mx-auto px-3 sm:px-4 py-6 space-y-6">
      <Card title="CSV Import — Portfolio Performance">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Exportiere in Portfolio Performance: <span className="text-slate-200">Datei → Alle Buchungen exportieren → CSV</span>.
            Unterstützt werden deutsche und englische Spaltenbezeichnungen.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`relative rounded-xl border-2 border-dashed p-8 text-center transition ${
              dragOver
                ? 'border-emerald-400 bg-emerald-500/5'
                : 'border-slate-700 hover:border-slate-600'
            }`}
          >
            <Upload className="w-10 h-10 mx-auto text-slate-500 mb-3" />
            <p className="text-sm text-slate-400">
              CSV-Datei hierher ziehen oder{' '}
              <label className="text-emerald-400 hover:underline cursor-pointer">
                Datei auswählen
                <input type="file" accept=".csv,.txt" onChange={handleFileInput} className="hidden" />
              </label>
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-300">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}
        </div>
      </Card>

      {preview && (
        <Card title={`Vorschau — ${preview.length} Transaktionen`}>
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="border-b border-slate-700/50 text-xs text-slate-500">
                  <th className="text-left py-2">Datum</th>
                  <th className="text-left py-2">Typ</th>
                  <th className="text-left py-2">Wertpapier</th>
                  <th className="text-right py-2">Stück</th>
                  <th className="text-right py-2">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map(tx => (
                  <tr key={tx.id} className="border-b border-slate-800/30">
                    <td className="py-1 text-slate-400">{datumKurz(tx.datum)}</td>
                    <td className={`py-1 font-medium ${tx.typ === 'kauf' ? 'text-blue-400' : tx.typ === 'verkauf' ? 'text-orange-400' : 'text-emerald-400'}`}>
                      {tx.typ}
                    </td>
                    <td className="py-1 text-slate-300">{tx.wertpapierName.slice(0, 35)}</td>
                    <td className="py-1 text-right text-slate-300 tabular-nums">{tx.stueck}</td>
                    <td className="py-1 text-right text-slate-300 tabular-nums">{euro(tx.betrag)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 50 && (
              <p className="text-xs text-slate-500 text-center py-2">… und {preview.length - 50} weitere</p>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-700/30">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="px-4 py-2 rounded-lg border border-slate-600 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="px-5 py-2 rounded-lg bg-emerald-500 text-slate-950 text-sm font-semibold hover:bg-emerald-400 transition"
            >
              {preview.length} Transaktionen importieren
            </button>
          </div>
        </Card>
      )}

      {state.transaktionen.length > 0 && (
        <Card title="Daten verwalten">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">{state.transaktionen.length} Transaktionen geladen</p>
              <p className="text-xs text-slate-500">{Object.keys(state.wertpapiere).length} Wertpapiere erkannt</p>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-sm text-red-400 hover:bg-red-500/10 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Alle Daten löschen
            </button>
          </div>
        </Card>
      )}
    </main>
  );
}
