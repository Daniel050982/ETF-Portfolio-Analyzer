import { useState, useRef, useEffect } from 'react';
import { Filter } from 'lucide-react';
import type { Transaktion } from '../types/portfolio';

/* ══════════════════════════════════════════════════════════════════════
   PP TransactionFilterDropDown + TransactionFilterCriteria — 1:1 nach
   TransactionFilterDropDown.java / TransactionFilterCriteria.java.
   Menü: Header "Buchungen filtern" (LabelOnly), dann alle Kriterien in
   Enum-Deklarationsreihenfolge, eingerückt mit level*2 Leerzeichen,
   AS_CHECK_BOX, nur eines gleichzeitig aktiv (erneut wählen → NONE).
   Labels aus messages_de.properties (TransactionFilter*).
   ══════════════════════════════════════════════════════════════════════ */

export interface TransactionFilterCriteria {
  id: string;
  label: string;
  level: number;
  matches: (tx: Transaktion) => boolean;
}

const isPortfolioTx = (tx: Transaktion) =>
  tx.typ === 'kauf' || tx.typ === 'verkauf' ||
  ((tx.typ === 'umbuchung_ein' || tx.typ === 'umbuchung_aus') && !!tx.depotName && !tx.kontoName);

export const TRANSACTION_FILTERS: TransactionFilterCriteria[] = [
  { id: 'NONE', label: 'Alle Buchungstypen', level: 0, matches: () => true },
  {
    id: 'SECURITY_TRANSACTIONS', label: 'Buchungen mit Wertpapier', level: 0,
    matches: tx => isPortfolioTx(tx) || tx.typ === 'dividende' || tx.typ === 'ausschuettung' || tx.typ === 'kauf' || tx.typ === 'verkauf',
  },
  { id: 'BUY_AND_SELL', label: 'Käufe und Verkäufe', level: 1, matches: tx => tx.typ === 'kauf' || tx.typ === 'verkauf' },
  { id: 'BUY', label: 'Käufe', level: 2, matches: tx => tx.typ === 'kauf' },
  { id: 'SELL', label: 'Verkäufe', level: 2, matches: tx => tx.typ === 'verkauf' },
  { id: 'DIVIDEND', label: 'Dividenden', level: 1, matches: tx => tx.typ === 'dividende' || tx.typ === 'ausschuettung' },
  { id: 'DEPOSIT_AND_REMOVAL', label: 'Einlagen und Entnahmen', level: 0, matches: tx => tx.typ === 'einlage' || tx.typ === 'entnahme' },
  { id: 'DEPOSIT', label: 'Einlagen', level: 1, matches: tx => tx.typ === 'einlage' },
  { id: 'REMOVAL', label: 'Entnahmen', level: 1, matches: tx => tx.typ === 'entnahme' },
  { id: 'INTEREST', label: 'Zinsen', level: 0, matches: tx => tx.typ === 'zinsen' || tx.typ === 'zinsbelastung' },
  {
    id: 'WITH_TAX', label: 'Buchungen mit Steuern', level: 0,
    matches: tx => tx.typ === 'steuern_tx' || tx.typ === 'steuererstattung' || tx.steuern > 0,
  },
  {
    id: 'WITH_FEES', label: 'Buchungen mit Gebühren', level: 0,
    matches: tx => tx.typ === 'gebuehren' || tx.typ === 'gebuehrenerstattung' || tx.gebuehren > 0,
  },
  {
    id: 'TRANSFERS', label: 'Umbuchungen und Transfers', level: 0,
    matches: tx => (tx.typ === 'umbuchung_ein' || tx.typ === 'umbuchung_aus') && (!!tx.kontoName || !!tx.gegenkontoName),
  },
  {
    id: 'DELIVERIES', label: 'Ein- und Auslieferungen', level: 0,
    matches: tx => (tx.typ === 'umbuchung_ein' || tx.typ === 'umbuchung_aus') && !!tx.depotName && !tx.kontoName,
  },
  {
    id: 'DELIVERIES_INBOUND', label: 'Einlieferung', level: 1,
    matches: tx => tx.typ === 'umbuchung_ein' && !!tx.depotName && !tx.kontoName,
  },
  {
    id: 'DELIVERIES_OUTBOUND', label: 'Auslieferung', level: 1,
    matches: tx => tx.typ === 'umbuchung_aus' && !!tx.depotName && !tx.kontoName,
  },
];

export function getTransactionFilter(id: string): TransactionFilterCriteria {
  return TRANSACTION_FILTERS.find(f => f.id === id) ?? TRANSACTION_FILTERS[0];
}

const MENU_STYLE: React.CSSProperties = {
  position: 'absolute', zIndex: 100, right: 0, top: '100%', marginTop: 2,
  background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)',
  borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.4)', minWidth: 220,
  padding: '4px 0', whiteSpace: 'nowrap',
};

export function TransactionFilterButton({ value, storageKey, onChange, size = 12 }: {
  value: string;
  storageKey?: string;
  onChange: (id: string) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const active = value !== 'NONE';

  const select = (id: string) => {
    // PP: erneutes Anklicken des aktiven Filters setzt auf NONE zurück
    const next = value === id ? 'NONE' : id;
    onChange(next);
    if (storageKey) {
      try { localStorage.setItem(storageKey, next); } catch { /* */ }
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      {/* PP TransactionFilterDropDown.java Zeile 27: super(Messages.SecurityFilter, ...) */}
      <button type="button" className="pp-toolbar-btn" title="Wertpapiere anhand des Bestands ausfiltern"
        style={{ color: active ? 'var(--pp-accent)' : undefined }}
        onClick={() => setOpen(!open)}>
        <Filter size={size} />
      </button>
      {open && (
        <div style={MENU_STYLE}>
          {/* PP LabelOnly: Messages.TransactionFilter */}
          <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--pp-text-muted)', fontStyle: 'italic' }}>
            Buchungen filtern
          </div>
          {TRANSACTION_FILTERS.map(f => (
            <button key={f.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: `4px 12px 4px ${12 + f.level * 12}px`,
                cursor: 'pointer', color: 'var(--pp-text)', background: 'transparent',
                border: 'none', width: '100%', textAlign: 'left', fontSize: 11,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onClick={() => select(f.id)}>
              <span style={{ width: 12, flexShrink: 0 }}>{value === f.id ? '✓' : ''}</span>
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
