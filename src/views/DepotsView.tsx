import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { SplitPane } from '../components/SplitPane';
import { SearchInput, TabBar, ColorMarker, getColor } from '../components/PPElements';
import { TransactionFilterButton, getTransactionFilter } from '../components/TransactionFilter';
import { FarbenMenuFooter } from '../components/FarbenMenu';
import { useColumnConfig, ColumnHeader, type ColumnDef } from '../components/useColumnConfig';
import { HierarchyMenu, type MenuNode } from '../components/HierarchyMenu';
import { ReportingPeriodDialog, type ReportingPeriodResult } from '../components/ReportingPeriodDialog';
import { euro, kurs as kursFmt, kursLive, stueck, num, datumKurz, prozent } from '../utils/format';
import { Plus, Filter, Settings, Download } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { AccountTransactionDialog, SecurityTransactionDialog, SecurityTransferDialog, type AccountTxTyp, type SecurityTxTyp } from '../components/TransactionDialogs';
import type { Wertpapier, Transaktion } from '../types/portfolio';

/* ══════════════════════════════════════════════════════════════════════
   PP PortfolioListView — columns, context menu, 4 detail tabs
   Matches: PortfolioListView.java, SecurityContextMenu.java
   ══════════════════════════════════════════════════════════════════════ */

// labels_de.properties (portfolio.* für Depot-Kontext)
const TX_LABELS: Record<string, string> = {
  kauf: 'Kauf', verkauf: 'Verkauf', dividende: 'Dividende', ausschuettung: 'Ausschüttung',
  einlage: 'Einlage', entnahme: 'Entnahme', zinsen: 'Zinsen', zinsbelastung: 'Zinsbelastung',
  gebuehren: 'Gebühren', gebuehrenerstattung: 'Gebührenerstattung',
  steuern_tx: 'Steuern', steuererstattung: 'Steuerrückerstattung',
  umbuchung_ein: 'Einlieferung', umbuchung_aus: 'Auslieferung',
};

type DialogState =
  | { dialog: 'security'; typ: SecurityTxTyp }
  | { dialog: 'account'; typ: AccountTxTyp }
  | { dialog: 'securityTransfer' };

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

/* ── PP SecurityContextMenu entries (SecurityContextMenu.java Zeilen 56-175) ──
   PortfolioListView ruft mit List.of() auf → security == null →
   kein "Neuer Sparplan", kein "Editieren", kein Lesezeichen-Menü.
   Separator + Umbuchung nur wenn aktive Depots > 1. */
function SecurityMenuItems({ onAction, depotCount }: {
  onAction: (a: DialogState) => void;
  depotCount: number;
}) {
  return (
    <>
      <MenuItem label="Kauf..." onClick={() => onAction({ dialog: 'security', typ: 'kauf' })} />
      <MenuItem label="Verkauf..." onClick={() => onAction({ dialog: 'security', typ: 'verkauf' })} />
      <MenuItem label="Dividende..." onClick={() => onAction({ dialog: 'account', typ: 'dividende' })} />
      <MenuItem label="Steuern..." onClick={() => onAction({ dialog: 'account', typ: 'steuern_tx' })} />
      <MenuItem label="Steuerrückerstattung..." onClick={() => onAction({ dialog: 'account', typ: 'steuererstattung' })} />
      <MenuItem label="Aktiensplit..." onClick={() => { /* PP: StockSplitWizard — noch nicht implementiert */ }} />
      <MenuItem label="Ereignis..." onClick={() => { /* PP: CustomEventWizard — noch nicht implementiert */ }} />
      {depotCount > 1 && (
        <>
          <div style={SEP_STYLE} />
          <MenuItem label="Umbuchung..." onClick={() => onAction({ dialog: 'securityTransfer' })} />
        </>
      )}
      <div style={SEP_STYLE} />
      <MenuItem label="Einlieferung..." onClick={() => onAction({ dialog: 'security', typ: 'einlieferung' })} />
      <MenuItem label="Auslieferung..." onClick={() => onAction({ dialog: 'security', typ: 'auslieferung' })} />
    </>
  );
}

/* ── DepotPosition: shares calculated from portfolio-transactions per depot.
   Einstand/Kursgewinn nach PP CostCalculation: FIFO vs GLD (gleitender Durch-
   schnitt), Brutto (mit Gebühren/Steuern) vs Netto (nur Wertpapierwert). ── */
interface DepotPosition {
  wpKey: string;
  name: string;
  isin: string;
  symbol: string;
  wkn: string;
  waehrung: string;
  kursdatum?: Date;
  notiz: string;
  typ: string;
  typFarbe?: string;
  shares: number;
  kurs: number;
  marktwert: number;
  // Einstandspreis (gesamt) — PP getCost()
  investiert: number;        // FIFO brutto (Default "Einstandspreis")
  investiertFifoNetto: number;
  investiertGldBrutto: number;
  investiertGldNetto: number;
  // Einstandskurs (pro Stück) — PP getCostPerSharesHeld()
  einstandskurs: number;     // FIFO netto (Default "Einstandskurs")
  einstandskursFifoBrutto: number;
  einstandskursGldNetto: number;
  einstandskursGldBrutto: number;
  // Gewinn/Verlust + Kursgewinn
  gewinn: number;            // marktwert - investiert (FIFO brutto)
  gewinnProzent: number;
  kursgewinnFifo: number;    // marktwert - FIFO brutto-Kosten
  kursgewinnFifoPct: number;
  kursgewinnGld: number;     // marktwert - GLD brutto-Kosten
  kursgewinnGldPct: number;
  // Dividenden (für dieses Wertpapier im Depot/Referenzkonto)
  dividendenSumme: number;
  divRenditeFifo: number;    // Summe Div / FIFO brutto-Kosten
  divRenditeGld: number;     // Summe Div / GLD brutto-Kosten
  // Absolute Performance (Delta) — PP DeltaCalculation
  delta: number;
  deltaPct: number;
  // Kurshistorie-basiert (PP DistanceFromMovingAverage / AllTimeHigh / QuoteRange)
  abstandSma: Record<number, number>;   // SMA-Periode (Tage) → (Kurs/SMA−1) in %
  abstandAth: Record<string, number>;   // Perioden-Key → (Kurs−ATH)/ATH in %
  kursspanne: Record<string, { tief: number; hoch: number; pos: number }>; // Perioden-Key → Spanne
  // Geldgewichtete/zeitgewichtete Rendite (PP IRR / PerformanceIndex)
  izf: number;              // Interner Zinsfuß (IZF), annualisiert, in % (Gesamtzeitraum, Legacy)
  ttwror: number;           // True Time-Weighted Rate of Return, in % (Gesamtzeitraum, Legacy)
  // Periodenabhängige Kennzahlen (PP ReportingPeriodColumnOptions) — je Perioden-Key:
  perfByPeriod: Record<string, {
    ttwror: number; ttwrorPa: number; izf: number;
    kursgewinnFifo: number; kursgewinnFifoPct: number;
    kursgewinnGld: number; kursgewinnGldPct: number;
    delta: number; deltaPct: number;
    divSumme: number; divFifo: number; divGld: number;
  }>;
}

interface DepotRow {
  key: string;
  name: string;
  referenzkonto: string;
  volumen: number;
  referenzkontoSaldo: number;
  letzteTransaktion?: Date;
  notiz: string;
  istInaktiv: boolean;
  farbe?: string;
}

const SHARES_ADD = new Set(['kauf', 'umbuchung_ein']);
const SHARES_SUB = new Set(['verkauf', 'umbuchung_aus']);

/* PP PortfolioListView Zeilen 210-287:
   Depot(100) | Referenzkonto(160) | Depotvolumen(100,R) |
   Saldo des Referenzkontos(100,R) | Letztes Buchungsdatum(80,R, hidden) | Notiz(200) */
interface DepotEditProps {
  // PP: NameColumn StringEditingSupport + ListEditingSupport(referenceAccount)
  editCell: { key: string; field: 'name' | 'referenzkonto' } | null;
  setEditCell: (c: { key: string; field: 'name' | 'referenzkonto' } | null) => void;
  kontoNamen: string[];
  onRename: (name: string, neuerName: string) => void;
  onSetReferenzkonto: (name: string, referenzkonto: string) => void;
}
function buildColumns(edit: DepotEditProps): PPColumn<DepotRow>[] {
  const { editCell, setEditCell, kontoNamen, onRename, onSetReferenzkonto } = edit;
  return [
    {
      id: 'name', label: 'Depot', width: 100, minWidth: 80,
      render: d => {
        // PP: Doppelklick auf den Depotnamen → Inline-Textfeld (StringEditingSupport)
        if (editCell?.key === d.key && editCell.field === 'name') {
          return (
            <input autoFocus defaultValue={d.name}
              onClick={e => e.stopPropagation()}
              onBlur={e => { onRename(d.key, e.target.value); setEditCell(null); }}
              onKeyDown={e => {
                if (e.key === 'Enter') { onRename(d.key, (e.target as HTMLInputElement).value); setEditCell(null); }
                else if (e.key === 'Escape') setEditCell(null);
              }}
              style={{ width: '100%', padding: '1px 4px', fontSize: 12, background: 'var(--pp-content-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-accent)', borderRadius: 2 }} />
          );
        }
        return (
          <span className="flex items-center gap-1.5"
            onDoubleClick={e => { e.stopPropagation(); setEditCell({ key: d.key, field: 'name' }); }}>
            <ColorMarker color={d.farbe ?? getColor(d.name)} />
            <span style={{ color: d.istInaktiv ? 'var(--pp-text-muted)' : undefined }}>{d.name}</span>
          </span>
        );
      },
      sortFn: (a, b) => a.name.localeCompare(b.name),
    },
    {
      id: 'referenzkonto', label: 'Referenzkonto', width: 160,
      render: d => {
        // PP: Doppelklick auf das Referenzkonto → Dropdown aller Konten (ListEditingSupport)
        if (editCell?.key === d.key && editCell.field === 'referenzkonto') {
          return (
            <select autoFocus defaultValue={d.referenzkonto}
              onClick={e => e.stopPropagation()}
              onChange={e => { onSetReferenzkonto(d.key, e.target.value); setEditCell(null); }}
              onBlur={() => setEditCell(null)}
              onKeyDown={e => { if (e.key === 'Escape') setEditCell(null); }}
              style={{ width: '100%', padding: '1px 4px', fontSize: 12, background: 'var(--pp-content-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-accent)', borderRadius: 2 }}>
              {kontoNamen.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          );
        }
        return (
          <span onDoubleClick={e => { e.stopPropagation(); setEditCell({ key: d.key, field: 'referenzkonto' }); }}
            style={{ display: 'block', width: '100%' }}>
            {d.referenzkonto}
          </span>
        );
      },
      sortFn: (a, b) => a.referenzkonto.localeCompare(b.referenzkonto),
    },
    {
      id: 'volumen', label: 'Depotvolumen', width: 100, align: 'right',
      render: d => euro(d.volumen),
      sortFn: (a, b) => a.volumen - b.volumen,
    },
    {
      id: 'referenzkontoSaldo', label: 'Saldo des Referenzkontos', width: 100, align: 'right',
      render: d => euro(d.referenzkontoSaldo),
      sortFn: (a, b) => a.referenzkontoSaldo - b.referenzkontoSaldo,
    },
    {
      id: 'letzteBuchung', label: 'Letztes Buchungsdatum', width: 80, align: 'right',
      render: d => d.letzteTransaktion ? datumKurz(d.letzteTransaktion) : '',
      sortFn: (a, b) => (a.letzteTransaktion?.getTime() ?? 0) - (b.letzteTransaktion?.getTime() ?? 0),
    },
    {
      id: 'notiz', label: 'Notiz', width: 200,
      render: d => d.notiz,
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

// PP LastTransactionDateColumn.java Zeile 27: setVisible(false); Attribut-Spalten initial aus
const HIDDEN_BY_DEFAULT = new Set<string>(['letzteBuchung', 'logo']);

const DETAIL_TABS = [
  { id: 'vermoegensuebersicht', label: 'Vermögensaufstellung' },
  { id: 'umsaetze', label: 'Umsätze' },
  { id: 'diagramm', label: 'Diagramm' },
  { id: 'bestand', label: 'Bestand' },
];

/* ── "+" Dropdown (PP addNewButton, PortfolioListView.java Zeilen 134-164) ──
   "Neues Depot" + Separator + SecurityContextMenu (security == null).
   SecurityContextMenu erscheint nur, wenn Wertpapiere existieren (Zeile 58). */
function AddPortfolioDropdown({ depotCount, hasSecurities, onNewDepot, onAction, onClose }: {
  depotCount: number;
  hasSecurities: boolean;
  onNewDepot: () => void;
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
      <MenuItem label="Neues Depot" onClick={() => { onNewDepot(); onClose(); }} />
      {hasSecurities && (
        <>
          <div style={SEP_STYLE} />
          <SecurityMenuItems onAction={a => { onAction(a); onClose(); }} depotCount={depotCount} />
        </>
      )}
    </div>
  );
}

/* ── Context Menu (right-click on depot row) — PP fillPortfolioContextMenu ── */
function DepotContextMenu({ x, y, depot, depotCount, txCount, hasSecurities, onAction, onToggleAktiv, onDelete, onClose }: {
  x: number; y: number; depot: DepotRow; depotCount: number; txCount: number;
  hasSecurities: boolean;
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
      {hasSecurities && <SecurityMenuItems onAction={a => { onAction(a); onClose(); }} depotCount={depotCount} />}
      {!depot.istInaktiv && (
        <>
          <div style={SEP_STYLE} />
          <MenuItem label="CSV importieren..." onClick={onClose} />
          <MenuItem label="PDF importieren..." onClick={onClose} />
        </>
      )}
      <div style={SEP_STYLE} />
      <MenuItem label={depot.istInaktiv ? 'Depot aktivieren' : 'Depot deaktivieren'} onClick={() => { onToggleAktiv(); onClose(); }} />
      <button style={{ ...ITEM_STYLE, color: 'var(--pp-red-text)', opacity: txCount > 0 ? 0.4 : 1, cursor: txCount > 0 ? 'default' : 'pointer' }}
        onMouseEnter={txCount === 0 ? hoverOn : undefined} onMouseLeave={txCount === 0 ? hoverOff : undefined}
        onClick={txCount === 0 ? () => { onDelete(); onClose(); } : undefined}
        disabled={txCount > 0}>
        {txCount > 0 ? `Depot löschen (${txCount} Buchungen)` : 'Depot löschen'}
      </button>
    </div>
  );
}

/* ── Pie chart colors ── */
const PIE_COLORS = ['#2196f3', '#ff9800', '#4caf50', '#9c27b0', '#e91e63', '#00bcd4', '#ff5722', '#607d8b', '#8bc34a', '#3f51b5'];

/* Interner Zinsfuß (IZF/IRR) — PP IRR.java (Newton-Verfahren über Cashflows).
   cashflows: {datum, betrag} mit Käufen negativ, Verkäufe/Dividenden positiv,
   Endwert (Marktwert) positiv am Stichtag. Rückgabe: annualisierte Rendite in %. */
function computeIrr(cashflows: { datum: Date; betrag: number }[]): number {
  if (cashflows.length < 2) return 0;
  const t0 = cashflows[0].datum.getTime();
  const years = cashflows.map(c => (c.datum.getTime() - t0) / (365 * 86400000));
  const amounts = cashflows.map(c => c.betrag);
  const npv = (r: number) => amounts.reduce((s, a, i) => s + a / Math.pow(1 + r, years[i]), 0);
  const dnpv = (r: number) => amounts.reduce((s, a, i) => s - (years[i] * a) / Math.pow(1 + r, years[i] + 1), 0);
  // Vorzeichenwechsel? sonst kein sinnvoller IZF
  const hasPos = amounts.some(a => a > 0), hasNeg = amounts.some(a => a < 0);
  if (!hasPos || !hasNeg) return 0;
  // Newton-Iteration mit Startwert 0.05
  let r = 0.05;
  for (let i = 0; i < 50; i++) {
    const f = npv(r);
    const df = dnpv(r);
    if (Math.abs(df) < 1e-10) break;
    const next = r - f / df;
    if (!isFinite(next)) break;
    if (Math.abs(next - r) < 1e-7) { r = next; break; }
    r = Math.max(-0.99, next);
  }
  return isFinite(r) ? r * 100 : 0;
}

/* TTWROR (zeitgewichtete Rendite) — PP PerformanceIndex.
   Approximation pro Position: täglicher Wertindex aus der Kurshistorie, bei
   Cashflows (Käufe/Verkäufe) wird der Cashflow herausgerechnet (delta-Methode).
   Hier vereinfacht über die Kursperformance des gehaltenen Bestands. */
function computeTtwror(
  txs: Transaktion[],
  wp: Wertpapier | undefined,
): number {
  if (!wp || !wp.kursHistorie || wp.kursHistorie.length < 2) return 0;
  const sorted = [...txs].sort((a, b) => a.datum.getTime() - b.datum.getTime());
  if (sorted.length === 0) return 0;
  const startDatum = sorted[0].datum;
  const hist = wp.kursHistorie.filter(h => h.datum >= startDatum);
  if (hist.length < 2) return 0;
  // Tägliche Verkettung: (Kurs_t / Kurs_{t-1}) — Cashflows ändern den Bestand,
  // nicht die Kursperformance (TTWROR eliminiert Cashflow-Timing).
  let acc = 1;
  for (let i = 1; i < hist.length; i++) {
    const prev = hist[i - 1].kurs, cur = hist[i].kurs;
    if (prev > 0) acc *= cur / prev;
  }
  return (acc - 1) * 100;
}

/* SMA-Perioden (Tage) — PP DistanceFromMovingAverageColumn Zeile 145 */
const SMA_PERIODS = [5, 20, 30, 38, 50, 90, 100, 200];
/* Reporting-Perioden für ATH/Kursspanne — PP ReportingPeriod (Auswahl der gängigen).
   key: Tage-Fenster ('all' = gesamte Historie) */
interface ReportPeriod { key: string; label: string; days: number | null }
const REPORT_PERIODS: ReportPeriod[] = [
  { key: 'all', label: 'Gesamter Zeitraum', days: null },
  { key: 'ytd', label: 'Aktuelles Jahr (YTD)', days: null },  // Sonderfall: seit 1.1.
  { key: '30', label: '30 Tage', days: 30 },
  { key: '90', label: '90 Tage', days: 90 },
  { key: '365', label: '1 Jahr', days: 365 },
  { key: '1095', label: '3 Jahre', days: 1095 },
];

/* Performance-Kennzahlen mit Berichtszeitraum (PP addPerformanceColumns).
   menuLabel = Submenü-Titel; optionLabel(periodLabel) = Spaltenkopf je Periode;
   field = Feld in perfByPeriod; fmt = 'eur' | 'pct'. */
interface PeriodMetric {
  id: string;            // Basis-ID (Spalte = `${id}_${periodKey}`)
  menuLabel: string;     // Submenü-Titel im Menü
  optionLabel: (periodLabel: string) => string; // Spaltenkopf
  field: keyof DepotPosition['perfByPeriod'][string];
  fmt: 'eur' | 'pct';
}
const PERF_METRICS: PeriodMetric[] = [
  { id: 'ttwror',        menuLabel: 'TTWROR',                 optionLabel: p => `TTWROR ${p}`,        field: 'ttwror',          fmt: 'pct' },
  { id: 'ttwrorPa',      menuLabel: 'TTWROR p.a.',            optionLabel: p => `TTWROR p.a. ${p}`,   field: 'ttwrorPa',        fmt: 'pct' },
  { id: 'izf',           menuLabel: 'Interner Zinsfuß',       optionLabel: p => `IZF ${p}`,           field: 'izf',             fmt: 'pct' },
  { id: 'kursgewinnFifo',    menuLabel: 'Kursgewinn (FIFO, aktueller Bestand)',     optionLabel: p => `Kursgewinn (FIFO) ${p}`,   field: 'kursgewinnFifo',    fmt: 'eur' },
  { id: 'kursgewinnFifoPct', menuLabel: 'Kursgewinn % (FIFO, aktueller Bestand)',   optionLabel: p => `Kursgewinn % (FIFO) ${p}`, field: 'kursgewinnFifoPct', fmt: 'pct' },
  { id: 'kursgewinnGld',     menuLabel: 'Kursgewinn (GLD, aktueller Bestand)',      optionLabel: p => `Kursgewinn (GLD) ${p}`,    field: 'kursgewinnGld',     fmt: 'eur' },
  { id: 'kursgewinnGldPct',  menuLabel: 'Kursgewinn % (GLD, aktueller Bestand)',    optionLabel: p => `Kursgewinn (GLD) % ${p}`,  field: 'kursgewinnGldPct',  fmt: 'pct' },
  { id: 'delta',         menuLabel: 'Absolute Performance',   optionLabel: p => `Abs.Perf. ${p}`,     field: 'delta',           fmt: 'eur' },
  { id: 'deltaPct',      menuLabel: 'Absolute Performance %',  optionLabel: p => `Abs.Perf. % ${p}`,   field: 'deltaPct',        fmt: 'pct' },
];
/* Dividenden-Kennzahlen mit Berichtszeitraum (PP addDividendColumns). */
const DIV_METRICS: PeriodMetric[] = [
  { id: 'divSumme', menuLabel: 'Summe Dividenden', optionLabel: p => `∑Div ${p}`,       field: 'divSumme', fmt: 'eur' },
  { id: 'divFifo',  menuLabel: 'Div%',             optionLabel: p => `Div% ${p}`,       field: 'divFifo',  fmt: 'pct' },
  { id: 'divGld',   menuLabel: 'Div% (GLD)',       optionLabel: p => `Div% (GLD) ${p}`, field: 'divGld',   fmt: 'pct' },
];

/* Kurshistorie-basierte Kennzahlen — PP SimpleMovingAverage / AllTimeHigh / QuoteRange.
   SMA pro Periode, ATH und Kursspanne pro Reporting-Periode. */
function computeKursKennzahlen(wp: Wertpapier | undefined, periods: ReportPeriod[]): {
  abstandSma: Record<number, number>;
  abstandAth: Record<string, number>;
  kursspanne: Record<string, { tief: number; hoch: number; pos: number }>;
} {
  const abstandSma: Record<number, number> = {};
  const abstandAth: Record<string, number> = {};
  const kursspanne: Record<string, { tief: number; hoch: number; pos: number }> = {};
  if (!wp) return { abstandSma, abstandAth, kursspanne };
  const hist = wp.kursHistorie ?? [];
  const last = wp.letzterKurs ?? hist.at(-1)?.kurs ?? 0;
  if (last <= 0 || hist.length === 0) return { abstandSma, abstandAth, kursspanne };

  // SMA je Periode: Mittel der letzten N Kurse (PP SimpleMovingAverage)
  for (const N of SMA_PERIODS) {
    if (hist.length < N) continue;
    const window = hist.slice(-N);
    const sma = window.reduce((s, h) => s + h.kurs, 0) / window.length;
    abstandSma[N] = sma > 0 ? (last / sma - 1) * 100 : 0;
  }

  // ATH + Kursspanne je Reporting-Periode
  const now = Date.now();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  for (const per of periods) {
    let cutoff: number;
    if (per.key === 'all') cutoff = -Infinity;
    else if (per.key === 'ytd') cutoff = yearStart;
    else cutoff = now - (per.days ?? 0) * 86400000;
    const range = hist.filter(h => h.datum.getTime() >= cutoff);
    if (range.length === 0) continue;
    let tief = last, hoch = last;
    for (const h of range) { if (h.kurs < tief) tief = h.kurs; if (h.kurs > hoch) hoch = h.kurs; }
    abstandAth[per.key] = hoch > 0 ? ((last - hoch) / hoch) * 100 : 0;
    kursspanne[per.key] = { tief, hoch, pos: hoch > tief ? (last - tief) / (hoch - tief) : 0.5 };
  }

  return { abstandSma, abstandAth, kursspanne };
}

function computeDepotPositions(
  depotName: string,
  transaktionen: Transaktion[],
  wertpapiere: Record<string, Wertpapier>,
  periods: ReportPeriod[],
  referenzkontoName?: string,
): DepotPosition[] {
  const depotTxs = transaktionen.filter(tx =>
    tx.depotName === depotName && (SHARES_ADD.has(tx.typ) || SHARES_SUB.has(tx.typ))
  );

  // Dividenden pro Wertpapier (account-transaction dividende/ausschuettung).
  // Zuordnung über die ISIN (NICHT über PPs Security-Objektidentität → siehe
  // Hinweis in der UI). Eingegrenzt auf das REFERENZKONTO dieses Depots, damit
  // dieselbe Dividende nicht mehreren Depots mit gleicher ISIN doppelt
  // zugerechnet wird. Ohne gesetztes Referenzkonto: alle Dividenden der ISIN.
  // Zwei Sichten auf Dividenden (PP unterscheidet sie):
  // - divByKey: BRUTTO-Summe (getGrossValue) → für die ∑Div-/Div%-Spalten
  //   (PP DividendCalculation summiert getGrossValue()).
  // - divTxByKey: NETTO-Cashflows → für Delta/Abs.Perf. und IZF
  //   (PP DeltaCalculation.visit(DividendPayment) nutzt getValue() = netto).
  const divByKey = new Map<string, number>();
  const divTxByKey = new Map<string, { datum: Date; netto: number; brutto: number }[]>();
  for (const tx of transaktionen) {
    if (tx.typ !== 'dividende' && tx.typ !== 'ausschuettung') continue;
    if (referenzkontoName && tx.kontoName && tx.kontoName !== referenzkontoName) continue;
    const key = tx.isin || tx.wertpapierName;
    if (!key) continue;
    const brutto = tx.betrag + (tx.steuern ?? 0) + (tx.gebuehren ?? 0);
    divByKey.set(key, (divByKey.get(key) ?? 0) + brutto);
    if (!divTxByKey.has(key)) divTxByKey.set(key, []);
    divTxByKey.get(key)!.push({ datum: tx.datum, netto: tx.betrag, brutto });
  }

  const grouped = new Map<string, Transaktion[]>();
  for (const tx of depotTxs) {
    const key = tx.isin || tx.wertpapierName;
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(tx);
  }

  const positions: DepotPosition[] = [];

  for (const [wpKey, txs] of grouped) {
    let shares = 0;
    // FIFO-Posten: je Posten Brutto- und Netto-Kaufbetrag (PP CostCalculation)
    const fifo: { stueck: number; brutto: number; netto: number }[] = [];
    // GLD (Moving Average): laufende kumulierte Kosten + Stück (PP movingRelativeCost)
    let gldBrutto = 0, gldNetto = 0, gldShares = 0;
    // Delta (Absolute Performance) — PP DeltaCalculation
    let deltaAcc = 0;   // +Verkäufe −Käufe (Marktwert kommt am Ende dazu)
    let costBasis = 0;  // Summe Kaufkosten (für deltaPct)

    const sorted = [...txs].sort((a, b) => a.datum.getTime() - b.datum.getTime());
    for (const tx of sorted) {
      const brutto = tx.betrag + tx.gebuehren + tx.steuern; // INCLUDED
      const netto = tx.betrag;                              // NOT_INCLUDED (nur Wertpapierwert)
      if (SHARES_ADD.has(tx.typ)) {
        shares += tx.stueck;
        fifo.push({ stueck: tx.stueck, brutto, netto });
        // GLD
        gldBrutto += brutto; gldNetto += netto; gldShares += tx.stueck;
        // Delta
        deltaAcc -= brutto; costBasis += brutto;
      } else if (SHARES_SUB.has(tx.typ)) {
        shares -= tx.stueck;
        deltaAcc += brutto;
        // FIFO abbauen (ältester zuerst)
        let remaining = tx.stueck;
        while (remaining > 0.0001 && fifo.length > 0) {
          const posten = fifo[0];
          const take = Math.min(remaining, posten.stueck);
          const anteil = take / posten.stueck;
          posten.brutto -= posten.brutto * anteil;
          posten.netto -= posten.netto * anteil;
          posten.stueck -= take;
          remaining -= take;
          if (posten.stueck <= 0.0001) fifo.shift();
        }
        // GLD proportional reduzieren
        if (gldShares > 0.0001) {
          const rest = Math.max(0, gldShares - tx.stueck);
          const f = rest / gldShares;
          gldBrutto *= f; gldNetto *= f; gldShares = rest;
        }
      }
    }

    if (Math.abs(shares) < 0.0001) continue;

    const wp = wertpapiere[wpKey];
    const kurs = wp?.letzterKurs ?? wp?.kursHistorie?.at(-1)?.kurs ?? 0;
    const marktwert = shares * kurs;

    // Einstandspreis (gesamt)
    const investiertFifoBrutto = fifo.reduce((s, p) => s + p.brutto, 0);
    const investiertFifoNetto = fifo.reduce((s, p) => s + p.netto, 0);
    const investiertGldBrutto = gldBrutto;
    const investiertGldNetto = gldNetto;

    // Einstandskurs (pro Stück) — PP: FIFO netto ist Default-Einstandskurs
    const einstandskurs = shares > 0 ? investiertFifoNetto / shares : 0;
    const einstandskursFifoBrutto = shares > 0 ? investiertFifoBrutto / shares : 0;
    const einstandskursGldNetto = shares > 0 ? investiertGldNetto / shares : 0;
    const einstandskursGldBrutto = shares > 0 ? investiertGldBrutto / shares : 0;

    // Gewinn/Verlust (Default = FIFO brutto) + Kursgewinn-Varianten
    const gewinn = marktwert - investiertFifoBrutto;
    const gewinnProzent = investiertFifoBrutto > 0 ? (gewinn / investiertFifoBrutto) * 100 : 0;
    const kursgewinnFifo = marktwert - investiertFifoBrutto;
    const kursgewinnFifoPct = investiertFifoBrutto > 0 ? (marktwert / investiertFifoBrutto - 1) * 100 : 0;
    const kursgewinnGld = marktwert - investiertGldBrutto;
    const kursgewinnGldPct = investiertGldBrutto > 0 ? (marktwert / investiertGldBrutto - 1) * 100 : 0;

    // Dividenden (Gesamtzeitraum): BRUTTO für ∑Div/Div%-Anzeige (PP getGrossValue)
    const dividendenSumme = divByKey.get(wpKey) ?? 0;
    const divRenditeFifo = investiertFifoBrutto > 0 ? (dividendenSumme / investiertFifoBrutto) * 100 : 0;
    const divRenditeGld = investiertGldBrutto > 0 ? (dividendenSumme / investiertGldBrutto) * 100 : 0;
    // NETTO-Summe (für Delta/Abs.Perf. — PP DeltaCalculation nutzt getValue())
    const dividendenNetto = (divTxByKey.get(wpKey) ?? []).reduce((s, d) => s + d.netto, 0);

    // Absolute Performance (Delta): +Marktwert +Dividenden(netto), Käufe/Verkäufe oben verrechnet
    const delta = deltaAcc + marktwert + dividendenNetto;
    const deltaPct = costBasis > 0 ? (delta / costBasis) * 100 : 0;

    // Kurshistorie-Kennzahlen (SMA/ATH/Kursspanne)
    const kk = computeKursKennzahlen(wp, periods);

    // IZF (Cashflows: Käufe negativ, Verkäufe + Dividenden positiv, Endwert positiv)
    const stichtag = wp?.letzterKursDatum ?? new Date();
    const allDivTx = divTxByKey.get(wpKey) ?? [];
    const buildCashflows = (cutoff: number): { datum: Date; betrag: number }[] => {
      const cf: { datum: Date; betrag: number }[] = [];
      for (const tx of sorted) {
        if (tx.datum.getTime() < cutoff) continue;
        const brutto = tx.betrag + tx.gebuehren + tx.steuern;
        if (SHARES_ADD.has(tx.typ)) cf.push({ datum: tx.datum, betrag: -brutto });
        else if (SHARES_SUB.has(tx.typ)) cf.push({ datum: tx.datum, betrag: brutto });
      }
      for (const d of allDivTx) if (d.datum.getTime() >= cutoff) cf.push({ datum: d.datum, betrag: d.netto });
      cf.sort((a, b) => a.datum.getTime() - b.datum.getTime());
      cf.push({ datum: stichtag, betrag: marktwert });
      return cf;
    };
    const izf = computeIrr(buildCashflows(-Infinity));
    const ttwror = computeTtwror(sorted, wp);

    // ── Periodenabhängige Kennzahlen (PP ReportingPeriodColumnOptions) ──
    // Pro Berichtszeitraum: TTWROR (Kursverkettung im Fenster), TTWROR p.a.,
    // IZF (Cashflows ab cutoff), Delta (Cashflows im Fenster), Dividenden im
    // Fenster. Kursgewinn bezieht sich in PP auf den aktuellen Bestand und die
    // Gesamtkosten → periodenunabhängig (in allen Perioden gleich).
    const now = Date.now();
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    const perfByPeriod: DepotPosition['perfByPeriod'] = {};
    for (const per of periods) {
      let cutoff: number;
      if (per.key === 'all') cutoff = -Infinity;
      else if (per.key === 'ytd') cutoff = yearStart;
      else cutoff = now - (per.days ?? 0) * 86400000;

      // TTWROR im Fenster (Kursverkettung ab cutoff)
      const hist = (wp?.kursHistorie ?? []).filter(h => h.datum.getTime() >= cutoff);
      let ttw = 0;
      if (hist.length >= 2) {
        let acc = 1;
        for (let i = 1; i < hist.length; i++) {
          const prev = hist[i - 1].kurs, cur = hist[i].kurs;
          if (prev > 0) acc *= cur / prev;
        }
        ttw = (acc - 1) * 100;
      } else {
        ttw = per.key === 'all' ? ttwror : 0;
      }
      // p.a.: über Fensterlänge annualisieren
      const spanMs = per.key === 'all'
        ? (hist.length >= 2 ? hist[hist.length - 1].datum.getTime() - hist[0].datum.getTime() : 0)
        : now - cutoff;
      const years = spanMs > 0 ? spanMs / (365 * 86400000) : 0;
      const ttwPa = years > 0 ? (Math.pow(1 + ttw / 100, 1 / years) - 1) * 100 : ttw;

      // IZF im Fenster
      const izfPer = computeIrr(buildCashflows(cutoff));

      // Delta im Fenster: Cashflows (Käufe −, Verkäufe +) + Marktwert + Div(netto) im Fenster
      let dAcc = 0, dCost = 0, divWinNetto = 0, divWinBrutto = 0;
      for (const tx of sorted) {
        if (tx.datum.getTime() < cutoff) continue;
        const brutto = tx.betrag + tx.gebuehren + tx.steuern;
        if (SHARES_ADD.has(tx.typ)) { dAcc -= brutto; dCost += brutto; }
        else if (SHARES_SUB.has(tx.typ)) dAcc += brutto;
      }
      for (const d of allDivTx) if (d.datum.getTime() >= cutoff) { divWinNetto += d.netto; divWinBrutto += d.brutto; }
      const deltaPer = per.key === 'all' ? delta : dAcc + marktwert + divWinNetto;
      const deltaPctPer = per.key === 'all'
        ? deltaPct
        : (dCost > 0 ? (deltaPer / dCost) * 100 : 0);

      // Dividenden im Fenster: BRUTTO für ∑Div/Div%-Anzeige (PP getGrossValue)
      const divSum = per.key === 'all' ? dividendenSumme : divWinBrutto;
      const divF = investiertFifoBrutto > 0 ? (divSum / investiertFifoBrutto) * 100 : 0;
      const divG = investiertGldBrutto > 0 ? (divSum / investiertGldBrutto) * 100 : 0;

      perfByPeriod[per.key] = {
        ttwror: ttw, ttwrorPa: ttwPa, izf: izfPer,
        kursgewinnFifo, kursgewinnFifoPct, kursgewinnGld, kursgewinnGldPct,
        delta: deltaPer, deltaPct: deltaPctPer,
        divSumme: divSum, divFifo: divF, divGld: divG,
      };
    }

    positions.push({
      wpKey, name: wp?.name ?? wpKey,
      isin: wp?.isin ?? '',
      symbol: wp?.symbol ?? '',
      wkn: wp?.wkn ?? '',
      waehrung: wp?.waehrung ?? 'EUR',
      kursdatum: wp?.letzterKursDatum,
      notiz: wp?.notiz ?? '',
      typ: wp?.typ ?? 'Sonstige', typFarbe: wp?.typFarbe,
      shares, kurs, marktwert,
      investiert: investiertFifoBrutto,
      investiertFifoNetto, investiertGldBrutto, investiertGldNetto,
      einstandskurs, einstandskursFifoBrutto, einstandskursGldNetto, einstandskursGldBrutto,
      gewinn, gewinnProzent,
      kursgewinnFifo, kursgewinnFifoPct, kursgewinnGld, kursgewinnGldPct,
      dividendenSumme, divRenditeFifo, divRenditeGld,
      delta, deltaPct,
      abstandSma: kk.abstandSma, abstandAth: kk.abstandAth, kursspanne: kk.kursspanne,
      izf, ttwror, perfByPeriod,
    });
  }

  return positions.sort((a, b) => a.name.localeCompare(b.name));
}

/* ── Umsätze-Untertabelle — PP TransactionsViewer.java Zeilen 251-486 ──
   Datum(80) | Typ(80) | Wertpapier(250) | ISIN(H) | Symbol(H) | WKN(H) |
   Stück(80,R) | Kurs(80,R) | Betrag(80,R) | Gebühren(80,R) | Steuern(80,R) |
   Gesamtpreis(80,R) | Konto(120) | Gegenkonto(120) | Notiz(200) | Quelle(200) */
interface DepotTxRow {
  tx: Transaktion;
  symbol: string;
  wkn: string;
}

// PP TransactionsViewer: Verkäufe/Auslieferungen rot, Käufe/Einlieferungen grün
function depotTxColor(tx: Transaktion): string {
  return (tx.typ === 'verkauf' || tx.typ === 'umbuchung_aus') ? 'var(--pp-red-text)' : 'var(--pp-green-text)';
}

// Gesamtpreis (ColumnNetValue): Kauf brutto + Gebühren + Steuern, Verkauf brutto − Gebühren − Steuern
function depotTxNetto(tx: Transaktion): number {
  return (tx.typ === 'kauf' || tx.typ === 'umbuchung_ein')
    ? tx.betrag + tx.gebuehren + tx.steuern
    : tx.betrag - tx.gebuehren - tx.steuern;
}

function buildDepotTxColumns(): PPColumn<DepotTxRow>[] {
  return [
    {
      id: 'datum', label: 'Datum', width: 80,
      render: r => <span className="mono" style={{ color: depotTxColor(r.tx) }}>{datumKurz(r.tx.datum)}</span>,
      sortFn: (a, b) => a.tx.datum.getTime() - b.tx.datum.getTime(),
    },
    {
      id: 'typ', label: 'Typ', width: 80,
      render: r => <span style={{ color: depotTxColor(r.tx) }}>{TX_LABELS[r.tx.typ] ?? r.tx.typ}</span>,
      sortFn: (a, b) => (TX_LABELS[a.tx.typ] ?? '').localeCompare(TX_LABELS[b.tx.typ] ?? ''),
    },
    {
      id: 'wertpapier', label: 'Wertpapier', width: 250,
      render: r => <span style={{ color: depotTxColor(r.tx) }}>{r.tx.wertpapierName}</span>,
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
      render: r => r.tx.stueck > 0 ? <span className="mono" style={{ color: depotTxColor(r.tx) }}>{stueck(r.tx.stueck)}</span> : '',
      sortFn: (a, b) => a.tx.stueck - b.tx.stueck,
    },
    {
      id: 'kurs', label: 'Kurs', width: 80, align: 'right',
      render: r => {
        const k = r.tx.kurs > 0 ? r.tx.kurs : (r.tx.stueck > 0 ? r.tx.betrag / r.tx.stueck : 0);
        return k > 0 ? <span className="mono" style={{ color: depotTxColor(r.tx) }}>{euro(k)}</span> : '';
      },
      sortFn: (a, b) => a.tx.kurs - b.tx.kurs,
    },
    {
      id: 'betrag', label: 'Betrag', width: 80, align: 'right',
      render: r => <span className="mono" style={{ color: depotTxColor(r.tx) }}>{euro(r.tx.betrag)}</span>,
      sortFn: (a, b) => a.tx.betrag - b.tx.betrag,
    },
    {
      id: 'gebuehren', label: 'Gebühren', width: 80, align: 'right',
      render: r => r.tx.gebuehren > 0 ? <span className="mono">{euro(r.tx.gebuehren)}</span> : '',
      sortFn: (a, b) => a.tx.gebuehren - b.tx.gebuehren,
    },
    {
      id: 'steuern', label: 'Steuern', width: 80, align: 'right',
      render: r => r.tx.steuern > 0 ? <span className="mono">{euro(r.tx.steuern)}</span> : '',
      sortFn: (a, b) => a.tx.steuern - b.tx.steuern,
    },
    {
      id: 'gesamtpreis', label: 'Gesamtpreis', width: 80, align: 'right',
      render: r => <span className="mono" style={{ color: depotTxColor(r.tx) }}>{euro(depotTxNetto(r.tx))}</span>,
      sortFn: (a, b) => depotTxNetto(a.tx) - depotTxNetto(b.tx),
    },
    {
      id: 'konto', label: 'Konto', width: 120,
      render: r => <span style={{ color: 'var(--pp-text-muted)' }}>{r.tx.kontoName ?? ''}</span>,
      sortFn: (a, b) => (a.tx.kontoName ?? '').localeCompare(b.tx.kontoName ?? ''),
    },
    {
      id: 'gegenkonto', label: 'Gegenkonto', width: 120,
      render: r => <span style={{ color: 'var(--pp-text-muted)' }}>{r.tx.gegenkontoName ?? ''}</span>,
      sortFn: (a, b) => (a.tx.gegenkontoName ?? '').localeCompare(b.tx.gegenkontoName ?? ''),
    },
    {
      id: 'notiz', label: 'Notiz', width: 200,
      render: r => r.tx.notiz ?? '',
      sortFn: (a, b) => (a.tx.notiz ?? '').localeCompare(b.tx.notiz ?? ''),
    },
    {
      id: 'quelle', label: 'Quelle', width: 200,
      render: r => r.tx.quelle ?? '',
      sortFn: (a, b) => (a.tx.quelle ?? '').localeCompare(b.tx.quelle ?? ''),
    },
  ];
}

const DEPOT_TX_COLUMNS = buildDepotTxColumns();
// PP TransactionsViewer: ISIN, Symbol, WKN, Ex-Tag initial ausgeblendet
const DEPOT_TX_HIDDEN_BY_DEFAULT = new Set<string>(['isin', 'symbol', 'wkn']);

/* ── Vermögensaufstellung — PP StatementOfAssetsViewer.java Zeilen 396-614 ──
   Sichtbar: Bestand | Name | Symbol | Kurs | Marktwert | Anteil in % | Notiz
   Ausgeblendet: ISIN, WKN, Kursdatum, Einstandskurs, Einstandspreis, Gewinn / Verlust */
/* Vollständige Spaltenliste der Vermögensaufstellung — PP StatementOfAssetsViewer.
   Labels exakt aus messages_de.properties. */
/* Spaltenliste der Vermögensaufstellung — generiert aus den (editierbaren)
   Berichtszeiträumen. Reihenfolge exakt wie PP addColumn()-Aufrufe:
   Basis → Einstandskurs → Einstandspreis → Gewinn → Notiz → Performance →
   Dividenden → <Taxonomien> → Devisen → SMA → ATH → Kursspanne.
   `taxonomien`: dynamische Klassifizierungs-Spalten (eine je Taxonomie). */
function buildVermoegenColumns(periods: ReportPeriod[], taxonomien: { id: string; name: string }[]): ColumnDef[] {
  const periodCols = (metrics: PeriodMetric[]): ColumnDef[] =>
    metrics.flatMap(m => periods.map((per): ColumnDef => ({
      id: `${m.id}_${per.key}`, label: m.optionLabel(per.label), align: 'right',
    })));
  return [
    // Basis-Spalten (keine Gruppe) — PP-Reihenfolge: Bestand, Name, Symbol, ISIN, WKN, …
    { id: 'bestand', label: 'Bestand', align: 'right' },
    { id: 'name', label: 'Name' },
    { id: 'symbol', label: 'Symbol' },
    { id: 'isin', label: 'ISIN' },
    { id: 'wkn', label: 'WKN' },
    { id: 'kurs', label: 'Kurs', align: 'right' },
    { id: 'kursdatum', label: 'Kursdatum' },
    { id: 'marktwert', label: 'Marktwert', align: 'right' },
    { id: 'anteil', label: 'Anteil in %', align: 'right' },
    // Einstandskurs (Gruppe) — FIFO/GLD × Netto/Brutto
    { id: 'einstandskurs', label: 'Einstandskurs (FIFO)', align: 'right' },
    { id: 'einstandskursGld', label: 'Einstandskurs (gleitender Durchschnitt)', align: 'right' },
    { id: 'einstandskursBrutto', label: 'Einstandskurs (Brutto)', align: 'right' },
    { id: 'einstandskursGldBrutto', label: 'Einstandskurs (GLD) (brutto)', align: 'right' },
    // Einstandspreis (Gruppe)
    { id: 'einstandspreis', label: 'Einstandspreis (FIFO)', align: 'right' },
    { id: 'einstandspreisGld', label: 'Einstandspreis (gleitender Durchschnitt)', align: 'right' },
    // Gewinn/Notiz
    { id: 'gewinn', label: 'Gewinn / Verlust', align: 'right' },
    { id: 'notiz', label: 'Notiz' },
    // Performance (Gruppe) — Kennzahl × Periode
    ...periodCols(PERF_METRICS),
    // Dividenden (Gruppe) — Kennzahl × Periode
    ...periodCols(DIV_METRICS),
    // Klassifizierung (Gruppe) — je Taxonomie eine Spalte
    ...taxonomien.map((t): ColumnDef => ({ id: `tax_${t.id}`, label: t.name })),
    // Devisen (Gruppe) — 7 Einträge (PP addCurrencyColumns)
    { id: 'waehrung', label: 'Währung' },
    { id: 'wechselkurs', label: 'Wechselkurs', align: 'right' },
    { id: 'kursBasis', label: 'Kurs**', align: 'right' },
    { id: 'marktwertBasis', label: 'Marktwert**', align: 'right' },
    { id: 'einstandspreisBasis', label: 'Einstandspreis**', align: 'right' },
    { id: 'einstandskursBasis', label: 'Einstandskurs**', align: 'right' },
    { id: 'gewinnBasis', label: 'Gewinn / Verlust**', align: 'right' },
    // Abstand zu SMA (Perioden in Tagen)
    ...SMA_PERIODS.map((n): ColumnDef => ({ id: `sma${n}`, label: `Δ zu SMA${n}`, align: 'right' })),
    // Abstand vom ATH (Reporting-Perioden)
    ...periods.map((p): ColumnDef => ({ id: `ath_${p.key}`, label: `Δ ATH ${p.label} %`, align: 'right' })),
    // Kursspanne (Reporting-Perioden)
    ...periods.map((p): ColumnDef => ({ id: `kursspanne_${p.key}`, label: `Kursspanne ${p.label}`, align: 'right' })),
  ];
}
// Standardmäßig sichtbar (PP): Bestand, Name, Symbol, Kurs, Marktwert, Anteil in %, Notiz
function buildVermoegenHiddenDefault(periods: ReportPeriod[], taxonomien: { id: string }[]): string[] {
  const all = buildVermoegenColumns(periods, taxonomien).map(c => c.id);
  const visible = new Set(['bestand', 'name', 'symbol', 'kurs', 'marktwert', 'anteil', 'notiz']);
  return all.filter(id => !visible.has(id));
}

/* ── Diagramm — PP PortfolioBalancePane / PortfolioBalanceChart:
   Wertentwicklung des Depots über die Zeit. Kurs zum Stichtag nach
   PP Security.getSecurityPrice(): letzter Kurs <= Datum, vor dem ersten
   Kurs der erste verfügbare (Security.java Zeilen 533-570). ── */
function kursAmDatum(wp: Wertpapier | undefined, datum: Date): number {
  if (!wp) return 0;
  const hist = wp.kursHistorie ?? [];
  if (hist.length === 0) return wp.letzterKurs ?? 0;
  if (wp.letzterKurs && wp.letzterKursDatum && datum >= wp.letzterKursDatum
    && hist[hist.length - 1].datum <= wp.letzterKursDatum) {
    return wp.letzterKurs;
  }
  if (datum < hist[0].datum) return hist[0].kurs;
  let lo = 0, hi = hist.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (hist[mid].datum <= datum) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return hist[best].kurs;
}

function computeDepotValueSeries(
  depotName: string,
  transaktionen: Transaktion[],
  wertpapiere: Record<string, Wertpapier>,
): { datum: string; wert: number }[] {
  const txs = transaktionen
    .filter(tx => tx.depotName === depotName && (SHARES_ADD.has(tx.typ) || SHARES_SUB.has(tx.typ)))
    .sort((a, b) => a.datum.getTime() - b.datum.getTime());
  if (txs.length === 0) return [];

  // Monatsenden vom ersten Kauf bis heute
  const samples: Date[] = [];
  const start = new Date(txs[0].datum.getFullYear(), txs[0].datum.getMonth() + 1, 0);
  const today = new Date();
  for (let d = start; d < today; d = new Date(d.getFullYear(), d.getMonth() + 2, 0)) {
    samples.push(d);
  }
  samples.push(today);

  const result: { datum: string; wert: number }[] = [];
  let txIdx = 0;
  const shares = new Map<string, number>();
  for (const sample of samples) {
    while (txIdx < txs.length && txs[txIdx].datum <= sample) {
      const tx = txs[txIdx];
      const key = tx.isin || tx.wertpapierName;
      const prev = shares.get(key) ?? 0;
      shares.set(key, SHARES_ADD.has(tx.typ) ? prev + tx.stueck : prev - tx.stueck);
      txIdx++;
    }
    let wert = 0;
    for (const [key, anz] of shares) {
      if (anz <= 0.0001) continue;
      wert += anz * kursAmDatum(wertpapiere[key], sample);
    }
    result.push({ datum: datumKurz(sample), wert });
  }
  return result;
}

// PP PortfolioListView: FILTER_INACTIVE_PORTFOLIOS = "filter-retired-portfolios"
const FILTER_INACTIVE_PORTFOLIOS = 'filter-retired-portfolios';

export default function DepotsView() {
  const { state, addTransaktionen, addDepot, deleteDepot, renameDepot, setDepotReferenzkonto, toggleDepotAktiv, setDepotFarbe, addBerichtszeitraum } = usePortfolio();
  const [selected, setSelected] = useState<string | null>(null);
  // PP PortfolioListView: Inline-Editing per Doppelklick (Name / Referenzkonto)
  const [editCell, setEditCell] = useState<{ key: string; field: 'name' | 'referenzkonto' } | null>(null);
  const [detailTab, setDetailTab] = useState('vermoegensuebersicht');
  // PP: isFiltered = inaktive Depots ausblenden; Default aus PreferenceStore
  const [isFiltered, setIsFiltered] = useState(() => {
    try { return localStorage.getItem(FILTER_INACTIVE_PORTFOLIOS) === 'true'; } catch { return false; }
  });
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; depotKey: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [colMenuPos, setColMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<(DialogState & { depot?: string }) | null>(null);
  // Umsätze-Pane: Suchfeld, Typ-Filter (PP TransactionFilterDropDown), Spaltenmenü
  const [depotSearch, setDepotSearch] = useState('');
  const [depotTxFilter, setDepotTxFilter] = useState(() => {
    try { return localStorage.getItem('depots-tx-filter') ?? 'NONE'; } catch { return 'NONE'; }
  });
  const [depotTxColMenuPos, setDepotTxColMenuPos] = useState<{ x: number; y: number } | null>(null);
  // PP: ZENTRALE Berichtszeiträume aus dem globalen State
  // (owner.getPart().getReportingPeriods()) — von ALLEN Tabs/Tabellen geteilt.
  const reportPeriods = state.berichtszeitraeume;
  // Echte Taxonomien des Clients → dynamische Klassifizierungs-Spalten/Radios (PP)
  const taxonomien = useMemo(
    () => state.taxonomien.map(t => ({ id: t.id, name: t.name })),
    [state.taxonomien]
  );
  // Zuordnung Wertpapier → Klassifizierungsname je Taxonomie (für tax_<id>-Spalten
  // und die Gruppierung). Durchläuft die Klassifizierungs-Hierarchie rekursiv.
  const klassByTax = useMemo(() => {
    const m = new Map<string, Map<string, string>>(); // taxId → (wpKey → klassName)
    for (const t of state.taxonomien) {
      const wpToKlass = new Map<string, string>();
      const walk = (k: { name: string; kinder: typeof k[]; zuweisungen: { wertpapierKey: string }[] }) => {
        for (const z of k.zuweisungen) if (!wpToKlass.has(z.wertpapierKey)) wpToKlass.set(z.wertpapierKey, k.name);
        for (const child of k.kinder) walk(child);
      };
      // Wurzel selbst nicht als Klasse zählen, nur ihre Kinder
      for (const child of t.wurzel.kinder) walk(child);
      m.set(t.id, wpToKlass);
    }
    return m;
  }, [state.taxonomien]);
  // Vermögensaufstellung: Spalten dynamisch aus Berichtszeiträumen + Taxonomien
  const vermoegenColumns = useMemo(
    () => buildVermoegenColumns(reportPeriods, taxonomien),
    [reportPeriods, taxonomien]
  );
  const vermoegenHiddenDefault = useMemo(
    () => buildVermoegenHiddenDefault(reportPeriods, taxonomien),
    [reportPeriods, taxonomien]
  );
  // Spaltenkonfiguration (Reihenfolge/Breite/Sortierung/Sichtbarkeit) als State
  const vermoegenCfg = useColumnConfig('depots-vermoegen', vermoegenColumns, vermoegenHiddenDefault);
  const [vermoegenMenuOpen, setVermoegenMenuOpen] = useState(false);
  // PP "Neu...": vollständiger Berichtszeitraum-Dialog (1:1 ReportingPeriodDialog).
  // neuPeriodeTarget = Spalten-Präfix des Submenüs, aus dem "Neu..." geöffnet wurde
  // (z.B. 'ttwror', 'ath', 'kursspanne') → genau diese neue Spalte wird sichtbar.
  const [neuPeriodeDialog, setNeuPeriodeDialog] = useState<string | null>(null);
  // Legt einen über den Dialog gewählten Berichtszeitraum als neue Spaltenperiode an
  // und macht die zugehörige Spalte direkt sichtbar (wie PP policy.create).
  const addReportingPeriod = useCallback((r: ReportingPeriodResult, target: string | null) => {
    // cutoff in Tagen ab heute (für fixe Intervalle aus start abgeleitet)
    const days = r.days != null ? r.days : Math.max(0, Math.round((Date.now() - r.start.getTime()) / 86400000));
    addBerichtszeitraum({ key: r.key, label: r.label, days });
    // neue Spalte des auslösenden Submenüs sichtbar machen (nach dem Render der neuen Spalte)
    if (target) {
      const colId = `${target}_${r.key}`;
      setTimeout(() => { if (vermoegenCfg.hidden.has(colId)) vermoegenCfg.toggleHidden(colId); }, 0);
    }
  }, [vermoegenCfg, addBerichtszeitraum]);
  // PP "Darstellung": Summenzeile oben/unten (LabelTotalsAtTheTop/Bottom)
  const [summeOben, setSummeOben] = useState(() => { try { return localStorage.getItem('depots-vermoegen-summe-oben') === 'true'; } catch { return false; } });
  const [summeUnten, setSummeUnten] = useState(() => { try { return localStorage.getItem('depots-vermoegen-summe-unten') !== 'false'; } catch { return true; } });
  // PP "Klassifizierungen": Gruppierung der Positionen ((keine) | <Taxonomie-ID>)
  const [klassifizierung, setKlassifizierung] = useState(() => {
    try { return localStorage.getItem('depots-vermoegen-klass') ?? 'keine'; } catch { return 'keine'; }
  });

  // PP SecurityContextMenu Zeile 58: kein Menü ohne Wertpapiere
  const hasSecurities = Object.keys(state.wertpapiere).length > 0;
  // PP SecurityContextMenu Zeile 137: getActivePortfolios().size() > 1
  const activeDepotCount = useMemo(() =>
    Object.values(state.depots).filter(d => !d.istInaktiv).length, [state.depots]);

  const depotPositionsMap = useMemo(() => {
    const map = new Map<string, DepotPosition[]>();
    for (const d of Object.values(state.depots)) {
      map.set(d.name, computeDepotPositions(d.name, state.transaktionen, state.wertpapiere, reportPeriods, d.referenzkontoName));
    }
    return map;
  }, [state.depots, state.transaktionen, state.wertpapiere, reportPeriods]);

  const depotVolumenMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [name, positions] of depotPositionsMap) {
      map.set(name, positions.reduce((s, p) => s + p.marktwert, 0));
    }
    return map;
  }, [depotPositionsMap]);

  const depots = useMemo((): DepotRow[] => {
    const stateDepots = Object.values(state.depots);
    if (stateDepots.length > 0) {
      let list = stateDepots.map(d => {
        const txs = d.transaktionen;
        const letzte = txs.length > 0 ? txs.reduce((l, t) => t.datum > l ? t.datum : l, txs[0].datum) : undefined;
        const refKonto = d.referenzkontoName ? state.konten[d.referenzkontoName] : null;
        return {
          key: d.name, name: d.name,
          referenzkonto: d.referenzkontoName ?? '',
          volumen: depotVolumenMap.get(d.name) ?? 0,
          referenzkontoSaldo: refKonto?.saldo ?? 0,
          letzteTransaktion: letzte,
          notiz: d.notiz ?? '', istInaktiv: !!d.istInaktiv,
          farbe: d.farbe,
        };
      });
      // PP setInput(): isFiltered ? getActivePortfolios() : getPortfolios()
      if (isFiltered) list = list.filter(d => !d.istInaktiv);
      return list;
    }
    const totalVol = [...depotVolumenMap.values()].reduce((s, v) => s + v, 0);
    return [{ key: 'Depot', name: 'Depot', referenzkonto: 'Verrechnungskonto', volumen: totalVol, referenzkontoSaldo: 0, notiz: '', istInaktiv: false }];
  }, [state.depots, state.konten, depotVolumenMap, isFiltered]);

  // Spalten der Depot-Tabelle inkl. Inline-Editing (Name / Referenzkonto)
  const kontoNamen = useMemo(() => Object.keys(state.konten), [state.konten]);
  // Beim Umbenennen wandert die aktuelle Auswahl mit (Key = Depotname)
  const handleRenameDepot = useCallback((name: string, neuerName: string) => {
    const trimmed = neuerName.trim();
    renameDepot(name, trimmed);
    if (trimmed && trimmed !== name) setSelected(prev => (prev === name ? trimmed : prev));
  }, [renameDepot]);
  const depotColumns = useMemo(() => buildColumns({
    editCell, setEditCell, kontoNamen,
    onRename: handleRenameDepot, onSetReferenzkonto: setDepotReferenzkonto,
  }), [editCell, kontoNamen, handleRenameDepot, setDepotReferenzkonto]);

  const onRowContextMenu = useCallback((e: React.MouseEvent, d: DepotRow) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, depotKey: d.key });
  }, []);

  // Stabile Props, damit React.memo der PPTables greift
  const masterRowKey = useCallback((d: DepotRow) => d.key, []);
  const depotTxRowKey = useCallback((r: DepotTxRow) => r.tx.id, []);
  const closeColMenu = useCallback(() => setColMenuPos(null), []);
  const closeDepotTxColMenu = useCallback(() => setDepotTxColMenuPos(null), []);

  /* ── Master Panel ── */
  const masterPanel = (
    <div className="flex flex-col h-full">
      <div className="pp-toolbar">
        <span className="pp-toolbar-title">Depots</span>
        <div style={{ flex: 1 }} />
        {/* PP addNewButton */}
        <div className="relative">
          <button type="button" className="pp-toolbar-btn" title="Depot oder Buchung anlegen" onClick={() => setAddOpen(!addOpen)}>
            <Plus size={14} />
          </button>
          {addOpen && (
            <AddPortfolioDropdown
              depotCount={activeDepotCount}
              hasSecurities={hasSecurities}
              onNewDepot={() => { const name = addDepot(); setSelected(name); }}
              onAction={a => setDialog({ ...a, depot: selected ?? depots[0]?.key })}
              onClose={() => setAddOpen(false)}
            />
          )}
        </div>
        {/* PP addFilterButton */}
        <button type="button" className="pp-toolbar-btn" title="Inaktive Depots ausblenden"
          style={{ color: isFiltered ? 'var(--pp-accent)' : undefined }}
          onClick={() => {
            const next = !isFiltered;
            setIsFiltered(next);
            try { localStorage.setItem(FILTER_INACTIVE_PORTFOLIOS, String(next)); } catch { /* */ }
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
        columns={depotColumns} data={depots} rowKey={masterRowKey}
        selectedKey={selected ?? depots[0]?.key} onSelect={setSelected}
        storageKey="depots" hiddenByDefault={HIDDEN_BY_DEFAULT}
        onRowContextMenu={onRowContextMenu}
        columnMenuPos={colMenuPos}
        onColumnMenuClose={closeColMenu}
        menuExtra={() => (
          <FarbenMenuFooter
            label="Depot-Farben anpassen"
            items={depots.map(d => ({ name: d.name, farbe: d.farbe }))}
            onSetFarbe={setDepotFarbe}
          />
        )}
      />
    </div>
  );

  const selectedDepot = selected ?? depots[0]?.key;
  const selectedDepotFarbe = state.depots[selectedDepot]?.farbe;
  const selectedPositions = depotPositionsMap.get(selectedDepot) ?? [];
  const selectedVolumen = depotVolumenMap.get(selectedDepot) ?? 0;

  const depotTxRows = useMemo((): DepotTxRow[] => {
    const byIsin = new Map<string, { symbol?: string; wkn?: string }>();
    const byName = new Map<string, { symbol?: string; wkn?: string }>();
    for (const wp of Object.values(state.wertpapiere)) {
      if (wp.isin) byIsin.set(wp.isin, wp);
      byName.set(wp.name, wp);
    }
    let list = state.transaktionen
      .filter(tx => tx.depotName === selectedDepot &&
        (tx.typ === 'kauf' || tx.typ === 'verkauf' || tx.typ === 'umbuchung_ein' || tx.typ === 'umbuchung_aus'));
    const crit = getTransactionFilter(depotTxFilter);
    list = list.filter(tx => crit.matches(tx));
    if (depotSearch) {
      const q = depotSearch.toLowerCase();
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
      return { tx, symbol: wp?.symbol ?? '', wkn: wp?.wkn ?? '' };
    });
  }, [state.transaktionen, state.wertpapiere, selectedDepot, depotSearch, depotTxFilter]);

  const pieData = useMemo(() =>
    selectedPositions.map(p => ({ name: p.name, value: p.marktwert, color: p.typFarbe || getColor(p.wpKey) })),
    [selectedPositions]
  );

  // PP PortfolioBalanceChart: Wertentwicklung des selektierten Depots
  const balanceSeries = useMemo(() =>
    selectedDepot ? computeDepotValueSeries(selectedDepot, state.transaktionen, state.wertpapiere) : [],
    [selectedDepot, state.transaktionen, state.wertpapiere]
  );

  // PP MenuExportData = "Daten exportieren"
  const exportTxCSV = useCallback(() => {
    const header = 'Datum;Typ;Wertpapier;ISIN;Symbol;WKN;Stück;Kurs;Betrag;Gebühren;Steuern;Gesamtpreis;Konto;Gegenkonto;Notiz;Quelle';
    const rows = depotTxRows.map(r => [
      datumKurz(r.tx.datum), TX_LABELS[r.tx.typ] ?? r.tx.typ, r.tx.wertpapierName,
      r.tx.isin, r.symbol, r.wkn, r.tx.stueck, r.tx.kurs,
      r.tx.betrag.toFixed(2), r.tx.gebuehren.toFixed(2), r.tx.steuern.toFixed(2),
      depotTxNetto(r.tx).toFixed(2), r.tx.kontoName || '', r.tx.gegenkontoName || '',
      r.tx.notiz ?? '', r.tx.quelle ?? '',
    ].join(';'));
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${selectedDepot || 'depot'}_umsaetze.csv`;
    a.click();
  }, [depotTxRows, selectedDepot]);

  const exportVermoegenCSV = useCallback(() => {
    const header = vermoegenColumns.map(c => c.label).join(';');
    const rows = selectedPositions.map(p => {
      const anteil = selectedVolumen > 0 ? (p.marktwert / selectedVolumen) * 100 : 0;
      return [
        p.shares, p.name, p.isin, p.symbol, p.wkn, p.kurs.toFixed(2),
        p.kursdatum ? datumKurz(p.kursdatum) : '', p.marktwert.toFixed(2), anteil.toFixed(2),
        p.einstandskurs.toFixed(2), p.investiert.toFixed(2), p.gewinn.toFixed(2), p.notiz,
      ].join(';');
    });
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${selectedDepot || 'depot'}_vermoegensaufstellung.csv`;
    a.click();
  }, [selectedPositions, selectedVolumen, selectedDepot]);

  /* ── Tab-Toolbars (PP: in der Tab-Zeile rechtsbündig) ── */
  /* ── Vollständiges Spaltenmenü 1:1 wie PP StatementOfAssetsViewer ──
     Klassifizierungen | Spalten (mit Gruppen-Submenüs) | Spalten zurücksetzen | Darstellung */
  // Checkbox für eine Spalte (Label aus der dynamischen Spaltenliste)
  const colLabel = (id: string): string => vermoegenColumns.find(c => c.id === id)?.label ?? id;
  const check = (id: string): MenuNode =>
    ({ kind: 'check', label: colLabel(id), checked: !vermoegenCfg.hidden.has(id), onToggle: () => vermoegenCfg.toggleHidden(id) });
  // wie check(), aber mit explizitem Label (z.B. nur die Periode im Submenü)
  const checkLabel = (id: string, label: string): MenuNode =>
    ({ kind: 'check', label, checked: !vermoegenCfg.hidden.has(id), onToggle: () => vermoegenCfg.toggleHidden(id) });
  // PP: "Alle hinzufügen" / "Alle entfernen" für eine Spaltengruppe (Liste von IDs)
  const groupAddRemove = (ids: string[]): MenuNode[] => [
    { kind: 'separator' },
    { kind: 'action', label: 'Alle hinzufügen', onClick: () => ids.forEach(id => { if (vermoegenCfg.hidden.has(id)) vermoegenCfg.toggleHidden(id); }) },
    { kind: 'action', label: 'Alle entfernen', onClick: () => ids.forEach(id => { if (!vermoegenCfg.hidden.has(id)) vermoegenCfg.toggleHidden(id); }) },
  ];
  // PP ReportingPeriodColumnOptions: eine Kennzahl → Submenü mit allen Berichtszeiträumen + "Neu..."
  const periodSubmenu = (m: PeriodMetric): MenuNode => ({
    kind: 'submenu', label: m.menuLabel,
    children: [
      ...reportPeriods.map(per => checkLabel(`${m.id}_${per.key}`, per.label)),
      { kind: 'separator' },
      { kind: 'action', label: 'Neu...', onClick: () => { setVermoegenMenuOpen(false); setNeuPeriodeDialog(m.id); } },
    ],
  });
  // alle Spalten-IDs einer Kennzahlgruppe über alle Perioden
  const periodIds = (metrics: PeriodMetric[]): string[] =>
    metrics.flatMap(m => reportPeriods.map(per => `${m.id}_${per.key}`));
  const vermoegenMenuNodes: MenuNode[] = [
    // PP: Klassifizierungen (Gruppierung der Positionen) — aus echten Taxonomien
    { kind: 'header', label: 'Klassifizierungen' },
    { kind: 'radio', label: '(keine)', selected: klassifizierung === 'keine',
      onSelect: () => { setKlassifizierung('keine'); try { localStorage.setItem('depots-vermoegen-klass', 'keine'); } catch { /* */ } } },
    ...taxonomien.map((t): MenuNode => ({
      kind: 'radio', label: t.name, selected: klassifizierung === t.id,
      onSelect: () => { setKlassifizierung(t.id); try { localStorage.setItem('depots-vermoegen-klass', t.id); } catch { /* */ } },
    })),
    // PP: Spalten
    { kind: 'header', label: 'Spalten' },
    check('bestand'), check('name'), check('symbol'), check('isin'), check('wkn'),
    check('kurs'), check('kursdatum'), check('marktwert'), check('anteil'),
    // Einstandskurs — mit Heading-Trennern (Steuern u. Gebühren nicht/inbegriffen)
    { kind: 'submenu', label: 'Einstandskurs', children: [
      { kind: 'header', label: 'Steuern und Gebühren nicht inbegriffen' },
      check('einstandskurs'), check('einstandskursGld'),
      { kind: 'header', label: 'Steuern und Gebühren inbegriffen' },
      check('einstandskursBrutto'), check('einstandskursGldBrutto'),
      ...groupAddRemove(['einstandskurs', 'einstandskursGld', 'einstandskursBrutto', 'einstandskursGldBrutto']),
    ] },
    { kind: 'submenu', label: 'Einstandspreis', children: [
      check('einstandspreis'), check('einstandspreisGld'),
      ...groupAddRemove(['einstandspreis', 'einstandspreisGld']),
    ] },
    check('gewinn'), check('notiz'),
    // Performance — je Kennzahl ein Perioden-Subsubmenü
    { kind: 'submenu', label: 'Performance', children: [
      ...PERF_METRICS.map(periodSubmenu),
      ...groupAddRemove(periodIds(PERF_METRICS)),
    ] },
    // Dividenden — je Kennzahl ein Perioden-Subsubmenü
    { kind: 'submenu', label: 'Dividenden', children: [
      ...DIV_METRICS.map(periodSubmenu),
      ...groupAddRemove(periodIds(DIV_METRICS)),
    ] },
    // Klassifizierung — je Taxonomie eine Spalte (nur wenn Taxonomien existieren)
    ...(taxonomien.length > 0 ? [{
      kind: 'submenu' as const, label: 'Klassifizierung',
      children: [
        ...taxonomien.map(t => check(`tax_${t.id}`)),
        ...groupAddRemove(taxonomien.map(t => `tax_${t.id}`)),
      ],
    }] : []),
    // (Attribute-Gruppe entfällt — im Datenmodell keine Attribute definiert, wie PP)
    // Devisen — 7 Einträge
    { kind: 'submenu', label: 'Devisen', children: [
      check('waehrung'), check('wechselkurs'), check('kursBasis'), check('marktwertBasis'),
      check('einstandspreisBasis'), check('einstandskursBasis'), check('gewinnBasis'),
      ...groupAddRemove(['waehrung', 'wechselkurs', 'kursBasis', 'marktwertBasis', 'einstandspreisBasis', 'einstandskursBasis', 'gewinnBasis']),
    ] },
    // Abstand zu SMA — Options-Submenü (feste SMA-Intervalle, kein "Neu...")
    { kind: 'submenu', label: 'Abstand zu SMA', children: SMA_PERIODS.map(n => checkLabel(`sma${n}`, `${n} Tage`)) },
    // Abstand vom ATH — Options-Submenü mit Berichtszeiträumen + "Neu..."
    { kind: 'submenu', label: 'Abstand vom ATH', children: [
      ...reportPeriods.map(per => checkLabel(`ath_${per.key}`, per.label)),
      { kind: 'separator' },
      { kind: 'action', label: 'Neu...', onClick: () => { setVermoegenMenuOpen(false); setNeuPeriodeDialog('ath'); } },
    ] },
    // Kursspanne — Options-Submenü mit Berichtszeiträumen + "Neu..."
    { kind: 'submenu', label: 'Kursspanne', children: [
      ...reportPeriods.map(per => checkLabel(`kursspanne_${per.key}`, per.label)),
      { kind: 'separator' },
      { kind: 'action', label: 'Neu...', onClick: () => { setVermoegenMenuOpen(false); setNeuPeriodeDialog('kursspanne'); } },
    ] },
    { kind: 'separator' },
    { kind: 'action', label: 'Spalten zurücksetzen', onClick: () => vermoegenCfg.resetColumns() },
    { kind: 'submenu', label: 'Darstellung', children: [
      { kind: 'check', label: 'Summenzeile oben', checked: summeOben,
        onToggle: () => { const v = !summeOben; setSummeOben(v); try { localStorage.setItem('depots-vermoegen-summe-oben', String(v)); } catch { /* */ } } },
      { kind: 'check', label: 'Summenzeile unten', checked: summeUnten,
        onToggle: () => { const v = !summeUnten; setSummeUnten(v); try { localStorage.setItem('depots-vermoegen-summe-unten', String(v)); } catch { /* */ } } },
    ] },
  ];

  const vermoegenActions = (
    <>
      <button className="pp-toolbar-btn" title="Daten exportieren" onClick={exportVermoegenCSV}><Download size={12} /></button>
      <div className="relative">
        <button className="pp-toolbar-btn" title="Spalten anzeigen / ausblenden" onClick={() => setVermoegenMenuOpen(!vermoegenMenuOpen)}>
          <Settings size={12} />
        </button>
        {vermoegenMenuOpen && (
          <HierarchyMenu nodes={vermoegenMenuNodes} onClose={() => setVermoegenMenuOpen(false)} />
        )}
      </div>
      {neuPeriodeDialog !== null && (
        <ReportingPeriodDialog
          onClose={() => setNeuPeriodeDialog(null)}
          onSelect={r => addReportingPeriod(r, neuPeriodeDialog)}
        />
      )}
    </>
  );

  const umsaetzeActions = (
    <>
      <SearchInput value={depotSearch} onChange={setDepotSearch} />
      <div style={{ width: 1, height: 16, background: 'var(--pp-border)', flexShrink: 0 }} />
      <TransactionFilterButton value={depotTxFilter} storageKey="depots-tx-filter" onChange={setDepotTxFilter} />
      <button className="pp-toolbar-btn" title="Daten exportieren" onClick={exportTxCSV}><Download size={12} /></button>
      <button className="pp-toolbar-btn" title="Spalten anzeigen / ausblenden"
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          setDepotTxColMenuPos(prev => prev ? null : { x: rect.right - 160, y: rect.bottom + 2 });
        }}>
        <Settings size={12} />
      </button>
    </>
  );

  const tabActions = detailTab === 'vermoegensuebersicht' ? vermoegenActions
    : detailTab === 'umsaetze' ? umsaetzeActions
    : undefined;

  /* ── Detail Panel ── */
  const detailPanel = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-[3px]" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
        <ColorMarker color={selectedDepotFarbe ?? getColor(selectedDepot || 'Depot')} />
        <span className="text-[12px] font-semibold" style={{ color: 'var(--pp-text)' }}>{selectedDepot || 'Depot'}</span>
      </div>
      {/* PP InformationPane: Tabs + Pane-Toolbar in EINER Zeile */}
      <TabBar tabs={DETAIL_TABS} active={detailTab} onChange={setDetailTab} actions={tabActions} />
      <div className="flex-1 overflow-auto flex flex-col">

        {/* ── Vermögensaufstellung — PP StatementOfAssetsPane.addButtons (Zeilen 70-80):
             Daten exportieren | Spalten anzeigen / ausblenden ── */}
        {detailTab === 'vermoegensuebersicht' && (() => {
          const cols = vermoegenCfg.orderedColumns;
          const anteilOf = (p: DepotPosition) => selectedVolumen > 0 ? (p.marktwert / selectedVolumen) * 100 : 0;
          // Periodische ID (z.B. "ttwror_all", "delta_30") → numerischer Wert aus perfByPeriod
          const periodVal = (p: DepotPosition, id: string): number | null => {
            for (const m of [...PERF_METRICS, ...DIV_METRICS]) {
              if (id.startsWith(m.id + '_')) {
                const key = id.slice(m.id.length + 1);
                return p.perfByPeriod[key]?.[m.field] ?? null;
              }
            }
            return null;
          };
          // Devisen-Spalten (Basiswährung) — Tool führt EUR als Basis, Kurse sind bereits EUR
          const wechselkurs = (p: DepotPosition) => p.waehrung === state.basisWaehrung ? 1 : 1;
          const sortVal = (p: DepotPosition, id: string): number | string | Date | null | undefined => {
            switch (id) {
              case 'bestand': return p.shares;
              case 'name': return p.name;
              case 'isin': return p.isin;
              case 'symbol': return p.symbol;
              case 'wkn': return p.wkn;
              case 'kurs': return p.kurs;
              case 'kursdatum': return p.kursdatum;
              case 'marktwert': return p.marktwert;
              case 'anteil': return anteilOf(p);
              case 'einstandskurs': return p.einstandskurs;
              case 'einstandskursGld': return p.einstandskursGldNetto;
              case 'einstandskursBrutto': return p.einstandskursFifoBrutto;
              case 'einstandskursGldBrutto': return p.einstandskursGldBrutto;
              case 'einstandspreis': return p.investiert;
              case 'einstandspreisGld': return p.investiertGldBrutto;
              case 'gewinn': return p.gewinn;
              case 'notiz': return p.notiz;
              case 'waehrung': return p.waehrung;
              case 'wechselkurs': return wechselkurs(p);
              case 'kursBasis': return p.kurs;
              case 'marktwertBasis': return p.marktwert;
              case 'einstandspreisBasis': return p.investiert;
              case 'einstandskursBasis': return p.einstandskurs;
              case 'gewinnBasis': return p.gewinn;
              default: {
                if (id.startsWith('tax_')) return klassByTax.get(id.slice(4))?.get(p.wpKey) ?? null;
                if (id.startsWith('sma')) return p.abstandSma[Number(id.slice(3))] ?? null;
                if (id.startsWith('ath_')) return p.abstandAth[id.slice(4)] ?? null;
                if (id.startsWith('kursspanne_')) return p.kursspanne[id.slice(11)]?.pos ?? null;
                return periodVal(p, id);
              }
            }
          };
          const gv = (v: number) => <span style={{ color: v >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{euro(v)}</span>;
          const gp = (v: number) => <span style={{ color: v >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{num(v)}</span>;
          const cell = (p: DepotPosition, id: string): React.ReactNode => {
            switch (id) {
              case 'bestand': return stueck(p.shares);
              case 'name': return (
                <span className="flex items-center gap-1.5">
                  <ColorMarker color={p.typFarbe || getColor(p.wpKey)} />
                  {p.name}
                </span>
              );
              case 'isin': return p.isin;
              case 'symbol': return p.symbol;
              case 'wkn': return p.wkn;
              // PP: Kurs = Values.Quote (#,##0.00######, 2–8 NK, ohne Währung);
              // roher Live-Kurs → float32-Rauschen bereinigen
              case 'kurs': return kursLive(p.kurs);
              case 'kursdatum': return p.kursdatum ? datumKurz(p.kursdatum) : '';
              // PP: Marktwert = Values.Money (#,##0.00, 2 NK)
              case 'marktwert': return euro(p.marktwert);
              case 'anteil': return num(anteilOf(p));
              // PP: Einstandskurs = Values.CalculatedQuote (#,##0.00######, 2–8 NK)
              case 'einstandskurs': return kursFmt(p.einstandskurs);
              case 'einstandskursGld': return kursFmt(p.einstandskursGldNetto);
              case 'einstandskursBrutto': return kursFmt(p.einstandskursFifoBrutto);
              case 'einstandskursGldBrutto': return kursFmt(p.einstandskursGldBrutto);
              // PP: Einstandspreis (gesamt) = Values.Money (2 NK)
              case 'einstandspreis': return euro(p.investiert);
              case 'einstandspreisGld': return euro(p.investiertGldBrutto);
              case 'gewinn': return gv(p.gewinn);
              case 'notiz': return p.notiz;
              case 'waehrung': return p.waehrung;
              case 'wechselkurs': return wechselkurs(p).toFixed(4).replace('.', ',');
              case 'kursBasis': return kursLive(p.kurs);
              case 'marktwertBasis': return euro(p.marktwert);
              case 'einstandspreisBasis': return euro(p.investiert);
              case 'einstandskursBasis': return kursFmt(p.einstandskurs);
              case 'gewinnBasis': return gv(p.gewinn);
              default: {
                if (id.startsWith('tax_')) return klassByTax.get(id.slice(4))?.get(p.wpKey) ?? '';
                if (id.startsWith('sma')) {
                  const v = p.abstandSma[Number(id.slice(3))];
                  return v != null ? gp(v) : '';
                }
                if (id.startsWith('ath_')) {
                  const v = p.abstandAth[id.slice(4)];
                  return v != null ? gp(v) : '';
                }
                if (id.startsWith('kursspanne_')) {
                  const r = p.kursspanne[id.slice(11)];
                  return r && r.hoch > r.tief ? `${euro(r.tief)} – ${euro(r.hoch)}` : '';
                }
                // periodische Performance-/Dividenden-Spalten
                for (const m of [...PERF_METRICS, ...DIV_METRICS]) {
                  if (id.startsWith(m.id + '_')) {
                    const key = id.slice(m.id.length + 1);
                    const v = p.perfByPeriod[key]?.[m.field];
                    if (v == null) return '';
                    // Dividenden nur zeigen, wenn vorhanden
                    if ((m.id === 'divFifo' || m.id === 'divGld') && (p.perfByPeriod[key]?.divSumme ?? 0) <= 0) return '';
                    return m.fmt === 'eur' ? gv(v) : gp(v);
                  }
                }
                return '';
              }
            }
          };
          // Summenwert pro Spalte (für Summen-/Gruppenzeile).
          // PP MoneyCollectors.sum summiert die internen Cent-Beträge → entspricht
          // der Summe der auf 2 NK gerundeten Einzelwerte (nicht Summe-dann-Runden).
          const sumCell = (items: DepotPosition[], id: string, label: string): React.ReactNode => {
            const sum = (f: (p: DepotPosition) => number) =>
              items.reduce((s, p) => s + Math.round(f(p) * 100) / 100, 0);
            const totalMw = sum(p => p.marktwert);
            switch (id) {
              case 'name': return label;
              case 'marktwert': return euro(totalMw);
              case 'marktwertBasis': return euro(totalMw);
              case 'anteil': return num(selectedVolumen > 0 ? (totalMw / selectedVolumen) * 100 : 0);
              case 'einstandspreis': return euro(sum(p => p.investiert));
              case 'einstandspreisBasis': return euro(sum(p => p.investiert));
              case 'einstandspreisGld': return euro(sum(p => p.investiertGldBrutto));
              case 'gewinn': return gv(sum(p => p.gewinn));
              case 'gewinnBasis': return gv(sum(p => p.gewinn));
              default: {
                // periodische Summen für Kursgewinn/Delta/Dividendensumme (EUR-Kennzahlen)
                for (const m of [...PERF_METRICS, ...DIV_METRICS]) {
                  if (m.fmt === 'eur' && id.startsWith(m.id + '_')) {
                    const key = id.slice(m.id.length + 1);
                    return gv(sum(p => p.perfByPeriod[key]?.[m.field] ?? 0));
                  }
                }
                return '';
              }
            }
          };
          // Gruppierung: PP "(keine)" oder nach gewählter Taxonomie (klassifizierung = Taxonomie-ID)
          const groups = new Map<string, DepotPosition[]>();
          if (klassifizierung === 'keine') {
            groups.set('', selectedPositions);
          } else {
            const lookup = klassByTax.get(klassifizierung);
            for (const p of selectedPositions) {
              const g = lookup?.get(p.wpKey) || 'Nicht klassifiziert';
              if (!groups.has(g)) groups.set(g, []);
              groups.get(g)!.push(p);
            }
          }
          const sumRow = (label: string, items: DepotPosition[]) => (
            <tr className="pp-sum">
              {cols.map(c => (
                <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}>
                  {sumCell(items, c.id, label)}
                </td>
              ))}
            </tr>
          );
          return (
            <table className="pp-table">
              <thead>
                <tr>
                  {cols.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={vermoegenCfg} />)}
                </tr>
              </thead>
              <tbody>
                {/* PP Darstellung: Summenzeile oben */}
                {summeOben && selectedPositions.length > 0 && sumRow('Summe', selectedPositions)}
                {Array.from(groups.entries()).map(([typ, items0]) => {
                  const items = vermoegenCfg.sortData(items0, sortVal);
                  const showGroupHeader = klassifizierung !== 'keine';
                  return (
                    <Fragment key={typ || '_all'}>
                      {showGroupHeader && (
                        <tr className="pp-group">
                          {cols.map(c => (
                            <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}>
                              {c.id === 'name' ? `${typ} (${items.length})` : sumCell(items, c.id, '')}
                            </td>
                          ))}
                        </tr>
                      )}
                      {items.map(p => (
                        <tr key={p.wpKey} className="pp-row">
                          {cols.map(c => (
                            <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}
                              style={c.id === 'name' && showGroupHeader ? { paddingLeft: 20 } : undefined}>
                              {cell(p, c.id)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                {/* PP Darstellung: Summenzeile unten */}
                {summeUnten && selectedPositions.length > 0 && sumRow('Summe', selectedPositions)}
              </tbody>
            </table>
          );
        })()}

        {/* ── Umsätze (Toolbar in der Tab-Zeile, PP TransactionsPane) ── */}
        {detailTab === 'umsaetze' && (
          <>
            {depotTxRows.length > 0 ? (
              <div className="flex-1 min-h-0">
                <PPTable
                  columns={DEPOT_TX_COLUMNS} data={depotTxRows} rowKey={depotTxRowKey}
                  storageKey="depots-umsaetze" hiddenByDefault={DEPOT_TX_HIDDEN_BY_DEFAULT}
                  columnMenuPos={depotTxColMenuPos}
                  onColumnMenuClose={closeDepotTxColMenu}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
                Keine Umsätze vorhanden
              </div>
            )}
          </>
        )}

        {/* ── Diagramm — PP PortfolioBalancePane: Wertentwicklung des Depots ── */}
        {detailTab === 'diagramm' && (
          <div className="p-3 h-full">
            {balanceSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={balanceSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
                  <XAxis dataKey="datum" tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} width={70} domain={['auto', 'auto']} />
                  <ReTooltip contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                    formatter={(v) => [euro(v as number), '']} />
                  <Line type="monotone" dataKey="wert" stroke="var(--pp-accent)" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
                Keine Daten vorhanden
              </div>
            )}
          </div>
        )}

        {/* ── Bestand (Holdings pie chart) ── */}
        {detailTab === 'bestand' && (
          pieData.length > 0 ? (
            <div className="p-3 h-full flex">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius="80%" innerRadius="30%" strokeWidth={1} stroke="var(--pp-bg)">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                      formatter={(v) => [euro(v as number), '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-[200px] overflow-auto text-[10px] pl-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 py-[2px]">
                    <span className="inline-block w-[8px] h-[8px] rounded-[1px] flex-shrink-0"
                      style={{ backgroundColor: d.color || PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="truncate" style={{ color: 'var(--pp-text)' }}>{d.name}</span>
                    <span className="ml-auto" style={{ color: 'var(--pp-text-muted)' }}>{euro(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
              Kein Bestand vorhanden
            </div>
          )
        )}
      </div>
    </div>
  );

  return (
    <>
      <SplitPane top={masterPanel} bottom={detailPanel} defaultTopPercent={35} storageKey="depots" />
      {ctxMenu && (
        <DepotContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          depot={depots.find(d => d.key === ctxMenu.depotKey) ?? depots[0]}
          depotCount={activeDepotCount}
          txCount={state.depots[ctxMenu.depotKey]?.transaktionen?.length ?? 0}
          hasSecurities={hasSecurities}
          onAction={a => setDialog({ ...a, depot: ctxMenu.depotKey })}
          onToggleAktiv={() => toggleDepotAktiv(ctxMenu.depotKey)}
          onDelete={() => {
            // PP ConfirmAction: PortfolioMenuDeleteConfirm
            if (confirm(`Möchten Sie das Depot '${ctxMenu.depotKey}' wirklich löschen?`)) {
              deleteDepot(ctxMenu.depotKey);
              if (selected === ctxMenu.depotKey) setSelected(null);
            }
          }}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {dialog?.dialog === 'security' && (
        <SecurityTransactionDialog
          typ={dialog.typ} konten={state.konten} depots={state.depots} wertpapiere={state.wertpapiere}
          preselectedDepot={dialog.depot}
          onSave={addTransaktionen} onClose={() => setDialog(null)}
        />
      )}
      {dialog?.dialog === 'account' && (
        <AccountTransactionDialog
          typ={dialog.typ} konten={state.konten} wertpapiere={state.wertpapiere}
          preselectedKonto={dialog.depot ? state.depots[dialog.depot]?.referenzkontoName : undefined}
          onSave={addTransaktionen} onClose={() => setDialog(null)}
        />
      )}
      {dialog?.dialog === 'securityTransfer' && (
        <SecurityTransferDialog
          depots={state.depots} wertpapiere={state.wertpapiere}
          preselectedDepot={dialog.depot}
          onSave={addTransaktionen} onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
