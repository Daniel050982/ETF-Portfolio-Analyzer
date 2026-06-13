import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { SplitPane } from '../components/SplitPane';
import { SearchInput, TabBar, ColorMarker, getColor } from '../components/PPElements';
import { euro, datumKurz, stueck } from '../utils/format';
import { Plus, Filter, Settings, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AccountTransactionDialog, AccountTransferDialog, SecurityTransactionDialog, type AccountTxTyp, type SecurityTxTyp } from '../components/TransactionDialogs';
import { TransactionFilterButton, getTransactionFilter } from '../components/TransactionFilter';
import { FarbenMenuFooter } from '../components/FarbenMenu';
import { saldoDelta } from '../store/PortfolioContext';
import type { Transaktion } from '../types/portfolio';

/* ══════════════════════════════════════════════════════════════════════
   PP AccountListView — columns, context menu, detail tabs
   Matches: AccountListView.java, AccountContextMenu.java
   ══════════════════════════════════════════════════════════════════════ */

// labels_de.properties (account.*)
const TX_LABELS: Record<string, string> = {
  kauf: 'Kauf', verkauf: 'Verkauf', dividende: 'Dividende', ausschuettung: 'Ausschüttung',
  einlage: 'Einlage', entnahme: 'Entnahme', zinsen: 'Zinsen', zinsbelastung: 'Zinsbelastung',
  gebuehren: 'Gebühren', gebuehrenerstattung: 'Gebührenerstattung',
  steuern_tx: 'Steuern', steuererstattung: 'Steuerrückerstattung',
  umbuchung_ein: 'Umbuchung (Eingang)', umbuchung_aus: 'Umbuchung (Ausgang)',
};

type DialogState =
  | { dialog: 'account'; typ: AccountTxTyp; initial?: Transaktion; mode?: 'new' | 'edit' }
  | { dialog: 'transfer' }
  | { dialog: 'security'; typ: SecurityTxTyp; initial?: Transaktion; mode?: 'new' | 'edit' };

/* ── Shared dropdown styles ── */
const MENU_STYLE: React.CSSProperties = {
  position: 'absolute', zIndex: 100, background: 'var(--pp-content-bg)',
  border: '1px solid var(--pp-border)', borderRadius: 4,
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)', minWidth: 200, padding: '4px 0',
  whiteSpace: 'nowrap',
};
const ITEM_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
  cursor: 'pointer', color: 'var(--pp-text)', background: 'transparent',
  border: 'none', width: '100%', textAlign: 'left', fontSize: 11,
};
const SEP_STYLE: React.CSSProperties = { height: 1, margin: '3px 0', background: 'var(--pp-border)' };
function hoverOn(e: React.MouseEvent<HTMLButtonElement>) { e.currentTarget.style.background = 'var(--pp-selected-bg)'; }
function hoverOff(e: React.MouseEvent<HTMLButtonElement>) { e.currentTarget.style.background = 'transparent'; }

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button style={{ ...ITEM_STYLE, color: danger ? 'var(--pp-red-text)' : undefined }}
      onMouseEnter={hoverOn} onMouseLeave={hoverOff} onClick={onClick}>
      {label}
    </button>
  );
}

/* ── PP AccountContextMenu entries (AccountContextMenu.java Zeilen 34-98) ──
   Reihenfolge = EnumSet-Iteration in Enum-Deklarationsreihenfolge
   (AccountTransaction.Type): DEPOSIT, REMOVAL, INTEREST, INTEREST_CHARGE,
   FEES, FEES_REFUND, TAXES, TAX_REFUND.
   Kauf/Verkauf/Dividende nur wenn aktive Depots UND Wertpapiere existieren. */
function AccountMenuItems({ onAction, showSecurityActions }: {
  onAction: (a: DialogState) => void;
  showSecurityActions: boolean;
}) {
  return (
    <>
      <MenuItem label="Einlage..." onClick={() => onAction({ dialog: 'account', typ: 'einlage' })} />
      <MenuItem label="Entnahme..." onClick={() => onAction({ dialog: 'account', typ: 'entnahme' })} />
      <MenuItem label="Zinsen..." onClick={() => onAction({ dialog: 'account', typ: 'zinsen' })} />
      <MenuItem label="Zinsbelastung..." onClick={() => onAction({ dialog: 'account', typ: 'zinsbelastung' })} />
      <MenuItem label="Gebühren..." onClick={() => onAction({ dialog: 'account', typ: 'gebuehren' })} />
      <MenuItem label="Gebührenerstattung..." onClick={() => onAction({ dialog: 'account', typ: 'gebuehrenerstattung' })} />
      <MenuItem label="Steuern..." onClick={() => onAction({ dialog: 'account', typ: 'steuern_tx' })} />
      <MenuItem label="Steuerrückerstattung..." onClick={() => onAction({ dialog: 'account', typ: 'steuererstattung' })} />
      <div style={SEP_STYLE} />
      <MenuItem label="Umbuchung..." onClick={() => onAction({ dialog: 'transfer' })} />
      {showSecurityActions && (
        <>
          <div style={SEP_STYLE} />
          <MenuItem label="Kauf..." onClick={() => onAction({ dialog: 'security', typ: 'kauf' })} />
          <MenuItem label="Verkauf..." onClick={() => onAction({ dialog: 'security', typ: 'verkauf' })} />
          <MenuItem label="Dividende..." onClick={() => onAction({ dialog: 'account', typ: 'dividende' })} />
        </>
      )}
    </>
  );
}

interface KontoRow {
  key: string;
  name: string;
  saldo: number;
  waehrung: string;
  notiz: string;
  letzteTransaktion?: Date;
  istInaktiv: boolean;
  farbe?: string;
}

/* PP AccountListView Zeilen 213-217:
   Konto(150) | Kontostand(80,R) | Währung(60) | Letztes Buchungsdatum(80,R, hidden) | Notiz(200) */
function buildColumns(): PPColumn<KontoRow>[] {
  return [
    {
      id: 'name', label: 'Konto', width: 150, minWidth: 100,
      render: k => (
        <span className="flex items-center gap-1.5">
          <ColorMarker color={k.farbe ?? getColor(k.name)} />
          <span style={{ color: k.istInaktiv ? 'var(--pp-text-muted)' : undefined }}>{k.name}</span>
        </span>
      ),
      sortFn: (a, b) => a.name.localeCompare(b.name),
    },
    {
      id: 'saldo', label: 'Kontostand', width: 80, align: 'right',
      render: k => euro(k.saldo),
      sortFn: (a, b) => a.saldo - b.saldo,
    },
    {
      id: 'waehrung', label: 'Währung', width: 60,
      render: k => k.waehrung,
      sortFn: (a, b) => a.waehrung.localeCompare(b.waehrung),
    },
    {
      id: 'letzteBuchung', label: 'Letztes Buchungsdatum', width: 80, align: 'right',
      render: k => k.letzteTransaktion ? datumKurz(k.letzteTransaktion) : '',
      sortFn: (a, b) => (a.letzteTransaktion?.getTime() ?? 0) - (b.letzteTransaktion?.getTime() ?? 0),
    },
    {
      id: 'notiz', label: 'Notiz', width: 200,
      render: k => k.notiz,
      sortFn: (a, b) => a.notiz.localeCompare(b.notiz),
    },
    // PP addAttributeColumns: Standard-Attribut "Logo" (ClientSettings.java),
    // Gruppe "Attribute" (GroupLabelAttributes). Logo-Daten führen wir nicht.
    {
      id: 'logo', label: 'Logo', width: 60, group: 'Attribute',
      render: () => '',
    },
  ];
}

const COLUMNS = buildColumns();
// PP LastTransactionDateColumn.java Zeile 27: setVisible(false); Attribut-Spalten initial aus
const HIDDEN_BY_DEFAULT = new Set<string>(['letzteBuchung', 'logo']);

/* ── Umsätze-Untertabelle — PP AccountTransactionsPane.java Zeilen 164-480 ──
   Datum(80) | Typ(100) | Betrag(80,R, vorzeichenbehaftet) | Gebühren(80,R,H) |
   Steuern(80,R,H) | Kontostand(80,R) | Wertpapier(250) | ISIN(H) | Symbol(H) |
   WKN(H) | Stück(80,R) | Kurs(80,R) | Gegenkonto(120) | Notiz(200) | Quelle(120) */
interface TxRow {
  tx: Transaktion;
  kontostand: number;
  symbol: string;
  wkn: string;
}

// PP färbt die Zeile nach Soll/Haben (ValueColorScheme negative/positiveForeground)
function txColor(tx: Transaktion): string {
  return saldoDelta(tx) < 0 ? 'var(--pp-red-text)' : 'var(--pp-green-text)';
}

function buildTxColumns(): PPColumn<TxRow>[] {
  return [
    {
      id: 'datum', label: 'Datum', width: 80,
      render: r => <span className="mono" style={{ color: txColor(r.tx) }}>{datumKurz(r.tx.datum)}</span>,
      sortFn: (a, b) => a.tx.datum.getTime() - b.tx.datum.getTime(),
    },
    {
      id: 'typ', label: 'Typ', width: 100,
      render: r => <span style={{ color: txColor(r.tx) }}>{TX_LABELS[r.tx.typ] ?? r.tx.typ}</span>,
      sortFn: (a, b) => (TX_LABELS[a.tx.typ] ?? '').localeCompare(TX_LABELS[b.tx.typ] ?? ''),
    },
    {
      id: 'betrag', label: 'Betrag', width: 80, align: 'right',
      render: r => <span className="mono" style={{ color: txColor(r.tx) }}>{euro(saldoDelta(r.tx))}</span>,
      sortFn: (a, b) => saldoDelta(a.tx) - saldoDelta(b.tx),
    },
    {
      id: 'gebuehren', label: 'Gebühren', width: 80, align: 'right',
      render: r => r.tx.gebuehren > 0 ? <span className="mono" style={{ color: txColor(r.tx) }}>{euro(r.tx.gebuehren)}</span> : '',
      sortFn: (a, b) => a.tx.gebuehren - b.tx.gebuehren,
    },
    {
      id: 'steuern', label: 'Steuern', width: 80, align: 'right',
      render: r => r.tx.steuern > 0 ? <span className="mono" style={{ color: txColor(r.tx) }}>{euro(r.tx.steuern)}</span> : '',
      sortFn: (a, b) => a.tx.steuern - b.tx.steuern,
    },
    {
      id: 'kontostand', label: 'Kontostand', width: 80, align: 'right',
      render: r => (
        <span className="mono" style={{ color: r.kontostand < 0 ? 'var(--pp-red-text)' : 'var(--pp-green-text)' }}>
          {euro(r.kontostand)}
        </span>
      ),
      sortFn: (a, b) => a.kontostand - b.kontostand,
    },
    {
      id: 'wertpapier', label: 'Wertpapier', width: 250,
      render: r => <span style={{ color: txColor(r.tx) }}>{r.tx.wertpapierName}</span>,
      sortFn: (a, b) => a.tx.wertpapierName.localeCompare(b.tx.wertpapierName),
    },
    {
      id: 'isin', label: 'ISIN', width: 100,
      render: r => <span className="mono">{r.tx.isin}</span>,
      sortFn: (a, b) => a.tx.isin.localeCompare(b.tx.isin),
    },
    {
      id: 'symbol', label: 'Symbol', width: 80,
      render: r => r.symbol,
      sortFn: (a, b) => a.symbol.localeCompare(b.symbol),
    },
    {
      id: 'wkn', label: 'WKN', width: 80,
      render: r => r.wkn,
      sortFn: (a, b) => a.wkn.localeCompare(b.wkn),
    },
    {
      id: 'stueck', label: 'Stück', width: 80, align: 'right',
      render: r => r.tx.stueck > 0 ? <span className="mono" style={{ color: txColor(r.tx) }}>{stueck(r.tx.stueck)}</span> : '',
      sortFn: (a, b) => a.tx.stueck - b.tx.stueck,
    },
    {
      id: 'kurs', label: 'Kurs', width: 80, align: 'right',
      // PP CalculatedQuoteColumn: Betrag / Stück
      render: r => {
        const k = r.tx.kurs > 0 ? r.tx.kurs : (r.tx.stueck > 0 ? r.tx.betrag / r.tx.stueck : 0);
        return k > 0 ? <span className="mono" style={{ color: txColor(r.tx) }}>{euro(k)}</span> : '';
      },
      sortFn: (a, b) => a.tx.kurs - b.tx.kurs,
    },
    {
      id: 'gegenkonto', label: 'Gegenkonto', width: 120,
      render: r => <span style={{ color: 'var(--pp-text-muted)' }}>{r.tx.gegenkontoName || r.tx.depotName || ''}</span>,
      sortFn: (a, b) => (a.tx.gegenkontoName ?? '').localeCompare(b.tx.gegenkontoName ?? ''),
    },
    {
      id: 'notiz', label: 'Notiz', width: 200,
      render: r => r.tx.notiz ?? '',
      sortFn: (a, b) => (a.tx.notiz ?? '').localeCompare(b.tx.notiz ?? ''),
    },
    {
      id: 'quelle', label: 'Quelle', width: 120,
      render: r => <span style={{ color: txColor(r.tx) }}>{r.tx.quelle ?? ''}</span>,
      sortFn: (a, b) => (a.tx.quelle ?? '').localeCompare(b.tx.quelle ?? ''),
    },
  ];
}

const TX_COLUMNS = buildTxColumns();
// PP: Gebühren, Steuern, ISIN, Symbol, WKN initial ausgeblendet
const TX_HIDDEN_BY_DEFAULT = new Set<string>(['gebuehren', 'steuern', 'isin', 'symbol', 'wkn']);

/* PP AccountTransactionsPane Kontextmenü (Zeilen 564-616):
   Buchung editieren... | Buchung duplizieren... | Sep | AccountContextMenu |
   Sep | Buchung löschen */
function TxContextMenu({ x, y, canEdit, showSecurityActions, onEdit, onDuplicate, onAction, onDelete, onClose }: {
  x: number; y: number; canEdit: boolean;
  showSecurityActions: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onAction: (a: DialogState) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} style={{ ...MENU_STYLE, position: 'fixed', left: x, top: y }}>
      <button style={{ ...ITEM_STYLE, opacity: canEdit ? 1 : 0.4, cursor: canEdit ? 'pointer' : 'default' }}
        onMouseEnter={canEdit ? hoverOn : undefined} onMouseLeave={canEdit ? hoverOff : undefined}
        onClick={canEdit ? () => { onEdit(); onClose(); } : undefined} disabled={!canEdit}>
        Buchung editieren...
      </button>
      <button style={{ ...ITEM_STYLE, opacity: canEdit ? 1 : 0.4, cursor: canEdit ? 'pointer' : 'default' }}
        onMouseEnter={canEdit ? hoverOn : undefined} onMouseLeave={canEdit ? hoverOff : undefined}
        onClick={canEdit ? () => { onDuplicate(); onClose(); } : undefined} disabled={!canEdit}>
        Buchung duplizieren...
      </button>
      <div style={SEP_STYLE} />
      <AccountMenuItems onAction={a => { onAction(a); onClose(); }} showSecurityActions={showSecurityActions} />
      <div style={SEP_STYLE} />
      <MenuItem label="Buchung löschen" onClick={() => { onDelete(); onClose(); }} danger />
    </div>
  );
}

/* Buchungstyp → passender PP-Dialog für Editieren/Duplizieren.
   Konto-Umbuchungen (CrossEntry aus zwei Buchungen) sind nicht editierbar. */
function dialogForTx(tx: Transaktion, mode: 'edit' | 'new'): DialogState | null {
  if (tx.typ === 'kauf' || tx.typ === 'verkauf')
    return { dialog: 'security', typ: tx.typ, initial: tx, mode };
  if (tx.typ === 'umbuchung_ein' || tx.typ === 'umbuchung_aus') {
    if (tx.depotName && !tx.kontoName)
      return { dialog: 'security', typ: tx.typ === 'umbuchung_ein' ? 'einlieferung' : 'auslieferung', initial: tx, mode };
    return null;
  }
  if (tx.typ === 'ausschuettung')
    return { dialog: 'account', typ: 'dividende', initial: tx, mode };
  return { dialog: 'account', typ: tx.typ as AccountTxTyp, initial: tx, mode };
}

const DETAIL_TABS = [
  { id: 'umsaetze', label: 'Umsätze' },
  { id: 'kontosaldenverlauf', label: 'Kontosaldenverlauf' },
];

/* ── "+" Dropdown (PP addNewButton, AccountListView.java Zeilen 110-132) ──
   "Neues Konto" + Separator + AccountContextMenu für das SELEKTIERTE Konto
   (menuAboutToShow kehrt bei account == null sofort zurück). */
function AddAccountDropdown({ hasSelection, showSecurityActions, onNewKonto, onAction, onClose }: {
  hasSelection: boolean;
  showSecurityActions: boolean;
  onNewKonto: () => void;
  onAction: (a: DialogState) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} style={{ ...MENU_STYLE, right: 0, top: '100%', marginTop: 2 }}>
      <MenuItem label="Neues Konto" onClick={() => { onNewKonto(); onClose(); }} />
      {hasSelection && (
        <>
          <div style={SEP_STYLE} />
          <AccountMenuItems onAction={a => { onAction(a); onClose(); }} showSecurityActions={showSecurityActions} />
        </>
      )}
    </div>
  );
}

/* ── Context Menu (right-click on account row) — PP fillAccountsContextMenu ── */
function KontoContextMenu({ x, y, konto, txCount, showSecurityActions, onAction, onToggleAktiv, onDelete, onClose }: {
  x: number; y: number; konto: KontoRow; txCount: number;
  showSecurityActions: boolean;
  onAction: (a: DialogState) => void;
  onToggleAktiv: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} style={{ ...MENU_STYLE, position: 'fixed', left: x, top: y }}>
      <AccountMenuItems onAction={a => { onAction(a); onClose(); }} showSecurityActions={showSecurityActions} />
      <div style={SEP_STYLE} />
      <MenuItem label="Saldodifferenzen finden" onClick={onClose} />
      <div style={SEP_STYLE} />
      <MenuItem label="CSV importieren..." onClick={onClose} />
      <MenuItem label="PDF importieren..." onClick={onClose} />
      <div style={SEP_STYLE} />
      <MenuItem label={konto.istInaktiv ? 'Konto aktivieren' : 'Konto deaktivieren'} onClick={() => { onToggleAktiv(); onClose(); }} />
      <button style={{ ...ITEM_STYLE, color: 'var(--pp-red-text)', opacity: txCount > 0 ? 0.4 : 1, cursor: txCount > 0 ? 'default' : 'pointer' }}
        onMouseEnter={txCount === 0 ? hoverOn : undefined} onMouseLeave={txCount === 0 ? hoverOff : undefined}
        onClick={txCount === 0 ? () => { onDelete(); onClose(); } : undefined}
        disabled={txCount > 0}>
        {txCount > 0 ? `Konto löschen (${txCount} Buchungen)` : 'Konto löschen'}
      </button>
    </div>
  );
}

/* ── Kontosaldenverlauf berechnen ── */
function computeBalanceHistory(txs: Transaktion[]): { datum: string; saldo: number }[] {
  if (txs.length === 0) return [];
  const sorted = [...txs].sort((a, b) => a.datum.getTime() - b.datum.getTime());
  let saldo = 0;
  const points: { datum: string; saldo: number }[] = [];
  for (const tx of sorted) {
    switch (tx.typ) {
      case 'einlage': case 'zinsen': case 'steuererstattung': case 'gebuehrenerstattung': case 'umbuchung_ein':
        saldo += tx.betrag; break;
      case 'dividende': case 'ausschuettung':
        saldo += tx.betrag - tx.steuern; break;
      case 'verkauf':
        saldo += tx.betrag - tx.gebuehren - tx.steuern; break;
      case 'kauf':
        saldo -= tx.betrag + tx.gebuehren + tx.steuern; break;
      case 'entnahme': case 'gebuehren': case 'steuern_tx': case 'zinsbelastung': case 'umbuchung_aus':
        saldo -= tx.betrag; break;
    }
    points.push({ datum: datumKurz(tx.datum), saldo });
  }
  return points;
}

// PP AccountListView: FILTER_INACTIVE_ACCOUNTS = "filter-redired-accounts"
const FILTER_INACTIVE_ACCOUNTS = 'filter-redired-accounts';

export default function KontenView() {
  const { state, addTransaktionen, editTransaktion, deleteTransaktion, addKonto, deleteKonto, toggleKontoAktiv, setKontoFarbe } = usePortfolio();
  const [selected, setSelected] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState('umsaetze');
  const [search, setSearch] = useState('');
  // PP: isFiltered = inaktive Konten ausblenden; Default aus PreferenceStore
  const [isFiltered, setIsFiltered] = useState(() => {
    try { return localStorage.getItem(FILTER_INACTIVE_ACCOUNTS) === 'true'; } catch { return false; }
  });
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; kontoKey: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [colMenuPos, setColMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<(DialogState & { konto?: string }) | null>(null);
  // Umsätze-Pane: Typ-Filter (PP TransactionFilterDropDown), Spaltenmenü, Zeilen-Kontextmenü
  const [txFilter, setTxFilter] = useState(() => {
    try { return localStorage.getItem('konten-tx-filter') ?? 'NONE'; } catch { return 'NONE'; }
  });
  const [txColMenuPos, setTxColMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [txCtxMenu, setTxCtxMenu] = useState<{ x: number; y: number; tx: Transaktion } | null>(null);

  // PP AccountContextMenu Zeile 64: nur wenn aktive Depots UND Wertpapiere existieren
  const showSecurityActions = useMemo(() =>
    Object.values(state.depots).some(d => !d.istInaktiv) && Object.keys(state.wertpapiere).length > 0,
    [state.depots, state.wertpapiere]);

  const konten = useMemo((): KontoRow[] => {
    const stateKonten = Object.values(state.konten);
    if (stateKonten.length > 0) {
      let list = stateKonten.map(k => {
        const txs = k.transaktionen;
        const letzte = txs.length > 0 ? txs.reduce((l, t) => t.datum > l ? t.datum : l, txs[0].datum) : undefined;
        return {
          key: k.name, name: k.name, saldo: k.saldo, waehrung: k.waehrung,
          notiz: k.notiz ?? '', letzteTransaktion: letzte, istInaktiv: !!k.istInaktiv,
          farbe: k.farbe,
        };
      });
      // PP resetInput(): isFiltered ? getActiveAccounts() : getAccounts()
      if (isFiltered) list = list.filter(k => !k.istInaktiv);
      return list;
    }
    if (state.transaktionen.length === 0) return [];
    let saldo = 0;
    let letzte: Date | undefined;
    for (const tx of state.transaktionen) {
      switch (tx.typ) {
        case 'einlage': case 'zinsen': case 'steuererstattung': case 'gebuehrenerstattung': case 'umbuchung_ein':
          saldo += tx.betrag; break;
        case 'dividende': case 'ausschuettung':
          saldo += tx.betrag - tx.steuern; break;
        case 'verkauf':
          saldo += tx.betrag - tx.gebuehren - tx.steuern; break;
        case 'kauf':
          saldo -= tx.betrag + tx.gebuehren + tx.steuern; break;
        case 'entnahme': case 'gebuehren': case 'steuern_tx': case 'zinsbelastung': case 'umbuchung_aus':
          saldo -= tx.betrag; break;
      }
      if (!letzte || tx.datum > letzte) letzte = tx.datum;
    }
    return [{ key: 'Verrechnungskonto', name: 'Verrechnungskonto', saldo, waehrung: 'EUR', notiz: '', letzteTransaktion: letzte, istInaktiv: false }];
  }, [state.konten, state.transaktionen, isFiltered]);

  // PP notifyViewCreationCompleted(): erste Zeile wird automatisch selektiert
  const selectedKey = selected ?? konten[0]?.key ?? null;

  const buchungenRows = useMemo((): TxRow[] => {
    if (!selectedKey) return [];
    const konto = state.konten[selectedKey];
    const kontoTxs = konto ? konto.transaktionen : state.transaktionen;

    // PP updateBalance(): aufsteigend sortieren, Saldo nach jeder Buchung
    const asc = [...kontoTxs].sort((a, b) => a.datum.getTime() - b.datum.getTime());
    let saldo = 0;
    const balanceById = new Map<string, number>();
    for (const tx of asc) {
      saldo += saldoDelta(tx);
      balanceById.set(tx.id, saldo);
    }

    // Wertpapier-Lookup für Symbol/WKN-Spalten
    const byIsin = new Map<string, { symbol?: string; wkn?: string }>();
    const byName = new Map<string, { symbol?: string; wkn?: string }>();
    for (const wp of Object.values(state.wertpapiere)) {
      if (wp.isin) byIsin.set(wp.isin, wp);
      byName.set(wp.name, wp);
    }

    let list = [...kontoTxs];
    const crit = getTransactionFilter(txFilter);
    list = list.filter(tx => crit.matches(tx));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(tx =>
        tx.wertpapierName.toLowerCase().includes(q) ||
        tx.isin.toLowerCase().includes(q) ||
        (tx.notiz ?? '').toLowerCase().includes(q) ||
        (TX_LABELS[tx.typ] ?? tx.typ).toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => b.datum.getTime() - a.datum.getTime());
    return list.map(tx => {
      const wp = (tx.isin && byIsin.get(tx.isin)) || byName.get(tx.wertpapierName);
      return { tx, kontostand: balanceById.get(tx.id) ?? 0, symbol: wp?.symbol ?? '', wkn: wp?.wkn ?? '' };
    });
  }, [state.konten, state.transaktionen, state.wertpapiere, selectedKey, search, txFilter]);

  const balanceHistory = useMemo(() => {
    if (!selectedKey) return [];
    const konto = state.konten[selectedKey];
    return computeBalanceHistory(konto ? konto.transaktionen : state.transaktionen);
  }, [state.konten, state.transaktionen, selectedKey]);

  const selectedKonto = konten.find(k => k.key === selectedKey);

  const onRowContextMenu = useCallback((e: React.MouseEvent, k: KontoRow) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, kontoKey: k.key });
  }, []);

  // Stabile Props für die (große) Umsätze-PPTable, damit React.memo greift
  const masterRowKey = useCallback((k: KontoRow) => k.key, []);
  const txRowKey = useCallback((r: TxRow) => r.tx.id, []);
  const onTxRowContextMenu = useCallback((e: React.MouseEvent, r: TxRow) => {
    e.preventDefault();
    setTxCtxMenu({ x: e.clientX, y: e.clientY, tx: r.tx });
  }, []);
  const closeColMenu = useCallback(() => setColMenuPos(null), []);
  const closeTxColMenu = useCallback(() => setTxColMenuPos(null), []);

  // PP MenuExportData = "Daten exportieren" (TableViewerCSVExporter)
  const exportCSV = useCallback(() => {
    const header = 'Datum;Typ;Betrag;Gebühren;Steuern;Kontostand;Wertpapier;ISIN;Symbol;WKN;Stück;Kurs;Gegenkonto;Notiz;Quelle';
    const rows = buchungenRows.map(r => {
      const kurs = r.tx.kurs > 0 ? r.tx.kurs : (r.tx.stueck > 0 ? r.tx.betrag / r.tx.stueck : 0);
      return [
        datumKurz(r.tx.datum), TX_LABELS[r.tx.typ] ?? r.tx.typ,
        saldoDelta(r.tx).toFixed(2), r.tx.gebuehren.toFixed(2), r.tx.steuern.toFixed(2),
        r.kontostand.toFixed(2), r.tx.wertpapierName, r.tx.isin, r.symbol, r.wkn,
        r.tx.stueck || '', kurs > 0 ? kurs.toFixed(4) : '',
        r.tx.gegenkontoName || r.tx.depotName || '', r.tx.notiz ?? '', r.tx.quelle ?? '',
      ].join(';');
    });
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${selectedKey || 'konto'}_umsaetze.csv`;
    a.click();
  }, [buchungenRows, selectedKey]);

  /* ── Master Panel (Konten-Tabelle mit Toolbar) ── */
  const masterPanel = (
    <div className="flex flex-col h-full">
      <div className="pp-toolbar">
        <span className="pp-toolbar-title">Konten</span>
        <div style={{ flex: 1 }} />
        {/* PP addNewButton */}
        <div className="relative">
          <button type="button" className="pp-toolbar-btn" title="Neues Konto oder Buchung anlegen" onClick={() => setAddOpen(!addOpen)}>
            <Plus size={14} />
          </button>
          {addOpen && (
            <AddAccountDropdown
              hasSelection={!!selectedKey && !!state.konten[selectedKey]}
              showSecurityActions={showSecurityActions}
              onNewKonto={() => { const name = addKonto(); setSelected(name); }}
              onAction={a => setDialog({ ...a, konto: selectedKey ?? undefined })}
              onClose={() => setAddOpen(false)}
            />
          )}
        </div>
        {/* PP addFilterButton */}
        <button type="button" className="pp-toolbar-btn" title="Inaktive Konten ausblenden"
          style={{ color: isFiltered ? 'var(--pp-accent)' : undefined }}
          onClick={() => {
            const next = !isFiltered;
            setIsFiltered(next);
            try { localStorage.setItem(FILTER_INACTIVE_ACCOUNTS, String(next)); } catch { /* */ }
          }}>
          <Filter size={14} />
        </button>
        {/* PP addConfigButton */}
        <button type="button" className="pp-toolbar-btn" title="Spalten anzeigen / ausblenden"
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            setColMenuPos(prev => prev ? null : { x: rect.right - 160, y: rect.bottom + 2 });
          }}>
          <Settings size={14} />
        </button>
      </div>
      <PPTable
        columns={COLUMNS} data={konten} rowKey={masterRowKey}
        selectedKey={selectedKey} onSelect={setSelected}
        storageKey="konten" hiddenByDefault={HIDDEN_BY_DEFAULT}
        onRowContextMenu={onRowContextMenu}
        columnMenuPos={colMenuPos}
        onColumnMenuClose={closeColMenu}
        menuExtra={() => (
          <FarbenMenuFooter
            label="Konto-Farben anpassen"
            items={konten.map(k => ({ name: k.name, farbe: k.farbe }))}
            onSetFarbe={setKontoFarbe}
          />
        )}
      />
    </div>
  );

  /* ── Detail Panel (Tabs: Umsätze, Kontosaldenverlauf) ── */
  const detailPanel = (
    <div className="flex flex-col h-full">
      {selectedKey ? (
        <>
          <div className="flex items-center gap-2 px-2 py-[3px]" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
            <ColorMarker color={selectedKonto?.farbe ?? getColor(selectedKey)} />
            <span className="text-[12px] font-semibold" style={{ color: 'var(--pp-text)' }}>{selectedKey}</span>
          </div>
          {/* PP InformationPane: Tabs + addButtons-Toolbar in EINER Zeile.
              AccountTransactionsPane.addButtons: Suchfeld | Sep | Typ-Filter |
              Daten exportieren | Spalten anzeigen/ausblenden — nur im Umsätze-Tab */}
          <TabBar tabs={DETAIL_TABS} active={detailTab} onChange={setDetailTab}
            actions={detailTab === 'umsaetze' ? (
              <>
                <SearchInput value={search} onChange={setSearch} />
                <div style={{ width: 1, height: 16, background: 'var(--pp-border)', flexShrink: 0 }} />
                <TransactionFilterButton value={txFilter} storageKey="konten-tx-filter" onChange={setTxFilter} />
                <button className="pp-toolbar-btn" title="Daten exportieren" onClick={exportCSV}><Download size={12} /></button>
                <button className="pp-toolbar-btn" title="Spalten anzeigen / ausblenden"
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTxColMenuPos(prev => prev ? null : { x: rect.right - 160, y: rect.bottom + 2 });
                  }}>
                  <Settings size={12} />
                </button>
              </>
            ) : undefined}
          />
          <div className="flex-1 overflow-auto flex flex-col">

            {detailTab === 'umsaetze' && (
              <>
                {buchungenRows.length > 0 ? (
                  <div className="flex-1 min-h-0">
                    <PPTable
                      columns={TX_COLUMNS} data={buchungenRows} rowKey={txRowKey}
                      storageKey="konten-umsaetze" hiddenByDefault={TX_HIDDEN_BY_DEFAULT}
                      onRowContextMenu={onTxRowContextMenu}
                      columnMenuPos={txColMenuPos}
                      onColumnMenuClose={closeTxColMenu}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
                    Keine Umsätze vorhanden
                  </div>
                )}
              </>
            )}

            {/* ── Kontosaldenverlauf Tab ── */}
            {detailTab === 'kontosaldenverlauf' && (
              balanceHistory.length > 0 ? (
                <div className="p-3 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={balanceHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
                      <XAxis dataKey="datum" tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} width={70} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                        formatter={(v) => [euro(v as number), 'Saldo']} />
                      <Line type="stepAfter" dataKey="saldo" stroke="var(--pp-accent)" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
                  Keine Daten für Kontosaldenverlauf
                </div>
              )
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Kein Konto ausgewählt
        </div>
      )}
    </div>
  );

  // PP AccountContextMenu Zeilen 68-76: Depot vorauswählen, dessen
  // Referenzkonto das aktuelle Konto ist
  const depotForKonto = (kontoName?: string) =>
    kontoName ? Object.values(state.depots).find(d => d.referenzkontoName === kontoName)?.name : undefined;

  // Editieren ersetzt die Buchung (EDIT_TX), Neuanlage/Duplizieren fügt hinzu
  const handleDialogSave = (txs: Transaktion[]) => {
    if (dialog && 'mode' in dialog && dialog.mode === 'edit') editTransaktion(txs[0]);
    else addTransaktionen(txs);
  };

  return (
    <>
      <SplitPane top={masterPanel} bottom={detailPanel} defaultTopPercent={40} storageKey="konten" />
      {ctxMenu && (
        <KontoContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          konto={konten.find(k => k.key === ctxMenu.kontoKey) ?? konten[0]}
          txCount={state.konten[ctxMenu.kontoKey]?.transaktionen?.length ?? 0}
          showSecurityActions={showSecurityActions}
          onAction={a => setDialog({ ...a, konto: ctxMenu.kontoKey })}
          onToggleAktiv={() => toggleKontoAktiv(ctxMenu.kontoKey)}
          onDelete={() => {
            // PP ConfirmAction: AccountMenuDeleteConfirm
            if (confirm(`Möchten Sie das Konto '${ctxMenu.kontoKey}' wirklich löschen?`)) {
              deleteKonto(ctxMenu.kontoKey);
              if (selected === ctxMenu.kontoKey) setSelected(null);
            }
          }}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {txCtxMenu && (
        <TxContextMenu
          x={txCtxMenu.x} y={txCtxMenu.y}
          canEdit={dialogForTx(txCtxMenu.tx, 'edit') !== null}
          showSecurityActions={showSecurityActions}
          onEdit={() => {
            const d = dialogForTx(txCtxMenu.tx, 'edit');
            if (d) setDialog({ ...d, konto: selectedKey ?? undefined });
          }}
          onDuplicate={() => {
            const d = dialogForTx(txCtxMenu.tx, 'new');
            if (d) setDialog({ ...d, konto: selectedKey ?? undefined });
          }}
          onAction={a => setDialog({ ...a, konto: selectedKey ?? undefined })}
          onDelete={() => deleteTransaktion(txCtxMenu.tx.id)}
          onClose={() => setTxCtxMenu(null)}
        />
      )}
      {dialog?.dialog === 'account' && (
        <AccountTransactionDialog
          typ={dialog.typ} konten={state.konten} wertpapiere={state.wertpapiere}
          preselectedKonto={dialog.konto}
          initial={dialog.initial} mode={dialog.mode ?? 'new'}
          onSave={handleDialogSave} onClose={() => setDialog(null)}
        />
      )}
      {dialog?.dialog === 'transfer' && (
        <AccountTransferDialog
          konten={state.konten} preselectedKonto={dialog.konto}
          onSave={addTransaktionen} onClose={() => setDialog(null)}
        />
      )}
      {dialog?.dialog === 'security' && (
        <SecurityTransactionDialog
          typ={dialog.typ} konten={state.konten} depots={state.depots} wertpapiere={state.wertpapiere}
          preselectedKonto={dialog.konto} preselectedDepot={depotForKonto(dialog.konto)}
          initial={dialog.initial} mode={dialog.mode ?? 'new'}
          onSave={handleDialogSave} onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
