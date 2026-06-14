import { useMemo, useState, useCallback } from 'react';
import { PPTable, type PPColumn } from './PPTable';
import { SearchInput, ColorMarker, getColor } from './PPElements';
import { TransactionFilterButton, getTransactionFilter } from './TransactionFilter';
import { euro, stueck, datumKurz } from '../utils/format';
import { Download, Settings } from 'lucide-react';
import type { Transaktion } from '../types/portfolio';

/* ══════════════════════════════════════════════════════════════════════
   Umsätze — vollständige Transaktions-Tabelle (PP TransactionsViewer):
   Datum | Typ | Wertpapier | ISIN | Symbol | WKN | Stück | Kurs | Betrag |
   Gebühren | Steuern | Gesamtpreis | Konto | Gegenkonto | Notiz | Quelle.
   Toolbar (in der TabBar-Zeile, wie Konten): Suche · Typ-Filter · Export ·
   Spaltenmenü. Über useUmsaetze() werden Toolbar und Tabelle getrennt
   geliefert, damit das Layout exakt dem Konten-Tab entspricht.
   ══════════════════════════════════════════════════════════════════════ */

export const UMSATZ_TX_LABELS: Record<string, string> = {
  kauf: 'Kauf', verkauf: 'Verkauf', dividende: 'Dividende', ausschuettung: 'Ausschüttung',
  einlage: 'Einlage', entnahme: 'Entnahme', zinsen: 'Zinsen', zinsbelastung: 'Zinsbelastung',
  gebuehren: 'Gebühren', gebuehrenerstattung: 'Gebührenerstattung',
  steuern_tx: 'Steuern', steuererstattung: 'Steuerrückerstattung',
  umbuchung_ein: 'Einlieferung', umbuchung_aus: 'Auslieferung',
};

interface UmsatzRow { tx: Transaktion; symbol: string; wkn: string }

function txColor(tx: Transaktion): string {
  return (tx.typ === 'verkauf' || tx.typ === 'umbuchung_aus') ? 'var(--pp-red-text)' : 'var(--pp-green-text)';
}
function txNetto(tx: Transaktion): number {
  return (tx.typ === 'kauf' || tx.typ === 'umbuchung_ein')
    ? tx.betrag + tx.gebuehren + tx.steuern
    : tx.betrag - tx.gebuehren - tx.steuern;
}

/* Farb-Lookups: für Wertpapier (Typ-Farbe), Konto, Gegenkonto. Liefern undefined
   → Fallback getColor(name). So zeigen Wertpapier/Konto/Gegenkonto farbige
   Symbole wie in PP (LogoManager). */
interface FarbLookups {
  wpFarbe?: (tx: Transaktion) => string | undefined;
  wpInaktiv?: (tx: Transaktion) => boolean;
  kontoFarbe?: (name: string) => string | undefined;
}
function buildColumns(farben: FarbLookups): PPColumn<UmsatzRow>[] {
  return [
    { id: 'datum', label: 'Datum', width: 80, render: r => <span className="mono" style={{ color: txColor(r.tx) }}>{datumKurz(r.tx.datum)}</span>, sortFn: (a, b) => a.tx.datum.getTime() - b.tx.datum.getTime() },
    { id: 'typ', label: 'Typ', width: 80, render: r => <span style={{ color: txColor(r.tx) }}>{UMSATZ_TX_LABELS[r.tx.typ] ?? r.tx.typ}</span>, sortFn: (a, b) => (UMSATZ_TX_LABELS[a.tx.typ] ?? '').localeCompare(UMSATZ_TX_LABELS[b.tx.typ] ?? '') },
    { id: 'wertpapier', label: 'Wertpapier', width: 250, render: r => r.tx.wertpapierName ? <span className="flex items-center gap-1.5"><ColorMarker color={farben.wpFarbe?.(r.tx) || getColor(r.tx.isin || r.tx.wertpapierName)} inaktiv={farben.wpInaktiv?.(r.tx)} /><span style={{ color: txColor(r.tx) }}>{r.tx.wertpapierName}</span></span> : '', sortFn: (a, b) => a.tx.wertpapierName.localeCompare(b.tx.wertpapierName) },
    { id: 'isin', label: 'ISIN', width: 100, render: r => <span className="mono">{r.tx.isin}</span>, sortFn: (a, b) => a.tx.isin.localeCompare(b.tx.isin) },
    { id: 'symbol', label: 'Symbol', width: 80, render: r => r.symbol, sortFn: (a, b) => a.symbol.localeCompare(b.symbol) },
    { id: 'wkn', label: 'WKN', width: 80, render: r => r.wkn, sortFn: (a, b) => a.wkn.localeCompare(b.wkn) },
    { id: 'stueck', label: 'Stück', width: 80, align: 'right', render: r => r.tx.stueck > 0 ? <span className="mono" style={{ color: txColor(r.tx) }}>{stueck(r.tx.stueck)}</span> : '', sortFn: (a, b) => a.tx.stueck - b.tx.stueck },
    { id: 'kurs', label: 'Kurs', width: 80, align: 'right', render: r => { const k = r.tx.kurs > 0 ? r.tx.kurs : (r.tx.stueck > 0 ? r.tx.betrag / r.tx.stueck : 0); return k > 0 ? <span className="mono" style={{ color: txColor(r.tx) }}>{euro(k)}</span> : ''; }, sortFn: (a, b) => a.tx.kurs - b.tx.kurs },
    { id: 'betrag', label: 'Betrag', width: 80, align: 'right', render: r => <span className="mono" style={{ color: txColor(r.tx) }}>{euro(r.tx.betrag)}</span>, sortFn: (a, b) => a.tx.betrag - b.tx.betrag },
    { id: 'gebuehren', label: 'Gebühren', width: 80, align: 'right', render: r => r.tx.gebuehren > 0 ? <span className="mono">{euro(r.tx.gebuehren)}</span> : '', sortFn: (a, b) => a.tx.gebuehren - b.tx.gebuehren },
    { id: 'steuern', label: 'Steuern', width: 80, align: 'right', render: r => r.tx.steuern > 0 ? <span className="mono">{euro(r.tx.steuern)}</span> : '', sortFn: (a, b) => a.tx.steuern - b.tx.steuern },
    { id: 'gesamtpreis', label: 'Gesamtpreis', width: 80, align: 'right', render: r => <span className="mono" style={{ color: txColor(r.tx) }}>{euro(txNetto(r.tx))}</span>, sortFn: (a, b) => txNetto(a.tx) - txNetto(b.tx) },
    // PP ColumnExDate ("Ex-Tag") — Ex-Dividendendatum, initial ausgeblendet. Im
    // Tool-Modell nicht erfasst → bleibt leer, Spalte aber im Menü vorhanden.
    { id: 'exdate', label: 'Ex-Tag', width: 80, render: () => '', sortFn: () => 0 },
    { id: 'konto', label: 'Konto', width: 120, render: r => r.tx.kontoName ? <span className="flex items-center gap-1.5"><ColorMarker color={farben.kontoFarbe?.(r.tx.kontoName) || getColor(r.tx.kontoName)} /><span style={{ color: 'var(--pp-text-muted)' }}>{r.tx.kontoName}</span></span> : '', sortFn: (a, b) => (a.tx.kontoName ?? '').localeCompare(b.tx.kontoName ?? '') },
    { id: 'gegenkonto', label: 'Gegenkonto', width: 120, render: r => r.tx.gegenkontoName ? <span className="flex items-center gap-1.5"><ColorMarker color={farben.kontoFarbe?.(r.tx.gegenkontoName) || getColor(r.tx.gegenkontoName)} /><span style={{ color: 'var(--pp-text-muted)' }}>{r.tx.gegenkontoName}</span></span> : '', sortFn: (a, b) => (a.tx.gegenkontoName ?? '').localeCompare(b.tx.gegenkontoName ?? '') },
    { id: 'notiz', label: 'Notiz', width: 200, render: r => r.tx.notiz ?? '', sortFn: (a, b) => (a.tx.notiz ?? '').localeCompare(b.tx.notiz ?? '') },
    { id: 'quelle', label: 'Quelle', width: 200, render: r => r.tx.quelle ?? '', sortFn: (a, b) => (a.tx.quelle ?? '').localeCompare(b.tx.quelle ?? '') },
  ];
}
// PP TransactionsViewer: ISIN, Symbol, WKN, Ex-Tag initial ausgeblendet
const HIDDEN_BY_DEFAULT = new Set<string>(['isin', 'symbol', 'wkn', 'exdate']);

interface Options {
  transaktionen: Transaktion[];
  symbolWknOf: (tx: Transaktion) => { symbol: string; wkn: string };
  storageKey: string;
  exportFileName?: string;
  // optionale Farb-Lookups für die Symbole (Wertpapier/Konto/Gegenkonto)
  wpFarbe?: (tx: Transaktion) => string | undefined;
  wpInaktiv?: (tx: Transaktion) => boolean;
  kontoFarbe?: (name: string) => string | undefined;
}

/* Liefert Toolbar-Controls (für die TabBar-Zeile, Layout wie Konten) und die
   fertige Tabelle getrennt. */
export function useUmsaetze({ transaktionen, symbolWknOf, storageKey, exportFileName = 'umsaetze', wpFarbe, wpInaktiv, kontoFarbe }: Options) {
  const COLUMNS = useMemo(() => buildColumns({ wpFarbe, wpInaktiv, kontoFarbe }), [wpFarbe, wpInaktiv, kontoFarbe]);
  const [search, setSearch] = useState('');
  const [typFilter, setTypFilter] = useState(() => { try { return localStorage.getItem(`${storageKey}-filter`) ?? 'NONE'; } catch { return 'NONE'; } });
  const [colMenuPos, setColMenuPos] = useState<{ x: number; y: number } | null>(null);

  const rows = useMemo((): UmsatzRow[] => {
    const crit = getTransactionFilter(typFilter);
    let list = transaktionen.filter(tx => crit.matches(tx));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(tx =>
        tx.wertpapierName.toLowerCase().includes(q) ||
        tx.isin.toLowerCase().includes(q) ||
        (tx.notiz ?? '').toLowerCase().includes(q) ||
        (UMSATZ_TX_LABELS[tx.typ] ?? tx.typ).toLowerCase().includes(q));
    }
    list.sort((a, b) => b.datum.getTime() - a.datum.getTime());
    return list.map(tx => ({ tx, ...symbolWknOf(tx) }));
  }, [transaktionen, search, typFilter, symbolWknOf]);

  const rowKey = useCallback((r: UmsatzRow) => r.tx.id, []);

  const exportCSV = useCallback(() => {
    const header = 'Datum;Typ;Wertpapier;ISIN;Symbol;WKN;Stück;Kurs;Betrag;Gebühren;Steuern;Gesamtpreis;Konto;Gegenkonto;Notiz;Quelle';
    const lines = rows.map(r => [
      datumKurz(r.tx.datum), UMSATZ_TX_LABELS[r.tx.typ] ?? r.tx.typ, r.tx.wertpapierName,
      r.tx.isin, r.symbol, r.wkn, r.tx.stueck, r.tx.kurs,
      r.tx.betrag.toFixed(2), r.tx.gebuehren.toFixed(2), r.tx.steuern.toFixed(2),
      txNetto(r.tx).toFixed(2), r.tx.kontoName || '', r.tx.gegenkontoName || '',
      r.tx.notiz ?? '', r.tx.quelle ?? '',
    ].join(';'));
    const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${exportFileName}.csv`;
    a.click();
  }, [rows, exportFileName]);

  // Toolbar-Controls (in die TabBar actions legen — Layout wie Konten)
  const toolbar = (
    <>
      <SearchInput value={search} onChange={setSearch} />
      <div style={{ width: 1, height: 16, background: 'var(--pp-border)', flexShrink: 0 }} />
      <TransactionFilterButton value={typFilter} storageKey={`${storageKey}-filter`} onChange={setTypFilter} />
      <button className="pp-toolbar-btn" title="Daten exportieren" onClick={exportCSV}><Download size={12} /></button>
      <button className="pp-toolbar-btn" title="Spalten anzeigen / ausblenden"
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setColMenuPos(prev => prev ? null : { x: r.right - 160, y: r.bottom + 2 }); }}>
        <Settings size={12} />
      </button>
    </>
  );

  const table = rows.length > 0 ? (
    // flex flex-col: PPTable's flex-1-Scroller braucht einen Flex-Eltern, sonst
    // wächst er auf volle Inhaltshöhe und die Virtualisierung greift nicht.
    <div className="flex-1 min-h-0 flex flex-col">
      <PPTable
        columns={COLUMNS} data={rows} rowKey={rowKey}
        storageKey={storageKey} hiddenByDefault={HIDDEN_BY_DEFAULT}
        columnMenuPos={colMenuPos} onColumnMenuClose={() => setColMenuPos(null)}
      />
    </div>
  ) : (
    <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>Keine Umsätze vorhanden</div>
  );

  return { toolbar, table };
}
