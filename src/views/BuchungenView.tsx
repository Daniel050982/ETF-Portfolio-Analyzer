import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { TabBar, ColorMarker, getColor, SearchInput } from '../components/PPElements';
import { SplitPane } from '../components/SplitPane';
import { useUmsaetze } from '../components/UmsaetzePane';
import { euro, stueck, datumKurz } from '../utils/format';
import type { Transaktion } from '../types/portfolio';
import { Download, Settings, Layers } from 'lucide-react';
import { ResponsiveContainer, Tooltip as ReTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

/* ══════════════════════════════════════════════════════════════════════
   PP AllTransactionsView — matches AllTransactionsView.java
   Columns, context menu, transaction type filter, CSV/JSON export
   ══════════════════════════════════════════════════════════════════════ */

const TYPE_LABELS: Record<string, string> = {
  kauf: 'Kauf', verkauf: 'Verkauf', dividende: 'Dividende', ausschuettung: 'Ausschüttung',
  einlage: 'Einlage', entnahme: 'Entnahme', zinsen: 'Zinsen', gebuehren: 'Gebühren',
  steuern_tx: 'Steuern', steuererstattung: 'Steuererstattung',
  umbuchung_ein: 'Einlieferung', umbuchung_aus: 'Auslieferung',
};

const ALL_TYPES = Object.keys(TYPE_LABELS) as Transaktion['typ'][];

// Untere Pane-Tabs (PP: SecurityPriceChartPane, HistoricalPricesPane, TransactionsPane, TradesPane)
const BUCHUNGEN_PANE_TABS = [
  { id: 'umsaetze', label: 'Umsätze' },
  { id: 'diagramm', label: 'Diagramm' },
  { id: 'historische-kurse', label: 'Historische Kurse' },
  { id: 'trades', label: 'Trades' },
];

function formatDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ── Float-Menü (Dropdown) + Items ── */
function FloatMenu({ onClose, className, children }: { onClose: () => void; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} className={`absolute z-[9000] py-1 min-w-[200px] shadow-lg ${className ?? ''}`}
      style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', borderRadius: 4 }}>
      {children}
    </div>
  );
}
function FloatItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="w-full text-left px-3 py-[3px] text-[11px]" style={{ color: 'var(--pp-text)', background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={onClick}>{label}</button>
  );
}
function FloatRadio({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className="w-full text-left px-3 py-[3px] text-[11px] flex items-center gap-2" style={{ color: 'var(--pp-text)', background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={onClick}>
      <span style={{ width: 12, color: 'var(--pp-accent)' }}>{selected ? '✓' : ''}</span>{label}
    </button>
  );
}

/* ── Edit modal ── */
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

/* ── Type filter dropdown ── */
function TypeFilterDropdown({ activeTypes, onToggle, onClose }: {
  activeTypes: Set<string>;
  onToggle: (t: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-full mt-[2px] z-50 py-1 min-w-[200px] shadow-lg"
      style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', borderRadius: 3 }}>
      <button type="button" className="w-full text-left px-3 py-[3px] text-[11px] font-semibold"
        style={{ color: 'var(--pp-text-muted)', borderBottom: '1px solid var(--pp-border)' }}
        onClick={() => {
          if (activeTypes.size === ALL_TYPES.length) {
            ALL_TYPES.forEach(t => { if (activeTypes.has(t)) onToggle(t); });
          } else {
            ALL_TYPES.forEach(t => { if (!activeTypes.has(t)) onToggle(t); });
          }
        }}>
        {activeTypes.size === ALL_TYPES.length ? 'Alle abwählen' : 'Alle auswählen'}
      </button>
      {ALL_TYPES.map(t => {
        const checked = activeTypes.has(t);
        return (
          <button key={t} type="button"
            className="w-full text-left px-3 py-[3px] text-[11px] flex items-center gap-2"
            style={{ color: 'var(--pp-text)', background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => onToggle(t)}>
            <span className="inline-flex items-center justify-center w-[13px] h-[13px] rounded-[2px] flex-shrink-0"
              style={{
                border: `1px solid ${checked ? 'var(--pp-accent)' : 'var(--pp-text-muted)'}`,
                background: checked ? 'var(--pp-accent)' : 'transparent',
              }}>
              {checked && <span className="text-[9px] leading-none" style={{ color: 'var(--pp-bg)' }}>✓</span>}
            </span>
            {TYPE_LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}

/* ── Context menu ── */
interface CtxMenuState { x: number; y: number; txId: string }

function TxContextMenu({ x, y, onClose, onEdit, onDuplicate, onDelete }: {
  x: number; y: number;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '4px 12px', cursor: 'pointer', color: 'var(--pp-text)',
    background: 'transparent', border: 'none', width: '100%', textAlign: 'left', fontSize: 11,
  };
  const sepStyle: React.CSSProperties = { height: 1, margin: '3px 0', background: 'var(--pp-border)' };
  const hover = (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'var(--pp-selected-bg)');
  const unhover = (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'transparent');

  return (
    <div ref={ref} className="fixed z-[100] py-1 rounded shadow-lg" style={{
      left: x, top: y, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)',
      minWidth: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    }}>
      <button style={itemStyle} onMouseEnter={hover} onMouseLeave={unhover}
        onClick={() => { onEdit(); onClose(); }}>
        <span>Transaktion bearbeiten</span>
        <span className="ml-auto text-[10px]" style={{ color: 'var(--pp-text-muted)' }}>Strg+E</span>
      </button>
      <button style={itemStyle} onMouseEnter={hover} onMouseLeave={unhover}
        onClick={() => { onDuplicate(); onClose(); }}>
        <span>Duplizieren</span>
        <span className="ml-auto text-[10px]" style={{ color: 'var(--pp-text-muted)' }}>Strg+D</span>
      </button>
      <div style={sepStyle} />
      <button style={{ ...itemStyle, color: 'var(--pp-red-text)' }} onMouseEnter={hover} onMouseLeave={unhover}
        onClick={() => { onDelete(); onClose(); }}>
        Löschen
      </button>
    </div>
  );
}

/* ── CSV/JSON Export ── */
function exportCSV(txs: Transaktion[]) {
  const header = 'Datum;Typ;Wertpapier;ISIN;Stück;Kurs;Betrag;Gebühren;Steuern;Nettowert;Konto;Depot;Notiz';
  const rows = txs.map(tx => [
    datumKurz(tx.datum), TYPE_LABELS[tx.typ] ?? tx.typ, tx.wertpapierName, tx.isin,
    tx.stueck > 0 ? tx.stueck.toFixed(4) : '', tx.kurs > 0 ? tx.kurs.toFixed(2) : '',
    tx.betrag.toFixed(2), tx.gebuehren.toFixed(2), tx.steuern.toFixed(2),
    (tx.betrag - tx.gebuehren - tx.steuern).toFixed(2),
    tx.kontoName ?? '', tx.depotName ?? '', tx.notiz ?? '',
  ].join(';'));
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'alle_buchungen.csv';
  a.click();
}

function exportJSON(txs: Transaktion[]) {
  const data = txs.map(tx => ({
    datum: datumKurz(tx.datum), typ: TYPE_LABELS[tx.typ] ?? tx.typ,
    wertpapier: tx.wertpapierName, isin: tx.isin,
    stueck: tx.stueck, kurs: tx.kurs, betrag: tx.betrag,
    gebuehren: tx.gebuehren, steuern: tx.steuern,
    nettowert: tx.betrag - tx.gebuehren - tx.steuern,
    konto: tx.kontoName ?? '', depot: tx.depotName ?? '', notiz: tx.notiz ?? '',
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'alle_buchungen.json';
  a.click();
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */
export default function BuchungenView() {
  const { state, editTransaktion, deleteTransaktion } = usePortfolio();
  const [search, setSearch] = useState('');
  const [editingTx, setEditingTx] = useState<Transaktion | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(() => new Set(ALL_TYPES));
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const [clientFilterOpen, setClientFilterOpen] = useState(false);
  const [clientFilterId, setClientFilterId] = useState<string>('all'); // 'all' = Gesamtportfolio
  const [exportOpen, setExportOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [paneTab, setPaneTab] = useState('umsaetze');
  const [colMenuPos, setColMenuPos] = useState<{ x: number; y: number } | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const h = (e: MouseEvent) => { if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [exportOpen]);

  const handleTypeToggle = useCallback((t: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  // Client-Filter (PP ClientFilterDropDown): Gesamtportfolio oder eine Gruppierung
  const activeGruppierung = state.gruppierungen.find(g => g.id === clientFilterId);
  const filtered = useMemo(() => {
    let list = [...state.transaktionen].sort((a, b) => b.datum.getTime() - a.datum.getTime());
    if (activeTypes.size < ALL_TYPES.length) {
      list = list.filter(tx => activeTypes.has(tx.typ));
    }
    // Client-Filter: nur Buchungen, deren Konto/Depot in der Gruppierung ist
    if (activeGruppierung) {
      const kontoSet = new Set(activeGruppierung.kontoNamen);
      const depotSet = new Set(activeGruppierung.depotNamen);
      list = list.filter(tx =>
        (tx.kontoName && kontoSet.has(tx.kontoName)) ||
        (tx.depotName && depotSet.has(tx.depotName)) ||
        (tx.gegenkontoName && kontoSet.has(tx.gegenkontoName)));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(tx =>
        tx.wertpapierName.toLowerCase().includes(q) ||
        tx.isin.toLowerCase().includes(q) ||
        (TYPE_LABELS[tx.typ] ?? tx.typ).toLowerCase().includes(q) ||
        (tx.kontoName ?? '').toLowerCase().includes(q) ||
        (tx.depotName ?? '').toLowerCase().includes(q) ||
        (tx.notiz ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [state.transaktionen, search, activeTypes, activeGruppierung]);

  // ── Untere Tabelle: gewählte Buchung → deren Wertpapier ──
  const selectedTx = state.transaktionen.find(t => t.id === selectedTxId) ?? filtered[0] ?? null;
  const selWpKey = selectedTx ? (selectedTx.isin || selectedTx.wertpapierName) : '';
  const selWp = selWpKey ? state.wertpapiere[selWpKey] : undefined;

  // Symbol/WKN + Farb-Lookups für die Umsätze-Pane
  const symbolWknOf = useCallback((tx: Transaktion) => {
    const wp = (tx.isin && state.wertpapiere[tx.isin]) || state.wertpapiere[tx.wertpapierName];
    return { symbol: wp?.symbol ?? '', wkn: wp?.wkn ?? '' };
  }, [state.wertpapiere]);
  const wpFarbe = useCallback((tx: Transaktion) => {
    const wp = (tx.isin && state.wertpapiere[tx.isin]) || state.wertpapiere[tx.wertpapierName];
    return wp?.typFarbe;
  }, [state.wertpapiere]);
  const wpInaktiv = useCallback((tx: Transaktion) => {
    const wp = (tx.isin && state.wertpapiere[tx.isin]) || state.wertpapiere[tx.wertpapierName];
    return !!wp?.istInaktiv;
  }, [state.wertpapiere]);
  const kontoFarbe = useCallback((name: string) => state.konten[name]?.farbe, [state.konten]);

  // Umsätze des gewählten Wertpapiers (unterer Umsätze-Tab)
  const wpTxs = useMemo(() => selWpKey
    ? state.transaktionen.filter(tx => (tx.isin || tx.wertpapierName) === selWpKey)
    : [], [selWpKey, state.transaktionen]);
  const umsaetze = useUmsaetze({
    transaktionen: wpTxs, symbolWknOf, wpFarbe, wpInaktiv, kontoFarbe,
    storageKey: 'buchungen-umsaetze', exportFileName: `${selWp?.name ?? 'wertpapier'}_umsaetze`,
  });

  // Diagramm + Historische Kurse des gewählten WP
  const kursSeries = useMemo(() => (selWp?.kursHistorie ?? []).map(h => ({ datum: datumKurz(h.datum), kurs: h.kurs })), [selWp]);
  const histRows = useMemo(() => [...(selWp?.kursHistorie ?? [])].sort((a, b) => b.datum.getTime() - a.datum.getTime()), [selWp]);

  // Trades (Kauf/Verkauf) des gewählten WP
  const tradeRows = useMemo(() => selWpKey
    ? state.transaktionen.filter(tx => (tx.isin || tx.wertpapierName) === selWpKey && (tx.typ === 'kauf' || tx.typ === 'verkauf')).sort((a, b) => b.datum.getTime() - a.datum.getTime())
    : [], [selWpKey, state.transaktionen]);

  const handleSave = useCallback((tx: Transaktion) => {
    editTransaktion(tx);
    setEditingTx(null);
  }, [editTransaktion]);

  const handleDelete = useCallback((id: string) => {
    deleteTransaktion(id);
    setConfirmDelete(null);
  }, [deleteTransaktion]);

  // PP TransactionsViewer: Verkäufe/Entnahmen/Gebühren/Steuern rot, Käufe/Einnahmen grün
  const txCol = (tx: Transaktion) => (tx.typ === 'verkauf' || tx.typ === 'umbuchung_aus' || tx.typ === 'entnahme' || tx.typ === 'gebuehren' || tx.typ === 'steuern_tx' || tx.typ === 'zinsbelastung')
    ? 'var(--pp-red-text)' : 'var(--pp-green-text)';
  // Gesamtpreis (PP ColumnNetValue): Kauf brutto +Geb +St, Verkauf brutto −Geb −St
  const gesamtpreis = (tx: Transaktion) => (tx.typ === 'kauf' || tx.typ === 'umbuchung_ein') ? tx.betrag + tx.gebuehren + tx.steuern : tx.betrag - tx.gebuehren - tx.steuern;

  const COLUMNS: PPColumn<Transaktion>[] = useMemo(() => [
    { id: 'datum', label: 'Datum', width: 90, render: tx => <span className="mono" style={{ color: txCol(tx) }}>{datumKurz(tx.datum)}</span>, sortFn: (a, b) => a.datum.getTime() - b.datum.getTime() },
    { id: 'typ', label: 'Typ', width: 110, render: tx => <span style={{ color: txCol(tx) }}>{TYPE_LABELS[tx.typ] ?? tx.typ}</span>, sortFn: (a, b) => (TYPE_LABELS[a.typ] ?? a.typ).localeCompare(TYPE_LABELS[b.typ] ?? b.typ) },
    {
      id: 'wertpapier', label: 'Wertpapier', width: 250,
      render: tx => { if (!tx.wertpapierName) return ''; const wp = (tx.isin && state.wertpapiere[tx.isin]) || state.wertpapiere[tx.wertpapierName]; return <span className="flex items-center gap-1.5"><ColorMarker color={wp?.typFarbe || getColor(tx.isin || tx.wertpapierName)} inaktiv={wp?.istInaktiv} /><span style={{ color: wp?.istInaktiv ? 'var(--pp-text-muted)' : txCol(tx) }}>{tx.wertpapierName}</span></span>; },
      sortFn: (a, b) => a.wertpapierName.localeCompare(b.wertpapierName),
    },
    { id: 'isin', label: 'ISIN', width: 100, render: tx => <span className="mono">{tx.isin}</span>, sortFn: (a, b) => a.isin.localeCompare(b.isin) },
    { id: 'symbol', label: 'Symbol', width: 80, render: tx => { const wp = (tx.isin && state.wertpapiere[tx.isin]) || state.wertpapiere[tx.wertpapierName]; return wp?.symbol ?? ''; } },
    { id: 'wkn', label: 'WKN', width: 80, render: tx => { const wp = (tx.isin && state.wertpapiere[tx.isin]) || state.wertpapiere[tx.wertpapierName]; return wp?.wkn ?? ''; } },
    { id: 'stueck', label: 'Stück', width: 80, align: 'right', render: tx => tx.stueck > 0 ? <span className="mono" style={{ color: txCol(tx) }}>{stueck(tx.stueck)}</span> : '', sortFn: (a, b) => a.stueck - b.stueck },
    { id: 'kurs', label: 'Kurs', width: 90, align: 'right', render: tx => { const k = tx.kurs > 0 ? tx.kurs : (tx.stueck > 0 && tx.betrag > 0 ? tx.betrag / tx.stueck : 0); return k > 0 ? <span className="mono" style={{ color: txCol(tx) }}>{euro(k)}</span> : ''; }, sortFn: (a, b) => a.kurs - b.kurs },
    { id: 'betrag', label: 'Betrag', width: 100, align: 'right', render: tx => <span className="mono" style={{ color: txCol(tx) }}>{euro(tx.betrag)}</span>, sortFn: (a, b) => a.betrag - b.betrag },
    { id: 'gebuehren', label: 'Gebühren', width: 80, align: 'right', render: tx => tx.gebuehren > 0 ? <span className="mono">{euro(tx.gebuehren)}</span> : '' },
    { id: 'steuern', label: 'Steuern', width: 80, align: 'right', render: tx => tx.steuern > 0 ? <span className="mono">{euro(tx.steuern)}</span> : '' },
    { id: 'gesamtpreis', label: 'Gesamtpreis', width: 100, align: 'right', render: tx => <span className="mono" style={{ color: txCol(tx) }}>{euro(gesamtpreis(tx))}</span>, sortFn: (a, b) => gesamtpreis(a) - gesamtpreis(b) },
    { id: 'exdate', label: 'Ex-Tag', width: 80, render: () => '' },
    { id: 'konto', label: 'Konto', width: 120, render: tx => tx.kontoName ? <span className="flex items-center gap-1.5"><ColorMarker color={state.konten[tx.kontoName]?.farbe || getColor(tx.kontoName)} /><span style={{ color: 'var(--pp-text-muted)' }}>{tx.kontoName}</span></span> : '', sortFn: (a, b) => (a.kontoName ?? '').localeCompare(b.kontoName ?? '') },
    { id: 'depot', label: 'Depot', width: 120, render: tx => tx.depotName ? <span className="flex items-center gap-1.5"><ColorMarker color={state.depots[tx.depotName]?.farbe || getColor(tx.depotName)} /><span style={{ color: 'var(--pp-text-muted)' }}>{tx.depotName}</span></span> : '' },
    { id: 'gegenkonto', label: 'Gegenkonto', width: 120, render: tx => tx.gegenkontoName ? <span className="flex items-center gap-1.5"><ColorMarker color={state.konten[tx.gegenkontoName]?.farbe || getColor(tx.gegenkontoName)} /><span style={{ color: 'var(--pp-text-muted)' }}>{tx.gegenkontoName}</span></span> : '' },
    { id: 'notiz', label: 'Notiz', width: 200, render: tx => <span style={{ color: 'var(--pp-text-muted)' }}>{tx.notiz ?? ''}</span> },
    { id: 'quelle', label: 'Quelle', width: 200, render: tx => <span style={{ color: 'var(--pp-text-muted)' }}>{tx.quelle ?? ''}</span> },
  ], [state.wertpapiere, state.konten, state.depots]);

  // PP TransactionsViewer: ISIN, Symbol, WKN, Ex-Tag, Gegenkonto, Quelle initial ausgeblendet
  const HIDDEN_BY_DEFAULT = useMemo(() => new Set(['isin', 'symbol', 'wkn', 'exdate', 'gegenkonto', 'quelle']), []);

  const isFiltered = activeTypes.size < ALL_TYPES.length;

  const clientFilterLabel = activeGruppierung ? activeGruppierung.name : 'Gesamtportfolio';

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar im Konten-Stil — PP AllTransactionsView.addButtons:
          Suchfeld | Typ-Filter | Client-Filter | Export | Spaltenmenü.
          Titel mit Anzahl (PP: "Alle Buchungen (N Buchungen)"). */}
      <div className="pp-toolbar">
        <span className="pp-toolbar-title">Alle Buchungen ({filtered.length} Buchungen)</span>
        <div style={{ flex: 1 }} />
        <SearchInput value={search} onChange={setSearch} />
        <div style={{ width: 1, height: 16, background: 'var(--pp-border)', flexShrink: 0 }} />
        {/* Typ-Filter */}
        <div className="relative">
          <button type="button" className="pp-toolbar-btn" style={{ color: isFiltered ? 'var(--pp-accent)' : undefined }}
            onClick={() => setTypeFilterOpen(!typeFilterOpen)} title="Buchungstyp filtern">
            <span className="text-[10px]">Typ ▾</span>
          </button>
          {typeFilterOpen && (
            <TypeFilterDropdown activeTypes={activeTypes} onToggle={handleTypeToggle} onClose={() => setTypeFilterOpen(false)} />
          )}
        </div>
        {/* Client-Filter (Gruppierungen) — PP ClientFilterDropDown */}
        <div className="relative">
          <button type="button" className="pp-toolbar-btn" style={{ color: activeGruppierung ? 'var(--pp-accent)' : undefined }}
            onClick={() => setClientFilterOpen(!clientFilterOpen)} title="Filter (Konten/Depots)">
            <Layers size={13} />
            <span className="text-[10px] ml-1">▾</span>
          </button>
          {clientFilterOpen && (
            <FloatMenu onClose={() => setClientFilterOpen(false)} className="right-0 top-full mt-[2px]">
              <FloatRadio label="Gesamtportfolio" selected={clientFilterId === 'all'} onClick={() => { setClientFilterId('all'); setClientFilterOpen(false); }} />
              {state.gruppierungen.length > 0 && <div style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />}
              {state.gruppierungen.map(g => (
                <FloatRadio key={g.id} label={g.name} selected={clientFilterId === g.id} onClick={() => { setClientFilterId(g.id); setClientFilterOpen(false); }} />
              ))}
            </FloatMenu>
          )}
        </div>
        {/* Export-Dropdown */}
        <div className="relative" ref={exportRef}>
          <button type="button" className="pp-toolbar-btn" onClick={() => setExportOpen(!exportOpen)} title="Daten exportieren"><Download size={14} /></button>
          {exportOpen && (
            <FloatMenu onClose={() => setExportOpen(false)} className="right-0 top-full mt-[2px]">
              <FloatItem label="Alle Buchungen (CSV)" onClick={() => { exportCSV(filtered); setExportOpen(false); }} />
              <FloatItem label="Alle Buchungen (JSON)" onClick={() => { exportJSON(filtered); setExportOpen(false); }} />
            </FloatMenu>
          )}
        </div>
        {/* Spaltenmenü */}
        <button type="button" className="pp-toolbar-btn" title="Spalten anzeigen / ausblenden"
          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setColMenuPos(prev => prev ? null : { x: r.right - 160, y: r.bottom + 2 }); }}>
          <Settings size={14} />
        </button>
      </div>

      <SplitPane storageKey="buchungen" defaultTopPercent={55}
        top={
          <PPTable
            columns={COLUMNS}
            data={filtered}
            rowKey={tx => tx.id}
            selectedKey={selectedTx?.id}
            onSelect={setSelectedTxId}
            storageKey="alle-buchungen"
            hiddenByDefault={HIDDEN_BY_DEFAULT}
            columnMenuPos={colMenuPos}
            onColumnMenuClose={() => setColMenuPos(null)}
            onRowContextMenu={(e, tx) => { e.preventDefault(); setSelectedTxId(tx.id); setCtxMenu({ x: e.clientX, y: e.clientY, txId: tx.id }); }}
          />
        }
        bottom={
          <div className="flex flex-col h-full">
            <TabBar tabs={BUCHUNGEN_PANE_TABS} active={paneTab} onChange={setPaneTab}
              actions={paneTab === 'umsaetze' && selWp ? umsaetze.toolbar : undefined} />
            <div className="flex-1 min-h-0 flex flex-col">
              {!selWp ? (
                <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>Kein Wertpapier gewählt</div>
              ) : paneTab === 'diagramm' ? (
                <div className="p-3 h-full">
                  {kursSeries.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={kursSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
                        <XAxis dataKey="datum" tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} width={60} domain={['auto', 'auto']} />
                        <ReTooltip contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }} formatter={(v) => [euro(v as number), '']} />
                        <Line type="monotone" dataKey="kurs" stroke="var(--pp-accent)" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>Keine Kursdaten</div>}
                </div>
              ) : paneTab === 'historische-kurse' ? (
                <div className="flex-1 overflow-auto">
                  <table className="pp-table">
                    <thead><tr><th style={{ width: 120 }}>Datum</th><th className="right" style={{ width: 120 }}>Kurs</th></tr></thead>
                    <tbody>{histRows.map((h, i) => <tr key={i} className="pp-row"><td className="mono">{datumKurz(h.datum)}</td><td className="right mono">{euro(h.kurs)}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : paneTab === 'umsaetze' ? (
                umsaetze.table
              ) : (
                <div className="flex-1 overflow-auto">
                  <table className="pp-table">
                    <thead><tr><th style={{ width: 90 }}>Datum</th><th style={{ width: 70 }}>Typ</th><th className="right" style={{ width: 90 }}>Stück</th><th className="right" style={{ width: 90 }}>Kurs</th><th className="right" style={{ width: 100 }}>Betrag</th><th className="right" style={{ width: 100 }}>Netto</th></tr></thead>
                    <tbody>
                      {tradeRows.map(t => {
                        const netto = (t.typ === 'kauf') ? -(t.betrag + t.gebuehren + t.steuern) : t.betrag - t.gebuehren - t.steuern;
                        const c = t.typ === 'verkauf' ? 'var(--pp-red-text)' : 'var(--pp-green-text)';
                        return <tr key={t.id} className="pp-row">
                          <td className="mono" style={{ color: c }}>{datumKurz(t.datum)}</td>
                          <td style={{ color: c }}>{t.typ === 'kauf' ? 'Kauf' : 'Verkauf'}</td>
                          <td className="right mono">{stueck(t.stueck)}</td>
                          <td className="right mono">{euro(t.kurs)}</td>
                          <td className="right mono">{euro(t.betrag)}</td>
                          <td className="right mono" style={{ color: netto >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{euro(netto)}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        }
      />

      {/* Statusbar */}
      <div className="h-[20px] flex-shrink-0 flex items-center px-2 text-[10px]"
        style={{ background: 'var(--pp-header-bg)', borderTop: '1px solid var(--pp-border)', color: 'var(--pp-text-muted)' }}>
        <span>{filtered.length} Buchungen</span>
        <span className="mx-2">|</span>
        <span>Summe: {euro(filtered.reduce((s, tx) => s + tx.betrag, 0))}</span>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <TxContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onEdit={() => {
            const tx = state.transaktionen.find(t => t.id === ctxMenu.txId);
            if (tx) setEditingTx(tx);
          }}
          onDuplicate={() => {
            // PP: Ctrl+D duplicates
          }}
          onDelete={() => setConfirmDelete(ctxMenu.txId)}
        />
      )}

      {/* Edit modal */}
      {editingTx && (
        <TransaktionModal tx={editingTx} onSave={handleSave} onClose={() => setEditingTx(null)} />
      )}

      {/* Delete confirmation */}
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
