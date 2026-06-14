import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { TabBar } from './PPElements';
import { useColumnConfig, ColumnHeader, type ColumnDef } from './useColumnConfig';
import { euro, kurs, stueck, datumKurz, prozent } from '../utils/format';
import type { Wertpapier, Transaktion } from '../types/portfolio';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot } from 'recharts';
import { Download, Plus, Search, Crosshair, Ruler, EyeOff, Eye } from 'lucide-react';
import { ContextMenuPopup, computeDQMetrics, downloadCSV, TX_LABELS, type MenuEntry } from '../views/AlleWertpapiereView';

/* ═══════════════════════════════════════════════════════════════════════
   SMA / EMA Berechnung (PP: SecuritiesChart ChartDetails)
   ═══════════════════════════════════════════════════════════════════════ */
function computeSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

function computeEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[j];
      result.push(sum / period);
      continue;
    }
    const prev = result[i - 1];
    result.push(prev != null ? data[i] * k + prev * (1 - k) : null);
  }
  return result;
}

function computeBollinger(data: number[], period = 20): { upper: (number | null)[]; lower: (number | null)[]; middle: (number | null)[] } {
  const middle = computeSMA(data, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    const m = middle[i];
    if (m == null || i < period - 1) { upper.push(null); lower.push(null); continue; }
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (data[j] - m) ** 2;
    const std = Math.sqrt(variance / period);
    upper.push(m + 2 * std);
    lower.push(m - 2 * std);
  }
  return { upper, lower, middle };
}

const SMA_PERIODS = [5, 20, 30, 38, 50, 90, 100, 200] as const;
const EMA_PERIODS = [5, 20, 30, 38, 50, 90, 100, 200] as const;

const OVERLAY_COLORS: Record<string, string> = {
  // PP: SimpleMovingAverage.java — exakte Farben
  SMA_5: '#B36B6B', SMA_20: '#B3A76B', SMA_30: '#83B36B', SMA_38: '#6BB38F',
  SMA_50: '#6B9BB3', SMA_90: '#776BB3', SMA_100: '#B36BB3', SMA_200: '#B36B6B',
  // PP: ExponentialMovingAverage.java — exakte Farben
  EMA_5: '#C86B6B', EMA_20: '#C8A76B', EMA_30: '#83C86B', EMA_38: '#6BC88F',
  EMA_50: '#6B9BC8', EMA_90: '#776BC8', EMA_100: '#C86BB3', EMA_200: '#C86B6B',
  // PP: BollingerBands.java — Farbe #C98D44
  BOLLINGER_UPPER: '#C98D44', BOLLINGER_LOWER: '#C98D44', BOLLINGER_MIDDLE: '#C98D44',
  // PP: MovingAverageConvergenceDivergence.java — Farbe #E29BC8
  MACD: '#E29BC8', MACD_SIGNAL: '#E29BC8', MACD_HISTOGRAM: '#7F8C8D',
};

/* ═══════════════════════════════════════════════════════════════════════
   Chart-Intervalle (PP: SecurityPriceChartPane)
   ═══════════════════════════════════════════════════════════════════════ */
const CHART_INTERVALS = [
  { id: '1M', label: '1M', months: 1 },
  { id: '2M', label: '2M', months: 2 },
  { id: '6M', label: '6M', months: 6 },
  { id: '1Y', label: '1J', months: 12 },
  { id: '2Y', label: '2J', months: 24 },
  { id: '3Y', label: '3J', months: 36 },
  { id: '5Y', label: '5J', months: 60 },
  { id: '10Y', label: '10J', months: 120 },
  { id: 'YTD', label: 'YTD', months: -1 },
  { id: 'H', label: 'Haltedauer', months: -2 },
  { id: 'ALL', label: 'Alle', months: 0 },
];

/* ═══════════════════════════════════════════════════════════════════════
   TRADES — FIFO (PP: TradeCollector)
   ═══════════════════════════════════════════════════════════════════════ */
interface Trade {
  startDatum: Date;
  endDatum?: Date;
  stueck: number;
  einstandswert: number;
  verkaufswert?: number;
  gewinn?: number;
  gewinnPct?: number;
  haltedauer?: number;
  offen: boolean;
}

function computeTrades(txs: Transaktion[]): Trade[] {
  const sorted = [...txs].sort((a, b) => a.datum.getTime() - b.datum.getTime());
  const trades: Trade[] = [];
  const openLots: { datum: Date; stueck: number; kurs: number }[] = [];
  for (const tx of sorted) {
    if (tx.typ === 'kauf' || tx.typ === 'umbuchung_ein') {
      openLots.push({ datum: tx.datum, stueck: tx.stueck, kurs: tx.kurs > 0 ? tx.kurs : (tx.stueck > 0 ? tx.betrag / tx.stueck : 0) });
    } else if (tx.typ === 'verkauf' || tx.typ === 'umbuchung_aus') {
      let remaining = tx.stueck;
      const sellPrice = tx.kurs > 0 ? tx.kurs : (tx.stueck > 0 ? tx.betrag / tx.stueck : 0);
      while (remaining > 0 && openLots.length > 0) {
        const lot = openLots[0];
        const used = Math.min(remaining, lot.stueck);
        const einstand = used * lot.kurs;
        const verkauf = used * sellPrice;
        const gewinn = verkauf - einstand;
        trades.push({
          startDatum: lot.datum, endDatum: tx.datum, stueck: used,
          einstandswert: einstand, verkaufswert: verkauf, gewinn,
          gewinnPct: einstand > 0 ? (gewinn / einstand) * 100 : 0,
          haltedauer: Math.round((tx.datum.getTime() - lot.datum.getTime()) / 86400000),
          offen: false,
        });
        lot.stueck -= used;
        remaining -= used;
        if (lot.stueck <= 0) openLots.shift();
      }
    }
  }
  for (const lot of openLots) {
    if (lot.stueck > 0) {
      trades.push({ startDatum: lot.datum, stueck: lot.stueck, einstandswert: lot.stueck * lot.kurs, offen: true });
    }
  }
  return trades;
}

/* ═══════════════════════════════════════════════════════════════════════
   Kurs-Dialog (PP: SecurityPriceDialog)
   ═══════════════════════════════════════════════════════════════════════ */
function PriceDialog({ onClose, onSave, defaultDate }: {
  onClose: () => void;
  onSave: (datum: Date, kurs: number) => void;
  defaultDate?: Date;
}) {
  const [datum, setDatum] = useState((defaultDate ?? new Date()).toISOString().slice(0, 10));
  const [kurs, setKurs] = useState('');
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="rounded-lg shadow-xl p-4" style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', minWidth: 300 }} onClick={e => e.stopPropagation()}>
        <div className="text-[13px] font-semibold mb-3" style={{ color: 'var(--pp-text)' }}>Kurs hinzufügen</div>
        <div className="space-y-2 text-[11px]">
          <label className="flex items-center gap-2" style={{ color: 'var(--pp-text)' }}>
            <span className="w-16">Datum</span>
            <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
              className="flex-1 rounded px-2 py-1" style={{ background: 'var(--pp-sidebar-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }} />
          </label>
          <label className="flex items-center gap-2" style={{ color: 'var(--pp-text)' }}>
            <span className="w-16">Kurs</span>
            <input type="number" step="any" value={kurs} onChange={e => setKurs(e.target.value)} autoFocus
              className="flex-1 rounded px-2 py-1" style={{ background: 'var(--pp-sidebar-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }} />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1 rounded text-[11px]" style={{ color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }}>Abbrechen</button>
          <button onClick={() => { if (kurs) { onSave(new Date(datum), parseFloat(kurs)); onClose(); } }} className="px-3 py-1 rounded text-[11px] font-semibold" style={{ background: 'var(--pp-accent)', color: '#fff', border: 'none' }}>Hinzufügen</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Detail-Tab Toolbar (wiederverwendbar für alle Tabs)
   ═══════════════════════════════════════════════════════════════════════ */
function DetailToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 px-2 py-[2px]" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)', minHeight: 26 }}>
      {children}
    </div>
  );
}

function SubMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <div className="flex items-center justify-between px-3 py-[3px] cursor-pointer hover:opacity-80" style={{ color: 'var(--pp-text)' }}>
        <span style={{ color: 'var(--pp-text-muted)', fontSize: 9, marginRight: 8 }}>◀</span>
        <span>{label}</span>
      </div>
      {open && (
        <div className="absolute z-50 py-1 rounded shadow-lg text-[11px]"
          style={{ right: '100%', top: 0, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', minWidth: 160, whiteSpace: 'nowrap' }}>
          {children}
        </div>
      )}
    </div>
  );
}

const DETAIL_TABS = [
  { id: 'diagramm', label: 'Diagramm' },
  { id: 'historische-kurse', label: 'Historische Kurse' },
  { id: 'umsaetze', label: 'Umsätze' },
  { id: 'trades', label: 'Trades' },
  { id: 'ereignisse', label: 'Ereignisse' },
  { id: 'datenqualitaet', label: 'Datenqualität' },
];

/* ═══════════════════════════════════════════════════════════════════════
   Spalten-Definitionen für die Detail-Tabs (useColumnConfig)
   ═══════════════════════════════════════════════════════════════════════ */
const HIST_KURSE_COLUMNS: ColumnDef[] = [
  { id: 'datum', label: 'Datum', width: 80 },
  { id: 'kurs', label: 'Kurs', align: 'right', width: 80 },
];

const WP_UMSAETZE_COLUMNS: ColumnDef[] = [
  { id: 'datum', label: 'Datum', width: 80 },
  { id: 'typ', label: 'Typ', width: 80 },
  { id: 'wertpapier', label: 'Wertpapier', width: 250 },
  { id: 'stueck', label: 'Stück', align: 'right', width: 80 },
  { id: 'kurs', label: 'Kurs', align: 'right', width: 80 },
  { id: 'betrag', label: 'Betrag', align: 'right', width: 80 },
  { id: 'gebuehren', label: 'Gebühren', align: 'right', width: 80 },
  { id: 'steuern', label: 'Steuern', align: 'right', width: 80 },
  { id: 'gesamtpreis', label: 'Gesamtpreis', align: 'right', width: 80 },
  { id: 'konto', label: 'Konto', width: 120 },
  { id: 'gegenkonto', label: 'Gegenkonto', width: 120 },
  { id: 'notiz', label: 'Notiz', width: 200 },
  { id: 'quelle', label: 'Quelle', width: 200 },
];

const TRADES_COLUMNS: ColumnDef[] = [
  { id: 'startdatum', label: 'Startdatum', width: 80 },
  { id: 'enddatum', label: 'Enddatum', width: 80 },
  { id: 'stueck', label: 'Stück', align: 'right', width: 80 },
  { id: 'einstandswert', label: 'Einstandswert', align: 'right', width: 80 },
  { id: 'verkaufswert', label: 'Verkaufswert', align: 'right', width: 80 },
  { id: 'gewinn', label: 'Gewinn/Verlust', align: 'right', width: 80 },
  { id: 'haltedauer', label: 'Haltedauer', align: 'right', width: 80 },
  { id: 'irr', label: 'IRR', align: 'right', width: 80 },
];

const EREIGNISSE_COLUMNS: ColumnDef[] = [
  { id: 'datum', label: 'Datum', width: 85 },
  { id: 'typ', label: 'Typ', width: 120 },
  { id: 'zahltag', label: 'Zahltag', width: 85 },
  { id: 'betrag', label: 'Betrag', align: 'right', width: 90 },
  { id: 'details', label: 'Details', width: 300 },
];

const DQ_DATUM_COLUMNS: ColumnDef[] = [
  { id: 'datum', label: 'Datum', width: 300 },
];

/* ═══════════════════════════════════════════════════════════════════════
   WertpapierDetailPane — unterer Detail-Bereich (6 Tabs)
   ═══════════════════════════════════════════════════════════════════════ */
interface WertpapierDetailPaneProps {
  wp: Wertpapier | null;
  onUpdateWertpapier: (key: string, patch: Partial<Wertpapier>) => void;
  onDeleteTransaktion: (id: string) => void;
  onImportTransaktionen: (txs: Transaktion[]) => void;
  storagePrefix?: string;
}

export function WertpapierDetailPane({ wp, onUpdateWertpapier: _onUpdateWertpapier, onDeleteTransaktion, onImportTransaktionen, storagePrefix = 'alle-wp' }: WertpapierDetailPaneProps) {
  const selectedWp = wp;
  // Hinweis: onUpdateWertpapier ist Teil der API, wird aber aktuell vom Detail-Bereich
  // nicht aufgerufen (PriceDialog.onSave war im Original ein TODO-No-op). Bewusst ungenutzt.
  void _onUpdateWertpapier;
  const histKurseCfg = useColumnConfig(`${storagePrefix}-histkurse`, HIST_KURSE_COLUMNS);
  const umsaetzeCfg = useColumnConfig(`${storagePrefix}-umsaetze`, WP_UMSAETZE_COLUMNS);
  const tradesCfg = useColumnConfig(`${storagePrefix}-trades`, TRADES_COLUMNS);
  const ereignisseCfg = useColumnConfig(`${storagePrefix}-ereignisse`, EREIGNISSE_COLUMNS);
  const fehlendeCfg = useColumnConfig(`${storagePrefix}-fehlend`, DQ_DATUM_COLUMNS);
  const unerwarteteCfg = useColumnConfig(`${storagePrefix}-unerwartet`, DQ_DATUM_COLUMNS);

  const [detailTab, setDetailTab] = useState('diagramm');
  const [chartInterval, setChartInterval] = useState('ALL');
  const [chartConfig, setChartConfig] = useState<Set<string>>(() => {
    try { const saved = localStorage.getItem('pp-chart-config'); if (saved) return new Set(JSON.parse(saved)); } catch { /* */ }
    return new Set(['CLOSING', 'INVESTMENT', 'DIVIDENDS', 'SCALING_LINEAR', 'SHOW_MAIN_HORIZONTAL_LINES']);
  });
  const [configMenuOpen, setConfigMenuOpen] = useState(false);
  const [configSubmenu, setConfigSubmenu] = useState<string | null>(null);
  const configBtnRef = useRef<HTMLButtonElement>(null);
  const configMenuRef = useRef<HTMLDivElement>(null);
  const [chartTool, setChartTool] = useState<'none' | 'crosshair' | 'measure'>('none');
  const [chartCtxMenu, setChartCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [hideMarkers, setHideMarkers] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [crosshairData, setCrosshairData] = useState<{ idx: number; datum: string; kurs: number } | null>(null);
  const [measureStartData, setMeasureStartData] = useState<{ idx: number; datum: string; kurs: number } | null>(null);
  const [measureEndData, setMeasureEndData] = useState<{ idx: number; datum: string; kurs: number } | null>(null);
  const [measureDragging, setMeasureDragging] = useState(false);

  // Dialoge
  const [priceDialog, setPriceDialog] = useState<{ wp: Wertpapier; defaultDate?: Date } | null>(null);

  // Kontextmenüs
  const [histCtx, setHistCtx] = useState<{ x: number; y: number; idx: number } | null>(null);
  const [txCtx, setTxCtx] = useState<{ x: number; y: number; tx: Transaktion } | null>(null);
  const [eventCtx, setEventCtx] = useState<{ x: number; y: number; idx: number } | null>(null);

  // Detail-Tab Suche/Filter
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('alle');

  const hasKursData = !!selectedWp?.kursHistorie?.length;
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setChartSize(prev => (prev.w === Math.round(width) && prev.h === Math.round(height)) ? prev : { w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [detailTab, hasKursData]);

  useEffect(() => {
    if (!configMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (configBtnRef.current?.contains(e.target as Node)) return;
      if (configMenuRef.current?.contains(e.target as Node)) return;
      setConfigMenuOpen(false); setConfigSubmenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [configMenuOpen]);

  useEffect(() => {
    try { localStorage.setItem('pp-chart-config', JSON.stringify([...chartConfig])); } catch { /* */ }
  }, [chartConfig]);

  // N: Chart-Daten mit Intervall-Filter
  const kursChartData = useMemo(() => {
    if (!selectedWp?.kursHistorie?.length) return [];
    let data = selectedWp.kursHistorie;
    const interval = CHART_INTERVALS.find(i => i.id === chartInterval);
    if (interval) {
      if (interval.months === -1) {
        // YTD: ab 1. Januar dieses Jahres
        const jan1 = new Date(new Date().getFullYear(), 0, 1);
        data = data.filter(k => k.datum >= jan1);
      } else if (interval.months === -2) {
        // Haltedauer: ab erster Transaktion
        if (selectedWp.transaktionen.length > 0) {
          const earliest = selectedWp.transaktionen.reduce((min, tx) => tx.datum < min ? tx.datum : min, selectedWp.transaktionen[0].datum);
          data = data.filter(k => k.datum >= earliest);
        }
      } else if (interval.months > 0) {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - interval.months);
        data = data.filter(k => k.datum >= cutoff);
      }
      // months === 0 → Alle → kein Filter
    }
    const prices = data.map(k => k.kurs);
    const overlays: Record<string, (number | null)[]> = {};
    for (const p of SMA_PERIODS) if (chartConfig.has(`SMA_${p}`)) overlays[`sma${p}`] = computeSMA(prices, p);
    for (const p of EMA_PERIODS) if (chartConfig.has(`EMA_${p}`)) overlays[`ema${p}`] = computeEMA(prices, p);
    if (chartConfig.has('BOLLINGERBANDS')) {
      const bb = computeBollinger(prices);
      overlays.bbUpper = bb.upper; overlays.bbLower = bb.lower; overlays.bbMiddle = bb.middle;
    }
    return data.map((k, i) => {
      const row: Record<string, unknown> = { datum: datumKurz(k.datum), kurs: k.kurs };
      for (const [key, arr] of Object.entries(overlays)) row[key] = arr[i];
      return row;
    });
  }, [selectedWp, chartInterval, chartConfig]);

  // Q: Trades
  const trades = useMemo(() => selectedWp ? computeTrades(selectedWp.transaktionen) : [], [selectedWp]);

  // R: Events
  const events = useMemo(() => {
    if (!selectedWp) return [];
    return selectedWp.transaktionen
      .filter(tx => tx.typ === 'dividende' || tx.typ === 'ausschuettung')
      .sort((a, b) => b.datum.getTime() - a.datum.getTime())
      .map(tx => ({ datum: tx.datum, typ: tx.typ === 'dividende' ? 'Dividende' : 'Ausschüttung', betrag: tx.betrag, notiz: tx.notiz ?? '' }));
  }, [selectedWp]);

  // S: DQ
  const dqMetrics = useMemo(() => selectedWp?.kursHistorie?.length ? computeDQMetrics(selectedWp.kursHistorie) : null, [selectedWp]);

  // P: Gefilterte Transaktionen
  const filteredTx = useMemo(() => {
    if (!selectedWp) return [];
    let txs = [...selectedWp.transaktionen].sort((a, b) => b.datum.getTime() - a.datum.getTime());
    if (txTypeFilter !== 'alle') txs = txs.filter(t => t.typ === txTypeFilter);
    if (txSearch) { const q = txSearch.toLowerCase(); txs = txs.filter(t => (TX_LABELS[t.typ] ?? t.typ).toLowerCase().includes(q) || (t.notiz ?? '').toLowerCase().includes(q) || datumKurz(t.datum).includes(q)); }
    return txs;
  }, [selectedWp, txTypeFilter, txSearch]);

  // CSV Exports
  const exportHistCSV = useCallback(() => {
    if (!selectedWp?.kursHistorie?.length) return;
    const header = 'Datum;Kurs';
    const rows = [...selectedWp.kursHistorie].reverse().map(k => `${datumKurz(k.datum)};${k.kurs.toFixed(4)}`);
    downloadCSV(`${selectedWp.name}_kurse.csv`, header, rows);
  }, [selectedWp]);

  const exportTxCSV = useCallback(() => {
    if (!filteredTx.length) return;
    const header = 'Datum;Typ;Stück;Kurs;Betrag;Gebühren;Steuern;Notiz';
    const rows = filteredTx.map(tx => [datumKurz(tx.datum), TX_LABELS[tx.typ] ?? tx.typ, tx.stueck, tx.kurs, tx.betrag, tx.gebuehren, tx.steuern, tx.notiz ?? ''].join(';'));
    downloadCSV(`${selectedWp?.name}_umsaetze.csv`, header, rows);
  }, [filteredTx, selectedWp]);

  const exportTradesCSV = useCallback(() => {
    if (!trades.length) return;
    const header = 'Startdatum;Enddatum;Stück;Einstandswert;Verkaufswert;Gewinn;Gewinn%;Haltedauer;Status';
    const rows = trades.map(t => [datumKurz(t.startDatum), t.endDatum ? datumKurz(t.endDatum) : '', t.stueck, t.einstandswert.toFixed(2), t.verkaufswert?.toFixed(2) ?? '', t.gewinn?.toFixed(2) ?? '', t.gewinnPct?.toFixed(1) ?? '', t.haltedauer ?? '', t.offen ? 'Offen' : 'Geschlossen'].join(';'));
    downloadCSV(`${selectedWp?.name}_trades.csv`, header, rows);
  }, [trades, selectedWp]);

  const exportEventsCSV = useCallback(() => {
    if (!events.length) return;
    const header = 'Datum;Typ;Betrag;Details';
    const rows = events.map(ev => [datumKurz(ev.datum), ev.typ, ev.betrag.toFixed(2), ev.notiz].join(';'));
    downloadCSV(`${selectedWp?.name}_ereignisse.csv`, header, rows);
  }, [events, selectedWp]);

  /* ═══════════════════════════════════════════════════════════════════
     DETAIL PANEL — 6 Tabs mit Toolbars + Kontextmenüs
     ═══════════════════════════════════════════════════════════════════ */
  const emptyMsg = (text: string) => <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>{text}</div>;

  return (<>
    <div className="flex flex-col h-full">
      {selectedWp ? (<>
        {/* PP: InformationPane — CLabel mit CSS HEADING2, nur Name(n) */}
        <div className="px-3 py-[5px]" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--pp-text)' }}>{selectedWp.name}</span>
        </div>
        <TabBar tabs={DETAIL_TABS} active={detailTab} onChange={setDetailTab} />
        <div className={detailTab === 'diagramm' ? 'flex-1 flex flex-col overflow-hidden' : 'flex-1 overflow-auto'}>

          {/* ══════ N: Diagramm ══════ */}
          {detailTab === 'diagramm' && (<>
            <DetailToolbar>
              {/* PP: ChartToolsManager.addButtons — Fadenkreuz + Abstandsmesser */}
              <button className="pp-toolbar-btn" title="Fadenkreuz"
                style={{ background: chartTool === 'crosshair' ? 'var(--pp-accent)' : undefined, color: chartTool === 'crosshair' ? '#fff' : undefined, borderRadius: 3, padding: '1px 4px' }}
                onClick={() => { setChartTool(t => t === 'crosshair' ? 'none' : 'crosshair'); setCrosshairData(null); setMeasureStartData(null); setMeasureEndData(null); setMeasureDragging(false); }}>
                <Crosshair size={13} />
              </button>
              <button className="pp-toolbar-btn" title="Abstand messen"
                style={{ background: chartTool === 'measure' ? 'var(--pp-accent)' : undefined, color: chartTool === 'measure' ? '#fff' : undefined, borderRadius: 3, padding: '1px 4px' }}
                onClick={() => { setChartTool(t => t === 'measure' ? 'none' : 'measure'); setCrosshairData(null); setMeasureStartData(null); setMeasureEndData(null); setMeasureDragging(false); }}>
                <Ruler size={13} />
              </button>
              {/* PP: SecuritiesChart.addButtons — "Markierungen ausblenden" Toggle */}
              <button className="pp-toolbar-btn" title={hideMarkers ? 'Markierungen einblenden' : 'Markierungen ausblenden'}
                style={{ background: hideMarkers ? 'var(--pp-accent)' : undefined, color: hideMarkers ? '#fff' : undefined, borderRadius: 3, padding: '1px 4px' }}
                onClick={() => setHideMarkers(h => !h)}>
                {hideMarkers ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <div style={{ width: 1, height: 14, background: 'var(--pp-border)', margin: '0 3px' }} />
              {/* PP: IntervalOption buttons */}
              {CHART_INTERVALS.map(iv => (
                <button key={iv.id} className="px-2 py-0.5 text-[10px] rounded"
                  style={{ background: chartInterval === iv.id ? 'var(--pp-accent)' : 'transparent', color: chartInterval === iv.id ? '#fff' : 'var(--pp-text-muted)', border: 'none', cursor: 'pointer' }}
                  onClick={() => setChartInterval(iv.id)}>{iv.label}</button>
              ))}
              <div style={{ flex: 1 }} />
              {/* PP: DropDown(Messages.MenuConfigureChart, Images.CONFIG) */}
              <div className="relative">
                <button ref={configBtnRef} className="pp-toolbar-btn" title="Diagramm konfigurieren"
                  onClick={() => { setConfigMenuOpen(v => !v); setConfigSubmenu(null); }}
                  style={{ fontSize: 12, padding: '1px 4px' }}>⚙</button>
                {configMenuOpen && (
                  <div ref={configMenuRef} className="fixed z-50 py-1 rounded shadow-lg text-[11px]"
                    style={{ right: Math.max(4, window.innerWidth - (configBtnRef.current?.getBoundingClientRect().right ?? 200)), top: (configBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 2, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', minWidth: 200 }}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}>
                    {[
                      { key: 'scaling', label: 'Skalierung', items: [
                        { id: 'SCALING_LINEAR', label: 'Linear' }, { id: 'SCALING_LOG', label: 'Logarithmisch' }
                      ]},
                      { key: 'development', label: 'Kursentwicklung', items: [
                        { id: 'CLOSING', label: 'Schlusskurse' }, { id: 'PURCHASEPRICE', label: 'Einstandskurse (FIFO)' }, { id: 'PURCHASEPRICE_MA', label: 'Einstandskurse (Gleitender Durchschnitt)' }
                      ]},
                      { key: 'marker', label: 'Markierungen', items: [
                        { id: 'INVESTMENT', label: 'Investitionen' }, { id: 'SHARES_HELD', label: 'Gehaltene Anteile' },
                        { id: 'DIVIDENDS', label: 'Dividenden' }, { id: 'EVENTS', label: 'Ereignisse' },
                        { id: 'EXTREMES', label: 'Hoch/Tief' }, { id: 'FIFOPURCHASE', label: 'Kaufpreis (FIFO)' },
                        { id: 'FLOATINGAVGPURCHASE', label: 'Kaufpreis (Gl. Durchschnitt)' }, { id: 'SHOW_LIMITS', label: 'Limits' }
                      ]},
                      { key: 'indicator', label: 'Indikatoren', items: [
                        { id: 'BOLLINGERBANDS', label: 'Bollinger Bänder' }, { id: 'MACD', label: 'MACD' }
                      ]},
                      { key: 'ma', label: 'Gleitender Durchschnitt', items: [], subs: [
                        { key: 'sma', label: 'SMA', items: SMA_PERIODS.map(p => ({ id: `SMA_${p}`, label: `${p} Tage` })) },
                        { key: 'ema', label: 'EMA', items: EMA_PERIODS.map(p => ({ id: `EMA_${p}`, label: `${p} Tage` })) },
                      ] },
                      { key: 'settings', label: 'Einstellungen', items: [
                        { id: 'SHOW_MARKER_LINES', label: 'Markierungslinien anzeigen' },
                        { id: 'SHOW_DATA_DIVIDEND_LABEL', label: 'Dividenden-Label anzeigen' },
                        { id: 'SHOW_DATA_EXTREMES_LABEL', label: 'Hoch/Tief-Label anzeigen' },
                        { id: 'SHOW_DATA_DIVESTMENT_INVESTMENT_LABEL', label: 'Investitions-Label anzeigen' },
                        { id: 'SHOW_MISSING_TRADING_DAYS', label: 'Fehlende Handelstage' },
                        { id: 'SHOW_PERCENTAGE_AXIS', label: 'Prozentachse anzeigen' },
                        { id: 'SHOW_MAIN_HORIZONTAL_LINES', label: 'Hauptlinien anzeigen' },
                        { id: 'SHOW_PERCENTAGE_HORIZONTAL_LINES', label: 'Prozentlinien anzeigen' },
                      ]},
                    ].map(group => {
                      const hasSubs = 'subs' in group && Array.isArray((group as Record<string, unknown>).subs);
                      return (
                      <div key={group.key}
                        className="relative"
                        onMouseEnter={() => setConfigSubmenu(group.key)}
                        onMouseLeave={() => setConfigSubmenu(null)}>
                        <div className="flex items-center px-3 py-[3px] cursor-pointer hover:opacity-80"
                          style={{ color: 'var(--pp-text)' }}>
                          <span style={{ color: 'var(--pp-text-muted)', fontSize: 9, marginRight: 8 }}>◀</span>
                          <span>{group.label}</span>
                        </div>
                        {configSubmenu === group.key && (
                          <div className="absolute z-50 py-1 rounded shadow-lg text-[11px]"
                            style={{ right: '100%', top: 0, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', minWidth: 180, whiteSpace: 'nowrap' }}>
                            {group.items.map(item => (
                              <label key={item.id} className="flex items-center gap-2 px-3 py-[2px] cursor-pointer hover:opacity-80" style={{ color: 'var(--pp-text)' }}>
                                <input type="checkbox" checked={chartConfig.has(item.id)}
                                  onChange={() => setChartConfig(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; })}
                                  style={{ accentColor: 'var(--pp-accent)' }} />
                                {item.label}
                              </label>
                            ))}
                            {hasSubs && ((group as unknown as { subs: { key: string; label: string; items: { id: string; label: string }[] }[] }).subs).map(sub => (
                              <SubMenu key={sub.key} label={sub.label}>
                                {sub.items.map(item => (
                                  <label key={item.id} className="flex items-center gap-2 px-3 py-[2px] cursor-pointer hover:opacity-80" style={{ color: 'var(--pp-text)' }}>
                                    <input type="checkbox" checked={chartConfig.has(item.id)}
                                      onChange={() => setChartConfig(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; })}
                                      style={{ accentColor: 'var(--pp-accent)' }} />
                                    {item.label}
                                  </label>
                                ))}
                              </SubMenu>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </DetailToolbar>
            {/* PP: SashLayout HORIZONTAL — links Chart, rechts SecurityDetailsViewer */}
            <div className="flex flex-1 overflow-hidden" style={{ minHeight: 200 }}>
              {/* Chart (linke Seite) */}
              <div ref={chartContainerRef} className="flex-1 relative overflow-hidden"
                style={{ cursor: chartTool !== 'none' ? 'crosshair' : undefined }}
                onContextMenu={e => { e.preventDefault(); setChartCtxMenu({ x: e.clientX, y: e.clientY }); }}>
                {kursChartData.length > 0 && chartSize.w > 0 && chartSize.h > 0 ? (
                    <LineChart data={kursChartData} width={chartSize.w} height={chartSize.h} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}
                      onMouseMove={(s: any) => {
                        if (chartTool === 'none') return;
                        const raw = s?.activeTooltipIndex;
                        const idx = raw != null ? Number(raw) : -1;
                        if (!Number.isFinite(idx) || idx < 0 || idx >= kursChartData.length) return;
                        const dp = kursChartData[idx];
                        const pt = { idx, datum: dp.datum as string, kurs: dp.kurs as number };
                        if (chartTool === 'crosshair') setCrosshairData(pt);
                        else if (chartTool === 'measure' && measureDragging) setMeasureEndData(pt);
                      }}
                      onClick={(s: any) => {
                        if (chartTool === 'none') return;
                        const raw = s?.activeTooltipIndex;
                        const idx = raw != null ? Number(raw) : -1;
                        if (!Number.isFinite(idx) || idx < 0 || idx >= kursChartData.length) return;
                        const dp = kursChartData[idx];
                        const pt = { idx, datum: dp.datum as string, kurs: dp.kurs as number };
                        if (chartTool === 'crosshair') {
                          setCrosshairData(pt);
                        } else if (chartTool === 'measure') {
                          if (!measureStartData || !measureDragging) {
                            setMeasureStartData(pt);
                            setMeasureEndData(pt);
                            setMeasureDragging(true);
                          } else {
                            setMeasureEndData(pt);
                            setMeasureDragging(false);
                          }
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
                      <XAxis dataKey="datum" tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} interval="preserveStartEnd" />
                      <YAxis yAxisId="main" tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} width={60} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                        formatter={(v, name) => { const n = String(name ?? ''); return [euro(v as number), n === 'kurs' ? 'Kurs' : n.toUpperCase()]; }}
                        wrapperStyle={chartTool !== 'none' ? { visibility: 'hidden' } : undefined} />
                      {/* PP: Hauptkurslinie */}
                      <Line yAxisId="main" type="monotone" dataKey="kurs" stroke="#4D34EB" strokeWidth={2} dot={false} isAnimationActive={false} />
                      {/* PP: SMA — strokeWidth=2, PP-Farben */}
                      {SMA_PERIODS.map(p => chartConfig.has(`SMA_${p}`) ? (
                        <Line key={`sma${p}`} yAxisId="main" type="monotone" dataKey={`sma${p}`} name={`SMA ${p}`} stroke={OVERLAY_COLORS[`SMA_${p}`]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                      ) : null)}
                      {/* PP: EMA — strokeWidth=2, PP-Farben */}
                      {EMA_PERIODS.map(p => chartConfig.has(`EMA_${p}`) ? (
                        <Line key={`ema${p}`} yAxisId="main" type="monotone" dataKey={`ema${p}`} name={`EMA ${p}`} stroke={OVERLAY_COLORS[`EMA_${p}`]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                      ) : null)}
                      {/* PP: Bollinger — Mittellinie=DOT, Bänder=SOLID, Farbe=#C98D44, strokeWidth=2 */}
                      {chartConfig.has('BOLLINGERBANDS') && <>
                        <Line yAxisId="main" type="monotone" dataKey="bbUpper" name="BB Oben" stroke={OVERLAY_COLORS.BOLLINGER_UPPER} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                        <Line yAxisId="main" type="monotone" dataKey="bbMiddle" name="BB Mitte" stroke={OVERLAY_COLORS.BOLLINGER_MIDDLE} strokeWidth={2} strokeDasharray="2 2" dot={false} connectNulls isAnimationActive={false} />
                        <Line yAxisId="main" type="monotone" dataKey="bbLower" name="BB Unten" stroke={OVERLAY_COLORS.BOLLINGER_LOWER} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                      </>}
                      {/* PP: Investitionen-Marker — Kauf=#1AAD21, Verkauf=#FF2B30 */}
                      {!hideMarkers && chartConfig.has('INVESTMENT') && selectedWp?.transaktionen
                        .filter(tx => tx.typ === 'kauf' || tx.typ === 'verkauf' || tx.typ === 'umbuchung_ein' || tx.typ === 'umbuchung_aus')
                        .map((tx, i) => {
                          const d = datumKurz(tx.datum);
                          const matchIdx = kursChartData.findIndex(k => k.datum === d);
                          if (matchIdx < 0) return null;
                          const kursVal = kursChartData[matchIdx]?.kurs as number;
                          const isBuy = tx.typ === 'kauf' || tx.typ === 'umbuchung_ein';
                          return (
                            <ReferenceDot key={`inv-${i}`} x={d} y={kursVal} yAxisId="main"
                              r={0} fill="none" stroke="none"
                              label={{ value: isBuy ? '▲' : '▼', position: isBuy ? 'top' : 'bottom', fill: isBuy ? '#1AAD21' : '#FF2B30', fontSize: 11, fontWeight: 'bold' }} />
                          );
                        })}
                      {/* PP: Dividenden-Marker — Farbe: #8063A8, Quadrat */}
                      {!hideMarkers && chartConfig.has('DIVIDENDS') && selectedWp?.transaktionen
                        .filter(tx => tx.typ === 'dividende' || tx.typ === 'ausschuettung')
                        .map((tx, i) => {
                          const d = datumKurz(tx.datum);
                          const matchIdx = kursChartData.findIndex(k => k.datum === d);
                          if (matchIdx < 0) return null;
                          const kursVal = kursChartData[matchIdx]?.kurs as number;
                          return (
                            <ReferenceDot key={`div-${i}`} x={d} y={kursVal} yAxisId="main"
                              r={0} fill="none" stroke="none"
                              label={{ value: '■', position: 'bottom', fill: '#8063A8', fontSize: 10 }} />
                          );
                        })}
                      {/* PP: Hoch/Tief-Marker — Hoch=#00930F, Tief=#A8272A */}
                      {!hideMarkers && chartConfig.has('EXTREMES') && kursChartData.length > 1 && (() => {
                        const vals = kursChartData.map(k => k.kurs as number);
                        const maxVal = Math.max(...vals);
                        const minVal = Math.min(...vals);
                        const maxIdx = vals.indexOf(maxVal);
                        const minIdx = vals.indexOf(minVal);
                        return <>
                          <ReferenceLine y={maxVal} yAxisId="main" stroke="#00930F" strokeDasharray="3 3" strokeWidth={1} />
                          <ReferenceLine y={minVal} yAxisId="main" stroke="#A8272A" strokeDasharray="3 3" strokeWidth={1} />
                          <ReferenceDot x={kursChartData[maxIdx]?.datum as string} y={maxVal} yAxisId="main"
                            r={0} fill="none" stroke="none"
                            label={{ value: '◆', position: 'top', fill: '#00930F', fontSize: 10 }} />
                          <ReferenceDot x={kursChartData[minIdx]?.datum as string} y={minVal} yAxisId="main"
                            r={0} fill="none" stroke="none"
                            label={{ value: '◆', position: 'bottom', fill: '#A8272A', fontSize: 10 }} />
                        </>;
                      })()}
                      {/* PP: CrosshairTool — vertikale + horizontale Linie via ReferenceLine */}
                      {chartTool === 'crosshair' && crosshairData && <>
                        <ReferenceLine x={crosshairData.datum} yAxisId="main" stroke="#aaa" strokeWidth={1} />
                        <ReferenceLine y={crosshairData.kurs} yAxisId="main" stroke="#aaa" strokeWidth={1}
                          label={{ value: kurs(crosshairData.kurs), position: 'right', fill: '#fff', fontSize: 10 }} />
                        <ReferenceDot x={crosshairData.datum} y={crosshairData.kurs} yAxisId="main"
                          r={4} fill="#4D34EB" stroke="#fff" strokeWidth={1}
                          label={{ value: crosshairData.datum, position: 'insideBottomRight', fill: '#ccc', fontSize: 9 }} />
                      </>}
                      {/* PP: MeasurementTool — Start/End-Punkte + vertikale Hilfslinien */}
                      {chartTool === 'measure' && measureStartData && <>
                        <ReferenceDot x={measureStartData.datum} y={measureStartData.kurs} yAxisId="main"
                          r={5} fill="#4D34EB" stroke="#fff" strokeWidth={1} />
                        <ReferenceLine x={measureStartData.datum} yAxisId="main" stroke="#4D34EB" strokeWidth={1} strokeDasharray="4 2" />
                        {measureEndData && <>
                          <ReferenceDot x={measureEndData.datum} y={measureEndData.kurs} yAxisId="main"
                            r={5} fill="#4D34EB" stroke="#fff" strokeWidth={1}
                            label={{ value: (() => {
                              const d1 = measureStartData.datum, d2 = measureEndData.datum;
                              const k1 = measureStartData.kurs, k2 = measureEndData.kurs;
                              const days = Math.round(Math.abs(new Date(d2.split('.').reverse().join('-')).getTime() - new Date(d1.split('.').reverse().join('-')).getTime()) / 86400000);
                              const diff = k2 - k1;
                              const pct = k1 !== 0 ? ((k2 / k1) - 1) * 100 : 0;
                              return `${days}T | ${diff >= 0 ? '+' : ''}${euro(diff)} | ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
                            })(), position: 'top', fill: '#fff', fontSize: 10 }} />
                          <ReferenceLine x={measureEndData.datum} yAxisId="main" stroke="#4D34EB" strokeWidth={1} strokeDasharray="4 2" />
                          <ReferenceLine y={measureStartData.kurs} yAxisId="main" stroke="#4D34EB" strokeWidth={1} strokeDasharray="2 4" />
                          <ReferenceLine y={measureEndData.kurs} yAxisId="main" stroke="#4D34EB" strokeWidth={1} strokeDasharray="2 4" />
                        </>}
                      </>}
                    </LineChart>
                ) : emptyMsg('Keine Kurshistorie vorhanden')}
                {/* PP: ChartContextMenu — Rechtsklick auf Chart */}
                {chartCtxMenu && (
                  <ContextMenuPopup x={chartCtxMenu.x} y={chartCtxMenu.y} onClose={() => setChartCtxMenu(null)} items={[
                    { label: 'Fadenkreuz', onClick: () => { setChartTool(t => t === 'crosshair' ? 'none' : 'crosshair'); setCrosshairData(null); setMeasureDragging(false); } },
                    { label: 'Abstand messen', onClick: () => { setChartTool(t => t === 'measure' ? 'none' : 'measure'); setMeasureStartData(null); setMeasureEndData(null); setMeasureDragging(false); } },
                    { separator: true },
                    { label: hideMarkers ? 'Markierungen einblenden' : 'Markierungen ausblenden', onClick: () => setHideMarkers(h => !h) },
                    { separator: true },
                    { label: 'Originalgröße', shortcut: '0', onClick: () => setChartInterval('ALL') },
                    { separator: true },
                    { label: 'Diagramm speichern...', onClick: () => {} },
                  ]} />
                )}
              </div>
              {/* SecurityDetailsViewer (rechte Seite — PP: ScrolledComposite) */}
              <div className="overflow-y-auto" style={{ width: 220, minWidth: 180, borderLeft: '1px solid var(--pp-border)', background: 'var(--pp-content-bg)' }}>
                {/* MasterDataFacet: Heading "Wertpapier" → Name, ISIN, Symbol, WKN */}
                <div className="px-2 pt-2 pb-1">
                  <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--pp-text-muted)' }}>Wertpapier</div>
                  <div className="text-[11px]" style={{ color: 'var(--pp-text)' }}>{selectedWp.name}</div>
                  <div className="text-[10px] mono" style={{ color: 'var(--pp-text-muted)' }}>{selectedWp.isin || ' '}</div>
                  <div className="text-[10px] mono" style={{ color: 'var(--pp-text-muted)' }}>{selectedWp.symbol || ' '}</div>
                  <div className="text-[10px] mono" style={{ color: 'var(--pp-text-muted)' }}>{selectedWp.wkn || ' '}</div>
                </div>
                <div style={{ height: 1, background: 'var(--pp-border)', margin: '2px 8px' }} />
                {/* LatestQuoteFacet: Heading "Letzter Kurs" → Kurs, Datum, Tageshoch, Tagestief, Volumen */}
                <div className="px-2 pt-1 pb-1">
                  <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--pp-text-muted)' }}>Letzter Kurs</div>
                  <div className="flex justify-between text-[10px]">
                    <span style={{ color: 'var(--pp-text-muted)' }}>Letzter Kurs</span>
                    <span className="mono" style={{ color: 'var(--pp-text)' }}>{selectedWp.letzterKurs != null ? kurs(selectedWp.letzterKurs) : '—'}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span style={{ color: 'var(--pp-text-muted)' }}>Letzter Handel</span>
                    <span className="mono" style={{ color: 'var(--pp-text)' }}>{selectedWp.letzterKursDatum ? datumKurz(selectedWp.letzterKursDatum) : '—'}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span style={{ color: 'var(--pp-text-muted)' }}>Tageshoch</span>
                    <span className="mono" style={{ color: 'var(--pp-text)' }}>—</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span style={{ color: 'var(--pp-text-muted)' }}>Tagestief</span>
                    <span className="mono" style={{ color: 'var(--pp-text)' }}>—</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span style={{ color: 'var(--pp-text-muted)' }}>Volumen</span>
                    <span className="mono" style={{ color: 'var(--pp-text)' }}>—</span>
                  </div>
                </div>
                {/* NoteFacet */}
                <div style={{ height: 1, background: 'var(--pp-border)', margin: '2px 8px' }} />
                <div className="px-2 pt-1 pb-2">
                  <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--pp-text-muted)' }}>Notiz</div>
                  <div className="text-[10px]" style={{ color: 'var(--pp-text)' }}>{' '}</div>
                </div>
              </div>
            </div>
          </>)}

          {/* ══════ O: Historische Kurse ══════ */}
          {detailTab === 'historische-kurse' && (<>
            <DetailToolbar>
              <button className="pp-toolbar-btn ml-auto" title="Daten exportieren" onClick={exportHistCSV}><Download size={12} /></button>
            </DetailToolbar>
            {selectedWp.kursHistorie?.length ? (() => {
              const reversed = [...selectedWp.kursHistorie].reverse().slice(0, 2000);
              const rows = reversed.map((k, i, arr) => ({
                idx: i, datum: k.datum, kurs: k.kurs,
                hasGap: i < arr.length - 1 && (arr[i].datum.getTime() - arr[i + 1].datum.getTime()) / 86400000 > 4,
              }));
              const sorted = histKurseCfg.sortData(rows, (r, id) => id === 'datum' ? r.datum.getTime() : r.kurs);
              return (
                <table className="pp-table">
                  <thead><tr>
                    {histKurseCfg.orderedColumns.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={histKurseCfg} />)}
                  </tr></thead>
                  <tbody>
                    {sorted.map(r => (
                      <tr key={r.idx} className="pp-row" style={{ background: r.hasGap ? 'rgba(254,223,107,0.3)' : undefined }}
                        onContextMenu={e => { e.preventDefault(); setHistCtx({ x: e.clientX, y: e.clientY, idx: r.idx }); }}>
                        {histKurseCfg.orderedColumns.map(c => (
                          <td key={c.id} className={c.align === 'right' ? 'right mono' : 'mono'}>
                            {c.id === 'datum' ? datumKurz(r.datum) : kurs(r.kurs)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })() : emptyMsg('Keine Kurshistorie vorhanden')}
          </>)}

          {/* ══════ P: Umsätze ══════ */}
          {detailTab === 'umsaetze' && (<>
            <DetailToolbar>
              <div className="flex items-center gap-1 px-1" style={{ background: 'var(--pp-sidebar-bg)', borderRadius: 3, border: '1px solid var(--pp-border)' }}>
                <Search size={10} style={{ color: 'var(--pp-text-muted)' }} />
                <input type="text" placeholder="Suchen" value={txSearch} onChange={e => setTxSearch(e.target.value)}
                  className="bg-transparent border-none outline-none text-[10px] w-[200px]" style={{ color: 'var(--pp-text)' }} />
              </div>
              <div style={{ width: 1, height: 14, background: 'var(--pp-border)', margin: '0 4px' }} />
              <select value={txTypeFilter} onChange={e => setTxTypeFilter(e.target.value)}
                className="text-[10px] rounded px-1 py-0.5" style={{ background: 'var(--pp-sidebar-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }}>
                <option value="alle">Alle Buchungstypen</option>
                {Object.entries(TX_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className="pp-toolbar-btn ml-auto" title="Daten exportieren" onClick={exportTxCSV}><Download size={12} /></button>
            </DetailToolbar>
            {filteredTx.length > 0 ? (() => {
              const txSortVal = (tx: Transaktion, id: string): number | string | null => {
                switch (id) {
                  case 'datum': return tx.datum.getTime();
                  case 'typ': return TX_LABELS[tx.typ] ?? tx.typ;
                  case 'wertpapier': return tx.wertpapierName;
                  case 'stueck': return tx.stueck;
                  case 'kurs': return tx.kurs;
                  case 'betrag': return tx.betrag;
                  case 'gebuehren': return tx.gebuehren;
                  case 'steuern': return tx.steuern;
                  case 'gesamtpreis': return tx.betrag - tx.gebuehren - tx.steuern;
                  case 'konto': return tx.kontoName || tx.depotName || '';
                  case 'gegenkonto': return tx.gegenkontoName || '';
                  case 'notiz': return tx.notiz || '';
                  case 'quelle': return tx.quelle || '';
                  default: return null;
                }
              };
              const txCell = (tx: Transaktion, id: string): React.ReactNode => {
                switch (id) {
                  case 'datum': return datumKurz(tx.datum);
                  case 'typ': return TX_LABELS[tx.typ] ?? tx.typ;
                  case 'wertpapier': return tx.wertpapierName;
                  case 'stueck': return tx.stueck > 0 ? stueck(tx.stueck) : '';
                  case 'kurs': return tx.kurs > 0 ? euro(tx.kurs) : '';
                  case 'betrag': return (
                    <span style={{ color: (tx.typ === 'kauf' || tx.typ === 'umbuchung_ein') ? 'var(--pp-red-text)' : (tx.typ === 'verkauf' || tx.typ === 'dividende' || tx.typ === 'ausschuettung') ? 'var(--pp-green-text)' : undefined }}>
                      {euro(tx.betrag)}
                    </span>
                  );
                  case 'gebuehren': return <span style={{ color: tx.gebuehren > 0 ? 'var(--pp-red-text)' : '' }}>{tx.gebuehren > 0 ? euro(tx.gebuehren) : ''}</span>;
                  case 'steuern': return <span style={{ color: tx.steuern > 0 ? 'var(--pp-red-text)' : '' }}>{tx.steuern > 0 ? euro(tx.steuern) : ''}</span>;
                  case 'gesamtpreis': return euro(tx.betrag - tx.gebuehren - tx.steuern);
                  case 'konto': return <span style={{ color: 'var(--pp-text-muted)' }}>{tx.kontoName || tx.depotName || ''}</span>;
                  case 'gegenkonto': return <span style={{ color: 'var(--pp-text-muted)' }}>{tx.gegenkontoName || ''}</span>;
                  case 'notiz': return <span style={{ color: 'var(--pp-text-muted)' }}>{tx.notiz || ''}</span>;
                  case 'quelle': return <span style={{ color: 'var(--pp-text-muted)' }}>{tx.quelle || ''}</span>;
                  default: return '';
                }
              };
              return (
                <table className="pp-table">
                  <thead><tr>
                    {umsaetzeCfg.orderedColumns.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={umsaetzeCfg} />)}
                  </tr></thead>
                  <tbody>
                    {umsaetzeCfg.sortData(filteredTx, txSortVal).map(tx => (
                      <tr key={tx.id} className="pp-row"
                        onContextMenu={e => { e.preventDefault(); setTxCtx({ x: e.clientX, y: e.clientY, tx }); }}>
                        {umsaetzeCfg.orderedColumns.map(c => (
                          <td key={c.id} className={c.align === 'right' ? 'right mono' : c.id === 'datum' ? 'mono' : undefined}>
                            {txCell(tx, c.id)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })() : emptyMsg('Keine Umsätze vorhanden')}
          </>)}

          {/* ══════ Q: Trades ══════ */}
          {detailTab === 'trades' && (<>
            <DetailToolbar>
              <button className="pp-toolbar-btn ml-auto" title="Daten exportieren" onClick={exportTradesCSV}><Download size={12} /></button>
            </DetailToolbar>
            {trades.length > 0 ? (() => {
              const tradeSortVal = (t: Trade, id: string): number | string | null => {
                switch (id) {
                  case 'startdatum': return t.startDatum.getTime();
                  case 'enddatum': return t.endDatum ? t.endDatum.getTime() : null;
                  case 'stueck': return t.stueck;
                  case 'einstandswert': return t.einstandswert;
                  case 'verkaufswert': return t.verkaufswert ?? null;
                  case 'gewinn': return t.gewinn ?? null;
                  case 'haltedauer': return t.haltedauer ?? null;
                  case 'irr': return t.gewinnPct ?? null;
                  default: return null;
                }
              };
              const tradeCell = (t: Trade, id: string): React.ReactNode => {
                switch (id) {
                  case 'startdatum': return datumKurz(t.startDatum);
                  case 'enddatum': return t.endDatum ? datumKurz(t.endDatum) : 'Offener Trade';
                  case 'stueck': return stueck(t.stueck);
                  case 'einstandswert': return euro(t.einstandswert);
                  case 'verkaufswert': return t.verkaufswert != null ? euro(t.verkaufswert) : '';
                  case 'gewinn': return (
                    <span style={{ color: t.gewinn != null ? (t.gewinn >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)') : '' }}>
                      {t.gewinn != null ? euro(t.gewinn) : ''}
                    </span>
                  );
                  case 'haltedauer': return t.haltedauer != null ? `${t.haltedauer}` : '';
                  case 'irr': return t.gewinnPct != null ? prozent(t.gewinnPct / 100) : '';
                  default: return '';
                }
              };
              return (
                <table className="pp-table">
                  <thead><tr>
                    {tradesCfg.orderedColumns.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={tradesCfg} />)}
                  </tr></thead>
                  <tbody>
                    {tradesCfg.sortData(trades, tradeSortVal).map((t, i) => (
                      <tr key={i} className="pp-row">
                        {tradesCfg.orderedColumns.map(c => (
                          <td key={c.id} className={c.align === 'right' ? 'right mono' : 'mono'}
                            style={c.id === 'enddatum' && t.offen ? { background: 'rgba(254,223,107,0.3)' } : undefined}>
                            {tradeCell(t, c.id)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })() : emptyMsg('Keine Trades vorhanden')}
          </>)}

          {/* ══════ R: Ereignisse ══════ */}
          {detailTab === 'ereignisse' && (<>
            <DetailToolbar>
              <button className="pp-toolbar-btn" title="Ereignis hinzufügen" onClick={() => {}}><Plus size={12} /></button>
              <button className="pp-toolbar-btn ml-auto" title="CSV Export" onClick={exportEventsCSV}><Download size={12} /></button>
            </DetailToolbar>
            {events.length > 0 ? (() => {
              type EventRow = typeof events[number];
              const evSortVal = (ev: EventRow, id: string): number | string | null => {
                switch (id) {
                  case 'datum': return ev.datum.getTime();
                  case 'typ': return ev.typ;
                  case 'zahltag': return ev.datum.getTime();
                  case 'betrag': return ev.betrag;
                  case 'details': return ev.notiz;
                  default: return null;
                }
              };
              const evCell = (ev: EventRow, id: string): React.ReactNode => {
                switch (id) {
                  case 'datum': return datumKurz(ev.datum);
                  case 'typ': return ev.typ;
                  case 'zahltag': return datumKurz(ev.datum);
                  case 'betrag': return <span style={{ color: 'var(--pp-green-text)' }}>{euro(ev.betrag)}</span>;
                  case 'details': return <span style={{ color: 'var(--pp-text-muted)' }}>{ev.notiz}</span>;
                  default: return '';
                }
              };
              const sortedEvents = ereignisseCfg.sortData(events.map((ev, i) => ({ ...ev, _i: i })), evSortVal);
              return (
                <table className="pp-table">
                  <thead><tr>
                    {ereignisseCfg.orderedColumns.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={ereignisseCfg} />)}
                  </tr></thead>
                  <tbody>
                    {sortedEvents.map(ev => (
                      <tr key={ev._i} className="pp-row"
                        onContextMenu={e => { e.preventDefault(); setEventCtx({ x: e.clientX, y: e.clientY, idx: ev._i }); }}>
                        {ereignisseCfg.orderedColumns.map(c => (
                          <td key={c.id} className={c.align === 'right' ? 'right mono' : (c.id === 'datum' || c.id === 'zahltag') ? 'mono' : undefined}>
                            {evCell(ev, c.id)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })() : emptyMsg('Keine Ereignisse vorhanden')}
          </>)}

          {/* ══════ S: Datenqualität ══════ */}
          {detailTab === 'datenqualitaet' && selectedWp && (
            <div className="p-3">
              {dqMetrics && (<>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <div className="text-[10px]" style={{ color: 'var(--pp-text-muted)' }}>Vollständigkeit</div>
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--pp-text)' }}>{dqMetrics.vollstaendigkeit.toFixed(1)} %</div>
                  </div>
                  <div>
                    <div className="text-[10px]" style={{ color: 'var(--pp-text-muted)' }}>Handelskalender</div>
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--pp-text)' }}>Standard (Mo–Fr)</div>
                  </div>
                  <div>
                    <div className="text-[10px]" style={{ color: 'var(--pp-text-muted)' }}>Prüfzeitraum</div>
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--pp-text)' }}>{datumKurz(dqMetrics.erster)} – {datumKurz(dqMetrics.letzter)}</div>
                  </div>
                </div>
                {/* S5+S6: Zwei Tabellen nebeneinander — PP: FormLayout 50%/50% */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--pp-text)' }}>
                      Fehlende Kurse ({dqMetrics.fehlendeDaten.length})
                    </div>
                    <div className="overflow-auto" style={{ maxHeight: 300 }}>
                      <table className="pp-table">
                        <thead><tr>
                          {fehlendeCfg.orderedColumns.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={fehlendeCfg} />)}
                        </tr></thead>
                        <tbody>
                          {fehlendeCfg.sortData(dqMetrics.fehlendeDaten.slice(0, 200), d => d.getTime()).map((d, i) => (
                            <tr key={i} className="pp-row"
                              onContextMenu={e => { e.preventDefault(); setPriceDialog({ wp: selectedWp, defaultDate: d }); }}>
                              <td className="mono">{datumKurz(d)}</td>
                            </tr>
                          ))}
                          {dqMetrics.fehlendeDaten.length === 0 && <tr className="pp-row"><td style={{ color: 'var(--pp-text-muted)' }}>Keine fehlenden Kurse</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--pp-text)' }}>
                      Unerwartete Kurse ({dqMetrics.unerwarteteDaten.length})
                    </div>
                    <div className="overflow-auto" style={{ maxHeight: 300 }}>
                      <table className="pp-table">
                        <thead><tr>
                          {unerwarteteCfg.orderedColumns.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={unerwarteteCfg} />)}
                        </tr></thead>
                        <tbody>
                          {unerwarteteCfg.sortData(dqMetrics.unerwarteteDaten.slice(0, 200), d => d.getTime()).map((d, i) => (
                            <tr key={i} className="pp-row"><td className="mono">{datumKurz(d)}</td></tr>
                          ))}
                          {dqMetrics.unerwarteteDaten.length === 0 && <tr className="pp-row"><td style={{ color: 'var(--pp-text-muted)' }}>Keine unerwarteten Kurse</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>)}
              {!dqMetrics && emptyMsg('Keine Kurshistorie vorhanden')}
            </div>
          )}
        </div>
      </>) : emptyMsg('Kein Wertpapier ausgewählt')}
    </div>

    {/* Hist. Kurse Kontextmenü (O6-O10) */}
    {histCtx && selectedWp && (
      <ContextMenuPopup x={histCtx.x} y={histCtx.y} onClose={() => setHistCtx(null)} items={[
        { label: 'Kurs hinzufügen...', onClick: () => setPriceDialog({ wp: selectedWp }) },
        { separator: true },
        { label: 'Kurs löschen', onClick: () => {} },
        { label: 'Alle Kurse löschen', onClick: () => {} },
      ] as MenuEntry[]} />
    )}

    {/* Umsätze Kontextmenü (P8) */}
    {txCtx && (
      <ContextMenuPopup x={txCtx.x} y={txCtx.y} onClose={() => setTxCtx(null)} items={[
        { label: 'Bearbeiten', shortcut: 'Strg+E', onClick: () => {} },
        { label: 'Duplizieren', shortcut: 'Strg+D', onClick: () => {
          const dup = { ...txCtx.tx, id: crypto.randomUUID() };
          onImportTransaktionen([dup]);
        }},
        { separator: true },
        { label: 'Löschen', danger: true, onClick: () => onDeleteTransaktion(txCtx.tx.id) },
      ] as MenuEntry[]} />
    )}

    {/* Ereignisse Kontextmenü (R8-R10) */}
    {eventCtx && (
      <ContextMenuPopup x={eventCtx.x} y={eventCtx.y} onClose={() => setEventCtx(null)} items={[
        { label: 'Ereignis hinzufügen', onClick: () => {} },
        { separator: true },
        { label: 'Löschen', danger: true, onClick: () => {} },
      ] as MenuEntry[]} />
    )}

    {/* Dialoge */}
    {priceDialog && <PriceDialog defaultDate={priceDialog.defaultDate} onClose={() => setPriceDialog(null)} onSave={(_datum, _kurs) => { /* TODO: add price to kursHistorie */ }} />}
  </>);
}
