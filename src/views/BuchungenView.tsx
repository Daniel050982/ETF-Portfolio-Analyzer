import { useState, useMemo, useCallback } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { Toolbar } from '../components/PPElements';
import { euro, stueck, datumKurz } from '../utils/format';
import type { Transaktion } from '../types/portfolio';
import { Pencil, Trash2 } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  kauf: 'Kauf', verkauf: 'Verkauf', dividende: 'Dividende', ausschuettung: 'Ausschüttung',
  einlage: 'Einlage', entnahme: 'Entnahme', zinsen: 'Zinsen', gebuehren: 'Gebühren',
  steuern_tx: 'Steuern', steuererstattung: 'Steuererstattung',
  umbuchung_ein: 'Umbuchung (Ein)', umbuchung_aus: 'Umbuchung (Aus)',
};

const ALL_TYPES = Object.keys(TYPE_LABELS) as Transaktion['typ'][];

function formatDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function TransaktionModal({ tx, onSave, onClose }: { tx: Transaktion; onSave: (tx: Transaktion) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    datum: formatDateInput(tx.datum),
    typ: tx.typ,
    wertpapierName: tx.wertpapierName,
    isin: tx.isin,
    stueck: tx.stueck,
    kurs: tx.kurs,
    betrag: tx.betrag,
    gebuehren: tx.gebuehren,
    steuern: tx.steuern,
    waehrung: tx.waehrung,
    notiz: tx.notiz ?? '',
    kontoName: tx.kontoName ?? '',
    depotName: tx.depotName ?? '',
  });

  const set = (key: string, value: string | number) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = () => {
    onSave({
      ...tx,
      datum: new Date(form.datum),
      typ: form.typ as Transaktion['typ'],
      wertpapierName: form.wertpapierName,
      isin: form.isin,
      stueck: Number(form.stueck),
      kurs: Number(form.kurs),
      betrag: Number(form.betrag),
      gebuehren: Number(form.gebuehren),
      steuern: Number(form.steuern),
      waehrung: form.waehrung,
      notiz: form.notiz || undefined,
      kontoName: form.kontoName || undefined,
      depotName: form.depotName || undefined,
    });
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--pp-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)',
    padding: '4px 8px', fontSize: 12, borderRadius: 2, width: '100%',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-[520px] rounded shadow-lg" style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)' }} onClick={e => e.stopPropagation()}>
        <div className="px-4 py-2 text-[12px] font-semibold" style={{ background: 'var(--pp-header-bg)', borderBottom: '1px solid var(--pp-border)' }}>
          Transaktion bearbeiten
        </div>
        <div className="p-4 grid grid-cols-2 gap-3 text-[11px]">
          <label>
            <span style={{ color: 'var(--pp-text-muted)' }}>Datum</span>
            <input type="date" value={form.datum} onChange={e => set('datum', e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={{ color: 'var(--pp-text-muted)' }}>Typ</span>
            <select value={form.typ} onChange={e => set('typ', e.target.value)} style={inputStyle}>
              {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label className="col-span-2">
            <span style={{ color: 'var(--pp-text-muted)' }}>Wertpapier</span>
            <input value={form.wertpapierName} onChange={e => set('wertpapierName', e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={{ color: 'var(--pp-text-muted)' }}>ISIN</span>
            <input value={form.isin} onChange={e => set('isin', e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={{ color: 'var(--pp-text-muted)' }}>Währung</span>
            <input value={form.waehrung} onChange={e => set('waehrung', e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={{ color: 'var(--pp-text-muted)' }}>Stück</span>
            <input type="number" step="any" value={form.stueck} onChange={e => set('stueck', e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={{ color: 'var(--pp-text-muted)' }}>Kurs</span>
            <input type="number" step="any" value={form.kurs} onChange={e => set('kurs', e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={{ color: 'var(--pp-text-muted)' }}>Betrag</span>
            <input type="number" step="any" value={form.betrag} onChange={e => set('betrag', e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={{ color: 'var(--pp-text-muted)' }}>Gebühren</span>
            <input type="number" step="any" value={form.gebuehren} onChange={e => set('gebuehren', e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={{ color: 'var(--pp-text-muted)' }}>Steuern</span>
            <input type="number" step="any" value={form.steuern} onChange={e => set('steuern', e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={{ color: 'var(--pp-text-muted)' }}>Konto</span>
            <input value={form.kontoName} onChange={e => set('kontoName', e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={{ color: 'var(--pp-text-muted)' }}>Depot</span>
            <input value={form.depotName} onChange={e => set('depotName', e.target.value)} style={inputStyle} />
          </label>
          <label className="col-span-2">
            <span style={{ color: 'var(--pp-text-muted)' }}>Notiz</span>
            <input value={form.notiz} onChange={e => set('notiz', e.target.value)} style={inputStyle} />
          </label>
        </div>
        <div className="flex justify-end gap-2 px-4 py-2" style={{ borderTop: '1px solid var(--pp-border)' }}>
          <button type="button" onClick={onClose} className="px-3 py-1 text-[11px] rounded" style={{ background: 'var(--pp-bg)', color: 'var(--pp-text-muted)', border: '1px solid var(--pp-border)' }}>
            Abbrechen
          </button>
          <button type="button" onClick={handleSave} className="px-3 py-1 text-[11px] rounded" style={{ background: 'var(--pp-accent)', color: '#000', fontWeight: 600 }}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BuchungenView() {
  const { state, editTransaktion, deleteTransaktion } = usePortfolio();
  const [search, setSearch] = useState('');
  const [editingTx, setEditingTx] = useState<Transaktion | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...state.transaktionen].sort((a, b) => b.datum.getTime() - a.datum.getTime());
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(tx => tx.wertpapierName.toLowerCase().includes(q) || tx.isin.toLowerCase().includes(q));
    }
    return list;
  }, [state.transaktionen, search]);

  const handleSave = useCallback((tx: Transaktion) => {
    editTransaktion(tx);
    setEditingTx(null);
  }, [editTransaktion]);

  const handleDelete = useCallback((id: string) => {
    deleteTransaktion(id);
    setConfirmDelete(null);
  }, [deleteTransaktion]);

  const COLUMNS: PPColumn<Transaktion>[] = useMemo(() => [
    { id: 'datum', label: 'Datum', width: 90, render: tx => datumKurz(tx.datum), sortFn: (a, b) => a.datum.getTime() - b.datum.getTime() },
    { id: 'typ', label: 'Typ', width: 100, render: tx => TYPE_LABELS[tx.typ] ?? tx.typ },
    { id: 'wertpapier', label: 'Wertpapier', width: 220, render: tx => tx.wertpapierName, sortFn: (a, b) => a.wertpapierName.localeCompare(b.wertpapierName) },
    { id: 'isin', label: 'ISIN', width: 120, render: tx => <span style={{ color: 'var(--pp-text-muted)' }}>{tx.isin}</span> },
    { id: 'stueck', label: 'Stück', width: 80, align: 'right', render: tx => tx.stueck > 0 ? stueck(tx.stueck) : '', sortFn: (a, b) => a.stueck - b.stueck },
    { id: 'kurs', label: 'Kurs', width: 90, align: 'right', render: tx => tx.kurs > 0 ? euro(tx.kurs) : '' },
    { id: 'betrag', label: 'Betrag', width: 100, align: 'right', render: tx => euro(tx.betrag), sortFn: (a, b) => a.betrag - b.betrag },
    { id: 'gebuehren', label: 'Gebühren', width: 80, align: 'right', render: tx => tx.gebuehren > 0 ? <span style={{ color: 'var(--pp-red-text)' }}>{euro(tx.gebuehren)}</span> : '' },
    { id: 'steuern', label: 'Steuern', width: 80, align: 'right', render: tx => tx.steuern > 0 ? <span style={{ color: 'var(--pp-red-text)' }}>{euro(tx.steuern)}</span> : '' },
    { id: 'konto', label: 'Konto', width: 110, render: tx => tx.kontoName ?? '' },
    { id: 'depot', label: 'Depot', width: 110, render: tx => tx.depotName ?? '' },
    { id: 'notiz', label: 'Notiz', width: 120, render: tx => tx.notiz ?? '' },
    {
      id: 'aktionen', label: '', width: 60,
      render: tx => (
        <span className="flex items-center gap-1">
          <button type="button" title="Bearbeiten" onClick={e => { e.stopPropagation(); setEditingTx(tx); }} className="p-0.5 rounded hover:opacity-80" style={{ color: 'var(--pp-text-muted)' }}>
            <Pencil size={12} />
          </button>
          <button type="button" title="Löschen" onClick={e => { e.stopPropagation(); setConfirmDelete(tx.id); }} className="p-0.5 rounded hover:opacity-80" style={{ color: 'var(--pp-red-text)' }}>
            <Trash2 size={12} />
          </button>
        </span>
      ),
    },
  ], []);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Alle Buchungen" searchValue={search} onSearchChange={setSearch} />
      <PPTable columns={COLUMNS} data={filtered} rowKey={tx => tx.id} storageKey="alle-buchungen" />

      {editingTx && (
        <TransaktionModal tx={editingTx} onSave={handleSave} onClose={() => setEditingTx(null)} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmDelete(null)}>
          <div className="w-[360px] rounded shadow-lg p-4" style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)' }} onClick={e => e.stopPropagation()}>
            <p className="text-[12px] mb-4">Transaktion wirklich löschen? Dies kann nicht rückgängig gemacht werden.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="px-3 py-1 text-[11px] rounded" style={{ background: 'var(--pp-bg)', color: 'var(--pp-text-muted)', border: '1px solid var(--pp-border)' }}>
                Abbrechen
              </button>
              <button type="button" onClick={() => handleDelete(confirmDelete)} className="px-3 py-1 text-[11px] rounded" style={{ background: 'var(--pp-red-text)', color: '#fff', fontWeight: 600 }}>
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
