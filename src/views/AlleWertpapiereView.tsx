import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { ReportingPeriodDialog } from '../components/ReportingPeriodDialog';
import { SplitPane } from '../components/SplitPane';
import { Toolbar, TabBar, ColorMarker, getColor, ValueArrow, WERTPAPIER_FILTER, type FilterOption } from '../components/PPElements';
import { useColumnConfig, ColumnHeader, type ColumnDef } from '../components/useColumnConfig';
import { euro, kurs, stueck, datumKurz, prozent } from '../utils/format';
import type { Wertpapier, Transaktion, Klassifizierung, Taxonomie, KursEintrag } from '../types/portfolio';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot } from 'recharts';

import { Download, Plus, SquarePlus, Search, Crosshair, Ruler, EyeOff, Eye, RefreshCw } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Hilfsfunktionen
   ═══════════════════════════════════════════════════════════════════════ */

const TX_LABELS: Record<string, string> = {
  kauf: 'Kauf', verkauf: 'Verkauf', dividende: 'Dividende', ausschuettung: 'Ausschüttung',
  einlage: 'Einlage', entnahme: 'Entnahme', zinsen: 'Zinsen', gebuehren: 'Gebühren',
  steuern_tx: 'Steuern', steuererstattung: 'Steuererstattung',
  umbuchung_ein: 'Einlieferung', umbuchung_aus: 'Auslieferung',
};

// PP: Security.getLatestTwoSecurityPrices() + SecuritiesTable.addDeltaColumn()
// Kombiniert kursHistorie + letzterKurs (wie PP: prices + latest),
// sucht rückwärts den letzten Kurs ≤ heute und den davor.
function getKursChange(wp: Wertpapier): { pct: number; abs: number } | null {
  const hist = wp.kursHistorie ?? [];
  // PP: getPricesIncludingLatest() — latest einfügen falls Datum nicht schon existiert
  const list: KursEintrag[] = [...hist];
  if (wp.letzterKurs != null && wp.letzterKursDatum) {
    const latestDate = new Date(wp.letzterKursDatum);
    const latestDateStr = latestDate.toISOString().slice(0, 10);
    const exists = list.some(k => {
      const kd = k.datum.toISOString().slice(0, 10);
      return kd === latestDateStr;
    });
    if (!exists) {
      list.push({ datum: latestDate, kurs: wp.letzterKurs });
      list.sort((a, b) => a.datum.getTime() - b.datum.getTime());
    }
  }
  if (list.length < 2) return null;
  // PP: getLatestTwoSecurityPrices() — rückwärts letzten ≤ heute finden
  const todayStr = new Date().toISOString().slice(0, 10);
  let idx = list.length - 1;
  while (idx >= 0) {
    const d = list[idx].datum.toISOString().slice(0, 10);
    if (d <= todayStr) break;
    idx--;
  }
  if (idx < 1) return null;
  const curr = list[idx].kurs;
  const prev = list[idx - 1].kurs;
  if (prev === 0) return null;
  return { pct: ((curr - prev) / prev) * 100, abs: curr - prev };
}

function isDateOld(d?: Date): boolean {
  if (!d) return false;
  return (Date.now() - d.getTime()) > 7 * 86400000;
}

function downloadCSV(filename: string, header: string, rows: string[]) {
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

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
   Datenqualität-Metriken (PP: QuoteQualityMetrics)
   ═══════════════════════════════════════════════════════════════════════ */
interface DQMetrics {
  erster: Date; letzter: Date; anzahl: number; erwartet: number;
  vollstaendigkeit: number;
  fehlendeDaten: Date[];
  unerwarteteDaten: Date[];
}

function computeDQMetrics(kursHistorie: { datum: Date; kurs: number }[]): DQMetrics | null {
  if (!kursHistorie?.length) return null;
  const h = kursHistorie;
  const erster = h[0].datum;
  const letzter = h[h.length - 1].datum;
  const tage = Math.round((letzter.getTime() - erster.getTime()) / 86400000);
  const handelstage = Math.round(tage * 5 / 7);
  const vollstaendigkeit = handelstage > 0 ? (h.length / handelstage) * 100 : 100;

  const kursDaten = new Set(h.map(k => k.datum.toISOString().slice(0, 10)));
  const fehlendeDaten: Date[] = [];
  const unerwarteteDaten: Date[] = [];
  const d = new Date(erster);
  while (d <= letzter) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    const isWeekday = dow >= 1 && dow <= 5;
    if (isWeekday && !kursDaten.has(iso)) fehlendeDaten.push(new Date(d));
    if (!isWeekday && kursDaten.has(iso)) unerwarteteDaten.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  return { erster, letzter, anzahl: h.length, erwartet: handelstage, vollstaendigkeit, fehlendeDaten, unerwarteteDaten };
}

/* ═══════════════════════════════════════════════════════════════════════
   Generisches Kontextmenü (wiederverwendbar für alle Detail-Tabs)
   PP: MenuManager mit Submenu-Support
   ═══════════════════════════════════════════════════════════════════════ */
interface MenuItem { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; shortcut?: string }
interface MenuSub { label: string; children: MenuEntry[] }
interface MenuSep { separator: true }
type MenuEntry = MenuItem | MenuSep | MenuSub;

function isSubmenu(e: MenuEntry): e is MenuSub { return 'children' in e; }

function ContextMenuPopup({ x, y, items, onClose }: { x: number; y: number; items: MenuEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [subPos, setSubPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  useEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    if (r.right > window.innerWidth) ref.current.style.left = `${Math.max(0, window.innerWidth - r.width - 4)}px`;
    if (r.bottom > window.innerHeight) ref.current.style.top = `${Math.max(0, window.innerHeight - r.height - 4)}px`;
  }, []);
  const itemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', color: 'var(--pp-text)', background: 'transparent', border: 'none', width: '100%', textAlign: 'left', fontSize: 11 };
  const hover = (e: React.MouseEvent<HTMLButtonElement>) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--pp-selected-bg)'; };
  const unhover = (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'transparent');
  return (
    <div ref={ref} className="fixed z-[100] py-1 rounded shadow-lg" style={{ left: x, top: y, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', minWidth: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
      {items.map((item, i) => {
        if ('separator' in item) return <div key={i} style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />;
        if (isSubmenu(item)) {
          return (
            <div key={i} style={{ position: 'relative' }}
              onMouseEnter={e => { setOpenSub(i); const r = e.currentTarget.getBoundingClientRect(); setSubPos({ x: r.right - 2, y: r.top }); }}
              onMouseLeave={() => setOpenSub(null)}>
              <button style={{ ...itemStyle }} onMouseEnter={hover} onMouseLeave={unhover}>
                {item.label}
                <span className="ml-auto" style={{ fontSize: 9, color: 'var(--pp-text-muted)' }}>&#9654;</span>
              </button>
              {openSub === i && item.children.length > 0 && (
                <div className="fixed z-[101] py-1 rounded shadow-lg" style={{ left: subPos.x, top: subPos.y, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', minWidth: 180, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                  {item.children.map((sub, j) => {
                    if ('separator' in sub) return <div key={j} style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />;
                    if (isSubmenu(sub)) return null;
                    return (
                      <button key={j} style={{ ...itemStyle, color: sub.disabled ? 'var(--pp-text-disabled)' : sub.danger ? 'var(--pp-red-text)' : 'var(--pp-text)', cursor: sub.disabled ? 'default' : 'pointer' }}
                        disabled={sub.disabled} onMouseEnter={hover} onMouseLeave={unhover}
                        onClick={() => { sub.onClick(); onClose(); }}>
                        {sub.label}
                        {sub.shortcut && <span className="ml-auto text-[10px]" style={{ color: 'var(--pp-text-muted)' }}>{sub.shortcut}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }
        return (
          <button key={i} style={{ ...itemStyle, color: item.danger ? 'var(--pp-red-text)' : item.disabled ? 'var(--pp-text-disabled)' : 'var(--pp-text)', cursor: item.disabled ? 'default' : 'pointer' }}
            disabled={item.disabled} onMouseEnter={hover} onMouseLeave={unhover}
            onClick={() => { item.onClick(); onClose(); }}>
            {item.label}
            {item.shortcut && <span className="ml-auto text-[10px]" style={{ color: 'var(--pp-text-muted)' }}>{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}

// PP: ClientSettings.getDefaultBookmarks() — 1:1 aus ClientSettings.java
const PP_DEFAULT_BOOKMARKS = [
  { label: 'finance.yahoo.com', url: 'https://finance.yahoo.com/quote/{tickerSymbol}' },
  { label: 'onvista.de', url: 'https://www.onvista.de/suche.html?SEARCH_VALUE={isin}' },
  { label: 'finanzen.net', url: 'https://www.finanzen.net/suchergebnis.asp?frmAktiensucheTextfeld={isin}' },
  { label: 'ariva.de', url: 'https://www.ariva.de/{isin}' },
  { label: 'justetf.com  (ETF)', url: 'https://www.justetf.com/etf-profile.html?isin={isin}' },
  { label: 'fondsweb.com', url: 'https://www.fondsweb.com/{isin}' },
  { label: 'morningstar.de', url: 'https://www.morningstar.de/de/funds/SecuritySearchResults.aspx?type=ALL&search={isin}' },
  { label: 'extraETF.com (ETF)', url: 'https://extraetf.com/etf-profile/{isin}' },
  { label: 'alleaktien.de (Aktie)', url: 'https://www.alleaktien.de/data/{isin}' },
  { label: 'comdirect.de (Aktie)', url: 'https://www.comdirect.de/inf/aktien/{isin}' },
  { label: 'comdirect.de (ETF)', url: 'https://www.comdirect.de/inf/etfs/{isin}' },
  { label: 'divvydiary.com', url: 'https://divvydiary.com/symbols/{isin}' },
  { label: 'trackingdifferences.com (ETF)', url: 'https://www.trackingdifferences.com/ETF/ISIN/{isin}' },
  { label: 'tradingview.com', url: 'https://www.tradingview.com/chart/?symbol={tickerSymbolPrefix}' },
  { label: 'cnbc.com (Aktie)', url: 'https://www.cnbc.com/quotes/{tickerSymbolPrefix}' },
  { label: 'nasdaq.com (Aktie)', url: 'https://www.nasdaq.com/market-activity/stocks/{tickerSymbolPrefix}' },
  { label: 'aktienfinder.net (Aktie)', url: 'https://aktienfinder.net/aktien-profil/{isin}' },
  { label: 'aktien.guide (Aktie)', url: 'http://aktien.guide/isin/aktien/{isin}' },
];

function buildBookmarkUrl(template: string, wp: Wertpapier): string {
  const tickerPrefix = (wp.symbol || '').split('.')[0];
  return template
    .replace('{isin}', encodeURIComponent(wp.isin || ''))
    .replace('{tickerSymbol}', encodeURIComponent(wp.symbol || ''))
    .replace('{tickerSymbolPrefix}', encodeURIComponent(tickerPrefix))
    .replace('{name}', encodeURIComponent(wp.name || ''));
}

/* ═══════════════════════════════════════════════════════════════════════
   Simpler Transaktions-Dialog (PP: SecurityTransactionDialog)
   ═══════════════════════════════════════════════════════════════════════ */
function TransactionDialog({ wp, typ, onClose, onSave }: {
  wp: Wertpapier;
  typ: string;
  onClose: () => void;
  onSave: (tx: Partial<Transaktion>) => void;
}) {
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [stueckVal, setStueckVal] = useState('');
  const [kursVal, setKursVal] = useState('');
  const [gebuehrenVal, setGebuehrenVal] = useState('0');
  const [steuernVal, setSteuernVal] = useState('0');
  const [notizVal, setNotizVal] = useState('');

  const title = TX_LABELS[typ] ?? typ;
  const needsShares = ['kauf', 'verkauf', 'umbuchung_ein', 'umbuchung_aus'].includes(typ);
  const needsKurs = needsShares;

  const handleSave = () => {
    const s = parseFloat(stueckVal) || 0;
    const k = parseFloat(kursVal) || 0;
    const betrag = needsShares ? s * k : parseFloat(stueckVal) || 0;
    onSave({
      datum: new Date(datum), typ: typ as Transaktion['typ'],
      stueck: needsShares ? s : 0,
      kurs: needsKurs ? k : 0,
      betrag: betrag > 0 ? betrag : parseFloat(kursVal) || 0,
      gebuehren: parseFloat(gebuehrenVal) || 0,
      steuern: parseFloat(steuernVal) || 0,
      notiz: notizVal || undefined,
      isin: wp.isin, wertpapierName: wp.name, waehrung: wp.waehrung,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="rounded-lg shadow-xl p-4" style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', minWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="text-[13px] font-semibold mb-3" style={{ color: 'var(--pp-text)' }}>{title}: {wp.name}</div>
        <div className="space-y-2 text-[11px]">
          <label className="flex items-center gap-2" style={{ color: 'var(--pp-text)' }}>
            <span className="w-20">Datum</span>
            <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
              className="flex-1 rounded px-2 py-1" style={{ background: 'var(--pp-sidebar-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }} />
          </label>
          {needsShares && (
            <label className="flex items-center gap-2" style={{ color: 'var(--pp-text)' }}>
              <span className="w-20">Stück</span>
              <input type="number" step="any" value={stueckVal} onChange={e => setStueckVal(e.target.value)} placeholder="0"
                className="flex-1 rounded px-2 py-1" style={{ background: 'var(--pp-sidebar-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }} />
            </label>
          )}
          <label className="flex items-center gap-2" style={{ color: 'var(--pp-text)' }}>
            <span className="w-20">{needsKurs ? 'Kurs' : 'Betrag'}</span>
            <input type="number" step="any" value={kursVal} onChange={e => setKursVal(e.target.value)} placeholder="0,00"
              className="flex-1 rounded px-2 py-1" style={{ background: 'var(--pp-sidebar-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }} />
          </label>
          <label className="flex items-center gap-2" style={{ color: 'var(--pp-text)' }}>
            <span className="w-20">Gebühren</span>
            <input type="number" step="any" value={gebuehrenVal} onChange={e => setGebuehrenVal(e.target.value)}
              className="flex-1 rounded px-2 py-1" style={{ background: 'var(--pp-sidebar-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }} />
          </label>
          <label className="flex items-center gap-2" style={{ color: 'var(--pp-text)' }}>
            <span className="w-20">Steuern</span>
            <input type="number" step="any" value={steuernVal} onChange={e => setSteuernVal(e.target.value)}
              className="flex-1 rounded px-2 py-1" style={{ background: 'var(--pp-sidebar-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }} />
          </label>
          <label className="flex items-center gap-2" style={{ color: 'var(--pp-text)' }}>
            <span className="w-20">Notiz</span>
            <input type="text" value={notizVal} onChange={e => setNotizVal(e.target.value)}
              className="flex-1 rounded px-2 py-1" style={{ background: 'var(--pp-sidebar-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }} />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1 rounded text-[11px]" style={{ color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }}>Abbrechen</button>
          <button onClick={handleSave} className="px-3 py-1 rounded text-[11px] font-semibold" style={{ background: 'var(--pp-accent)', color: '#fff', border: 'none' }}>Speichern</button>
        </div>
      </div>
    </div>
  );
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
   Wertpapier bearbeiten Dialog (PP: EditSecurityDialog)
   ═══════════════════════════════════════════════════════════════════════ */
function EditSecurityDialog({ wp, onClose, onSave }: {
  wp: Wertpapier;
  onClose: () => void;
  onSave: (patch: Partial<Wertpapier>) => void;
}) {
  const [name, setName] = useState(wp.name);
  const [isin, setIsin] = useState(wp.isin);
  const [symbol, setSymbol] = useState(wp.symbol ?? '');
  const [wkn, setWkn] = useState(wp.wkn ?? '');
  const [feed, setFeed] = useState(wp.feed ?? '');
  const [feedUrl, setFeedUrl] = useState(wp.feedUrl ?? '');
  const [isInaktiv, setIsInaktiv] = useState(wp.istInaktiv ?? false);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="rounded-lg shadow-xl p-4" style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', minWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="text-[13px] font-semibold mb-3" style={{ color: 'var(--pp-text)' }}>Wertpapier bearbeiten</div>
        <div className="space-y-2 text-[11px]">
          {[
            ['Name', name, setName],
            ['ISIN', isin, setIsin],
            ['Symbol', symbol, setSymbol],
            ['WKN', wkn, setWkn],
            ['Kursfeed', feed, setFeed],
            ['Feed-URL', feedUrl, setFeedUrl],
          ].map(([label, val, setter]) => (
            <label key={label as string} className="flex items-center gap-2" style={{ color: 'var(--pp-text)' }}>
              <span className="w-24">{label as string}</span>
              <input type="text" value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)}
                className="flex-1 rounded px-2 py-1" style={{ background: 'var(--pp-sidebar-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }} />
            </label>
          ))}
          <label className="flex items-center gap-2" style={{ color: 'var(--pp-text)' }}>
            <span className="w-24">Inaktiv</span>
            <input type="checkbox" checked={isInaktiv} onChange={e => setIsInaktiv(e.target.checked)} style={{ accentColor: 'var(--pp-accent)' }} />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1 rounded text-[11px]" style={{ color: 'var(--pp-text)', border: '1px solid var(--pp-border)' }}>Abbrechen</button>
          <button onClick={() => { onSave({ name, isin, symbol: symbol || undefined, wkn: wkn || undefined, feed: feed || undefined, feedUrl: feedUrl || undefined, istInaktiv: isInaktiv }); onClose(); }}
            className="px-3 py-1 rounded text-[11px] font-semibold" style={{ background: 'var(--pp-accent)', color: '#fff', border: 'none' }}>Speichern</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Neues Wertpapier Dropdown (PP: SecurityListView.addButtons → CreateMenu)
   ═══════════════════════════════════════════════════════════════════════ */
/* PP: ConfigurationStore.createToolBarItems
   Pro Config: DropDown(config.getName(), active ? VIEW_SELECTED : VIEW)
     - defaultAction = activate(config)
     - menuListener → Anzeigen (wenn nicht aktiv) | sep | Duplizieren | Umbenennen | Löschen | sep + Nach vorne (wenn index > 0)
   Am Ende: SimpleAction mit VIEW_PLUS → createNew(null) */
function ViewConfigButtons({ storageKey, onActiveChange }: { storageKey: string; onActiveChange?: (name: string) => void }) {
  const configsKey = `pp-view-configs-${storageKey}`;
  const [configs, setConfigs] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(configsKey);
      return raw ? JSON.parse(raw) : ['Standard'];
    } catch { return ['Standard']; }
  });
  const [active, setActive] = useState(() => configs[0] || 'Standard');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(configsKey, JSON.stringify(configs)); } catch { /* */ }
  }, [configs, configsKey]);

  useEffect(() => {
    if (!menuFor) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenuFor(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuFor]);

  const activate = (c: string) => { setActive(c); onActiveChange?.(c); };

  const createNew = (baseName: string | null) => {
    const defaultName = baseName ? baseName + ' (Kopie)' : 'Neue Ansicht';
    const name = prompt('Name der neuen Konfiguration:', defaultName);
    if (name) { setConfigs(p => [...p, name]); activate(name); }
  };

  const miStyle: React.CSSProperties = { color: 'var(--pp-text)', background: 'transparent', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: '3px 12px', fontSize: 11 };
  const hi = (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'var(--pp-selected-bg)');
  const ho = (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'transparent');

  return (
    <div ref={ref} className="flex items-center gap-1">
      {configs.map((c, idx) => {
        const isActive = c === active;
        return (
          <div key={c} className="relative">
            {/* PP DropDown(SWT.DROP_DOWN): single button, click text = activate, click ▼ area = menu */}
            <button className="flex items-center gap-1 px-2 py-0.5 text-[11px]"
              style={{
                background: isActive ? 'var(--pp-accent)' : 'var(--pp-sidebar-bg)',
                color: isActive ? '#fff' : 'var(--pp-text)',
                border: '1px solid var(--pp-border)', borderRadius: 3, cursor: 'pointer',
              }}
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const arrowZone = rect.right - 16;
                if (e.clientX >= arrowZone) {
                  setMenuFor(menuFor === c ? null : c);
                } else {
                  activate(c);
                }
              }}>
              <span style={{ width: 7, height: 7, borderRadius: 1, background: isActive ? '#fff' : 'var(--pp-text-muted)', flexShrink: 0 }} />
              {c}
              <span style={{ fontSize: 7, marginLeft: 2, opacity: 0.7 }}>▼</span>
            </button>
            {menuFor === c && (
              <div className="absolute left-0 top-full mt-[2px] z-50 py-1 min-w-[180px] shadow-lg"
                style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', borderRadius: 3 }}>
                {!isActive && (<>
                  <button style={miStyle} onMouseEnter={hi} onMouseLeave={ho}
                    onClick={() => { activate(c); setMenuFor(null); }}>Anzeigen</button>
                  <div style={{ height: 1, margin: '2px 0', background: 'var(--pp-border)' }} />
                </>)}
                <button style={miStyle} onMouseEnter={hi} onMouseLeave={ho}
                  onClick={() => { createNew(c); setMenuFor(null); }}>Ansicht duplizieren</button>
                <button style={miStyle} onMouseEnter={hi} onMouseLeave={ho}
                  onClick={() => {
                    const name = prompt('Neuer Name:', c);
                    if (name && name !== c) { setConfigs(p => p.map(x => x === c ? name : x)); if (isActive) activate(name); }
                    setMenuFor(null);
                  }}>Ansicht umbenennen</button>
                <button style={{ ...miStyle, color: 'var(--pp-red-text)' }} onMouseEnter={hi} onMouseLeave={ho}
                  onClick={() => {
                    if (!confirm(`Möchten Sie die Ansicht '${c}' wirklich löschen?`)) return;
                    setConfigs(p => p.filter(x => x !== c));
                    if (isActive) activate(configs.find(x => x !== c) || 'Standard');
                    setMenuFor(null);
                  }}>Ansicht löschen</button>
                {idx > 0 && (<>
                  <div style={{ height: 1, margin: '2px 0', background: 'var(--pp-border)' }} />
                  <button style={miStyle} onMouseEnter={hi} onMouseLeave={ho}
                    onClick={() => {
                      setConfigs(p => { const next = p.filter(x => x !== c); next.unshift(c); return next; });
                      setMenuFor(null);
                    }}>Nach vorne</button>
                </>)}
              </div>
            )}
          </div>
        );
      })}
      {/* PP: VIEW_PLUS — ConfigurationNew (Fenster + Plus, eigenes Symbol) */}
      <button className="pp-toolbar-btn" title="Neue Ansicht"
        onClick={() => createNew(null)}>
        <SquarePlus size={14} />
      </button>
    </div>
  );
}

function CreateDropdown({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  const S: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', color: 'var(--pp-text)', background: 'transparent', border: 'none', width: '100%', textAlign: 'left', fontSize: 11 };
  const hover = (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'var(--pp-selected-bg)');
  const unhover = (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = 'transparent');
  const sep = <div style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />;
  return (
    <div ref={ref} className="absolute right-0 top-full mt-[2px] z-50 py-1 min-w-[220px] shadow-lg"
      style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', borderRadius: 3 }}>
      <button style={S} onMouseEnter={hover} onMouseLeave={unhover} onClick={onClose}>Neues Anlageinstrument</button>
      <button style={S} onMouseEnter={hover} onMouseLeave={unhover} onClick={onClose}>Neue Kryptowährung</button>
      <button style={S} onMouseEnter={hover} onMouseLeave={unhover} onClick={onClose}>Neuer Wechselkurs</button>
      <button style={S} onMouseEnter={hover} onMouseLeave={unhover} onClick={onClose}>Neuer Verbraucherpreisindex</button>
      {sep}
      <button style={S} onMouseEnter={hover} onMouseLeave={unhover} onClick={onClose}>CSV importieren</button>
      {sep}
      <button style={S} onMouseEnter={hover} onMouseLeave={unhover} onClick={onClose}>Leeres Instrument</button>
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


/* ═══════════════════════════════════════════════════════════════════════
   Haupt-Spalten (PP: SecuritiesTable.java)
   C1-C8, D1-D6, E1-E3, Stück/Marktwert/etc, I1-I4, J1-J5, Typ, F1
   Mit Inline-Editing für: Name, ISIN, Symbol, WKN, Inaktiv (PP: StringEditingSupport / BooleanEditingSupport)
   ═══════════════════════════════════════════════════════════════════════ */
type TaxLookup = Record<string, Record<string, string[]>>;

function buildTaxLookup(taxonomien: Taxonomie[]): TaxLookup {
  const lookup: TaxLookup = {};
  for (const tax of taxonomien) {
    const taxMap: Record<string, string[]> = {};
    const walk = (node: Klassifizierung, path: string[]) => {
      const curPath = [...path, node.name];
      for (const z of node.zuweisungen) {
        taxMap[z.wertpapierKey] = curPath;
      }
      for (const k of node.kinder) walk(k, curPath);
    };
    for (const kind of tax.wurzel.kinder) walk(kind, []);
    lookup[tax.name] = taxMap;
  }
  return lookup;
}

function buildColumns(taxonomien: Taxonomie[], taxLookup: TaxLookup, onEditField: (wp: Wertpapier, field: string, value: string | boolean) => void, onOpenReportingPeriodDialog?: () => void, wpColorMap?: Record<string, string>): PPColumn<Wertpapier>[] {
  const cols: PPColumn<Wertpapier>[] = [
    {
      id: 'name', label: 'Name', width: 400, minWidth: 120,
      render: wp => (
        <span className="flex items-center gap-1.5">
          <ColorMarker color={wpColorMap?.[wp.isin || wp.name] || wp.typFarbe || getColor(wp.isin || wp.name)} inaktiv={wp.istInaktiv} />
          <span className="truncate" style={{ color: wp.istInaktiv ? 'var(--pp-text-muted)' : undefined }}>{wp.name}</span>
        </span>
      ),
      sortFn: (a, b) => a.name.localeCompare(b.name),
      editable: true, editType: 'text',
      getValue: wp => wp.name,
      onEdit: (wp, v) => onEditField(wp, 'name', v),
    },
    {
      id: 'note', label: 'Notiz', width: 200,
      render: wp => wp.notiz || '',
      sortFn: (a, b) => (a.notiz ?? '').localeCompare(b.notiz ?? ''),
      editable: true, editType: 'text',
      getValue: wp => wp.notiz || '',
      onEdit: (wp, val) => onEditField(wp, 'notiz', val),
    },
    {
      id: 'isin', label: 'ISIN', width: 120,
      render: wp => wp.isin || '',
      sortFn: (a, b) => a.isin.localeCompare(b.isin),
      editable: true, editType: 'text',
      getValue: wp => wp.isin,
      onEdit: (wp, v) => onEditField(wp, 'isin', v),
    },
    {
      id: 'symbol', label: 'Symbol', width: 80,
      render: wp => wp.symbol || '',
      sortFn: (a, b) => (a.symbol ?? '').localeCompare(b.symbol ?? ''),
      editable: true, editType: 'text',
      getValue: wp => wp.symbol ?? '',
      onEdit: (wp, v) => onEditField(wp, 'symbol', v),
    },
    {
      id: 'wkn', label: 'WKN', width: 80,
      render: wp => wp.wkn || '',
      sortFn: (a, b) => (a.wkn ?? '').localeCompare(b.wkn ?? ''),
      editable: true, editType: 'text',
      getValue: wp => wp.wkn ?? '',
      onEdit: (wp, v) => onEditField(wp, 'wkn', v),
    },
    {
      id: 'waehrung', label: 'Währung', width: 60,
      render: wp => wp.waehrung,
      sortFn: (a, b) => a.waehrung.localeCompare(b.waehrung),
    },
    {
      id: 'zielwaehrung', label: 'Zielwährung', width: 60,
      render: () => '',
      sortFn: () => 0,
    },
    {
      id: 'inaktiv', label: 'Inaktiv', width: 40,
      render: wp => <input type="checkbox" checked={!!wp.istInaktiv} readOnly style={{ accentColor: 'var(--pp-accent)', pointerEvents: 'none' }} />,
      sortFn: (a, b) => (a.istInaktiv ? 1 : 0) - (b.istInaktiv ? 1 : 0),
      editable: true, editType: 'checkbox',
      getValue: wp => !!wp.istInaktiv,
      onEdit: (wp, v) => onEditField(wp, 'istInaktiv', v),
    },
    // PP: addColumnLatestPrice — ColumnLatestPrice = "Letzter Kurs"
    {
      id: 'letzterKurs', label: 'Letzter Kurs', width: 60, align: 'right',
      render: wp => wp.letzterKurs != null ? kurs(wp.letzterKurs) : '',
      sortFn: (a, b) => (a.letzterKurs ?? 0) - (b.letzterKurs ?? 0),
    },
    // PP: addDeltaColumn — MenuLabel = "Kursänderung zum Vortag (%)"
    {
      id: 'kursAenderungPct', label: 'Kursänderung zum Vortag (%)', width: 80, align: 'right',
      render: wp => { const c = getKursChange(wp); if (!c) return ''; return <span style={{ color: c.pct >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{c.pct.toFixed(2)} %</span>; },
      sortFn: (a, b) => (getKursChange(a)?.pct ?? 0) - (getKursChange(b)?.pct ?? 0),
    },
    // PP: addDeltaAmountColumn — MenuLabel = "Kursänderung zum Vortag (Betrag)"
    {
      id: 'kursAenderungAbs', label: 'Kursänderung zum Vortag (Betrag)', width: 80, align: 'right',
      render: wp => { const c = getKursChange(wp); if (!c) return ''; return <span style={{ color: c.abs >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{euro(c.abs)}</span>; },
      sortFn: (a, b) => (getKursChange(a)?.abs ?? 0) - (getKursChange(b)?.abs ?? 0),
    },
    // PP: addColumnDateOfLatestPrice — MenuLabel = "Datum des letzten Kurses"
    {
      id: 'datumLetzterKurs', label: 'Datum des letzten Kurses', width: 120,
      render: wp => {
        if (!wp.letzterKursDatum) return '';
        const d = wp.letzterKursDatum;
        const old = isDateOld(d);
        const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
        const text = hasTime
          ? `${datumKurz(d)} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
          : datumKurz(d);
        return <span style={{ color: old ? 'var(--pp-red-text)' : undefined, background: old ? 'rgba(254,223,107,0.4)' : undefined, padding: old ? '0 3px' : undefined, borderRadius: 2 }}>{text}</span>;
      },
      sortFn: (a, b) => (a.letzterKursDatum?.getTime() ?? 0) - (b.letzterKursDatum?.getTime() ?? 0),
    },
    // PP: addColumnDateOfLatestHistoricalPrice — group: Datenqualität
    {
      id: 'datumLetzterHistKurs', label: 'Letzter historischer (Datum)', width: 80, group: 'Datenqualität',
      render: wp => { if (!wp.kursHistorie?.length) return ''; const d = wp.kursHistorie[wp.kursHistorie.length - 1].datum; const old = isDateOld(d); return <span style={{ color: old ? 'var(--pp-red-text)' : undefined, background: old ? 'rgba(254,223,107,0.4)' : undefined, padding: old ? '0 3px' : undefined, borderRadius: 2 }}>{datumKurz(d)}</span>; },
      sortFn: (a, b) => { const dA = a.kursHistorie?.length ? a.kursHistorie[a.kursHistorie.length - 1].datum.getTime() : 0; const dB = b.kursHistorie?.length ? b.kursHistorie[b.kursHistorie.length - 1].datum.getTime() : 0; return dA - dB; },
    },
    // PP: Typ-Spalte
    {
      id: 'typ', label: 'Typ', width: 100,
      render: wp => wp.typ || '',
      sortFn: (a, b) => (a.typ ?? '').localeCompare(b.typ ?? ''),
    },
    // PP: addQuoteDeltaColumn — hasOptions, ReportingPeriodColumnOptions, canCreateNewOptions=true
    // PP: NO group label — appears as direct submenu in main menu level
    {
      id: 'quoteChange', label: 'Kursänderung', width: 80, align: 'right',
      options: {
        items: [
          { id: 'qc-1y', label: '1 Jahr' },
          { id: 'qc-2y', label: '2 Jahre' },
          { id: 'qc-3y', label: '3 Jahre' },
        ],
        canCreateNew: true,
        onCreateNew: () => onOpenReportingPeriodDialog?.(),
      },
      render: () => '', sortFn: () => 0,
    },
    // PP: DistanceFromMovingAverageColumn — hasOptions, SmaPeriodColumnOption, canCreateNewOptions=false
    {
      id: 'distMovAvg', label: 'Abstand zu SMA', width: 85, align: 'right',
      options: {
        items: [
          { id: 'sma-5', label: '5 Tage' },
          { id: 'sma-20', label: '20 Tage' },
          { id: 'sma-30', label: '30 Tage' },
          { id: 'sma-38', label: '38 Tage' },
          { id: 'sma-50', label: '50 Tage' },
          { id: 'sma-90', label: '90 Tage' },
          { id: 'sma-100', label: '100 Tage' },
          { id: 'sma-200', label: '200 Tage' },
        ],
        canCreateNew: false,
      },
      render: () => '', sortFn: () => 0,
    },
    // PP: DistanceFromAllTimeHighColumn — hasOptions, ReportingPeriodColumnOptions, canCreateNewOptions=true
    {
      id: 'distATH', label: 'Abstand vom ATH', width: 80, align: 'right',
      options: {
        items: [
          { id: 'ath-1y', label: '1 Jahr' },
          { id: 'ath-2y', label: '2 Jahre' },
          { id: 'ath-3y', label: '3 Jahre' },
        ],
        canCreateNew: true,
        onCreateNew: () => onOpenReportingPeriodDialog?.(),
      },
      render: () => '', sortFn: () => 0,
    },
    // PP: QuoteRangeColumn — hasOptions, ReportingPeriodColumnOptions, canCreateNewOptions=true
    {
      id: 'quoteRange', label: 'Kursspanne', width: 80, align: 'right',
      options: {
        items: [
          { id: 'qr-1y', label: '1 Jahr' },
          { id: 'qr-2y', label: '2 Jahre' },
          { id: 'qr-3y', label: '3 Jahre' },
        ],
        canCreateNew: true,
        onCreateNew: () => onOpenReportingPeriodDialog?.(),
      },
      render: () => '', sortFn: () => 0,
    },
    // PP: Option-instance columns (toggled via options menus, no group)
    { id: 'qc-1y', label: 'Kursänderung (1 Jahr)', width: 80, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'qc-2y', label: 'Kursänderung (2 Jahre)', width: 80, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'qc-3y', label: 'Kursänderung (3 Jahre)', width: 80, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'sma-5', label: 'Δ SMA (5)', width: 85, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'sma-20', label: 'Δ SMA (20)', width: 85, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'sma-30', label: 'Δ SMA (30)', width: 85, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'sma-38', label: 'Δ SMA (38)', width: 85, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'sma-50', label: 'Δ SMA (50)', width: 85, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'sma-90', label: 'Δ SMA (90)', width: 85, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'sma-100', label: 'Δ SMA (100)', width: 85, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'sma-200', label: 'Δ SMA (200)', width: 85, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'ath-1y', label: 'Abstand ATH (1 Jahr)', width: 80, align: 'right',
      render: wp => { if (!wp.kursHistorie?.length || !wp.letzterKurs) return ''; const ath = Math.max(...wp.kursHistorie.map(k => k.kurs)); if (ath === 0) return ''; const dist = ((wp.letzterKurs - ath) / ath) * 100; return <span style={{ color: dist >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{dist.toFixed(1)} %</span>; },
      sortFn: (a, b) => { const f = (w: Wertpapier) => { const ath = w.kursHistorie?.length ? Math.max(...w.kursHistorie.map(k => k.kurs)) : 0; return ath > 0 && w.letzterKurs ? (w.letzterKurs - ath) / ath : 0; }; return f(a) - f(b); },
    },
    { id: 'ath-2y', label: 'Abstand ATH (2 Jahre)', width: 80, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'ath-3y', label: 'Abstand ATH (3 Jahre)', width: 80, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'qr-1y', label: 'Kursspanne (1 Jahr)', width: 80, align: 'right',
      render: wp => { if (!wp.kursHistorie?.length) return ''; const k = wp.kursHistorie.map(h => h.kurs); const mn = Math.min(...k), mx = Math.max(...k); if (mx === mn) return '0 %'; return `${(((mx - mn) / mn) * 100).toFixed(1)} %`; },
      sortFn: (a, b) => { const f = (w: Wertpapier) => { if (!w.kursHistorie?.length) return 0; const k = w.kursHistorie.map(h => h.kurs); const mn = Math.min(...k), mx = Math.max(...k); return mn > 0 ? (mx - mn) / mn : 0; }; return f(a) - f(b); },
    },
    { id: 'qr-2y', label: 'Kursspanne (2 Jahre)', width: 80, align: 'right', render: () => '', sortFn: () => 0 },
    { id: 'qr-3y', label: 'Kursspanne (3 Jahre)', width: 80, align: 'right', render: () => '', sortFn: () => 0 },
    // Portfolio-Spalten (nicht in PP SecuritiesTable, aber in unserer Ansicht nützlich)
    { id: 'stueck', label: 'Stück', width: 80, align: 'right', render: wp => wp.bestand > 0 ? stueck(wp.bestand) : '', sortFn: (a, b) => a.bestand - b.bestand },
    { id: 'investiert', label: 'Einstandspreis', width: 100, align: 'right', render: wp => wp.investiert > 0 ? euro(wp.investiert) : '', sortFn: (a, b) => a.investiert - b.investiert },
    { id: 'marktwert', label: 'Marktwert', width: 100, align: 'right', render: wp => wp.marktwert ? euro(wp.marktwert) : '', sortFn: (a, b) => (a.marktwert ?? 0) - (b.marktwert ?? 0) },
    {
      id: 'delta', label: 'Δ Gewinn', width: 100, align: 'right',
      render: wp => { const g = wp.unrealisierterGewinn; if (g == null) return ''; return <span className="inline-flex items-center gap-0.5" style={{ color: g >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{euro(g)} <ValueArrow value={g} /></span>; },
      sortFn: (a, b) => (a.unrealisierterGewinn ?? 0) - (b.unrealisierterGewinn ?? 0),
    },
    {
      id: 'deltaPct', label: 'Δ Gewinn %', width: 60, align: 'right',
      render: wp => { const p = wp.unrealisierterGewinnProzent; if (p == null) return ''; return <span style={{ color: p >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{prozent(p)}</span>; },
      sortFn: (a, b) => (a.unrealisierterGewinnProzent ?? 0) - (b.unrealisierterGewinnProzent ?? 0),
    },
    // PP: addDataQualityColumns — group: Datenqualität (weitere Spalten nach datumLetzterHistKurs oben)
    { id: 'datumErsterKurs', label: 'Erster historischer (Datum)', width: 80, group: 'Datenqualität', render: wp => wp.kursHistorie?.length ? datumKurz(wp.kursHistorie[0].datum) : '', sortFn: (a, b) => (a.kursHistorie?.[0]?.datum.getTime() ?? 0) - (b.kursHistorie?.[0]?.datum.getTime() ?? 0) },
    { id: 'completeness', label: 'Vollständigkeit der historischen Kurse', width: 80, align: 'right', group: 'Datenqualität', render: wp => { if (!wp.kursHistorie?.length) return ''; const m = computeDQMetrics(wp.kursHistorie); return m ? `${m.vollstaendigkeit.toFixed(1)} %` : ''; }, sortFn: (a, b) => (a.kursHistorie?.length ?? 0) - (b.kursHistorie?.length ?? 0) },
    { id: 'expectedQuotes', label: 'Erwartete # Kurse', width: 80, align: 'right', group: 'Datenqualität', render: wp => { const m = computeDQMetrics(wp.kursHistorie); return m ? String(m.erwartet) : ''; }, sortFn: () => 0 },
    { id: 'actualQuotes', label: 'Tatsächliche # Kurse', width: 80, align: 'right', group: 'Datenqualität', render: wp => wp.kursHistorie?.length ? String(wp.kursHistorie.length) : '', sortFn: (a, b) => (a.kursHistorie?.length ?? 0) - (b.kursHistorie?.length ?? 0) },
    { id: 'missingQuotes', label: 'Fehlende # Kurse', width: 80, align: 'right', group: 'Datenqualität', render: wp => { const m = computeDQMetrics(wp.kursHistorie); return m ? String(m.fehlendeDaten.length) : ''; }, sortFn: () => 0 },
  ];
  // PP: TaxonomyColumn — group: Klassifizierung
  // Each taxonomy gets its own submenu with level-options (hasOptions, canCreateNew=false)
  // PP: for (Taxonomy taxonomy : getClient().getTaxonomies()) → TaxonomyColumn with TaxonomyOptions
  const taxonomieNames = taxonomien.map(t => t.name);
  if (taxonomieNames.length === 0) {
    cols.push({ id: 'tax-placeholder', label: '(keine Taxonomien)', width: 100, group: 'Klassifizierung', render: () => '', sortFn: () => 0 });
  }
  for (const taxName of taxonomieNames) {
    const tm = taxLookup[taxName] ?? {};
    const getPath = (wp: Wertpapier) => tm[wp.isin || wp.name] ?? [];
    const lvl = (wp: Wertpapier, n: number) => getPath(wp)[n - 1] ?? '';
    const full = (wp: Wertpapier) => getPath(wp).join(' > ');

    const levels = [
      { id: `tax-${taxName}-1`, label: 'Ebene 1' },
      { id: `tax-${taxName}-2`, label: 'Ebene 2' },
      { id: `tax-${taxName}-3`, label: 'Ebene 3' },
      { id: `tax-${taxName}-full`, label: 'Komplette Klassifizierung' },
    ];
    cols.push({
      id: `tax-${taxName}`, label: taxName, width: 120, group: 'Klassifizierung',
      options: { items: levels, canCreateNew: false },
      render: wp => lvl(wp, 1), sortFn: (a, b) => lvl(a, 1).localeCompare(lvl(b, 1)),
    });
    cols.push({ id: levels[0].id, label: `${taxName} (${levels[0].label})`, width: 120, group: 'Klassifizierung', render: wp => lvl(wp, 1), sortFn: (a, b) => lvl(a, 1).localeCompare(lvl(b, 1)) });
    cols.push({ id: levels[1].id, label: `${taxName} (${levels[1].label})`, width: 120, group: 'Klassifizierung', render: wp => lvl(wp, 2), sortFn: (a, b) => lvl(a, 2).localeCompare(lvl(b, 2)) });
    cols.push({ id: levels[2].id, label: `${taxName} (${levels[2].label})`, width: 120, group: 'Klassifizierung', render: wp => lvl(wp, 3), sortFn: (a, b) => lvl(a, 3).localeCompare(lvl(b, 3)) });
    cols.push({ id: levels[3].id, label: `${taxName} (${levels[3].label})`, width: 120, group: 'Klassifizierung', render: wp => full(wp), sortFn: (a, b) => full(a).localeCompare(full(b)) });
  }
  // PP: AttributeColumn — group: Attribute
  // PP: dynamisch per client.getSettings().getAttributeTypes().filter(a -> a.supports(Security.class))
  // Standard-PP-Security-Attribute:
  const defaultAttributes = [
    { id: 'attr-ter', label: 'Gesamtkostenquote (TER)' },
    { id: 'attr-fondsgroesse', label: 'Fondsgröße' },
    { id: 'attr-anbieter', label: 'Anbieter' },
    { id: 'attr-kaufgebuehr', label: 'Kaufgebühr (prozentual)' },
    { id: 'attr-verwaltungsgebuehr', label: 'Verwaltungsgebühr (prozentual)' },
    { id: 'attr-logo', label: 'Logo' },
  ];
  for (const attr of defaultAttributes) {
    cols.push({ id: attr.id, label: attr.label, width: 80, group: 'Attribute', render: () => '', sortFn: () => 0 });
  }
  // PP: DividendPaymentColumns — group: Dividenden
  // PP uses setMenuLabel() for longer labels in the menu
  cols.push(
    { id: 'divNextExDate', label: 'Nächster Ex-Dividendentag', width: 80, group: 'Dividenden', render: () => '', sortFn: () => 0 },
    { id: 'divNextPayDate', label: 'Nächster Dividenden Zahltag', width: 80, group: 'Dividenden', render: () => '', sortFn: () => 0 },
    { id: 'divNextPayAmount', label: 'Nächster Dividendenbetrag', width: 80, align: 'right' as const, group: 'Dividenden', render: () => '', sortFn: () => 0 },
  );
  // PP: addQuoteFeedColumns — group: Kurslieferant
  cols.push(
    { id: 'feedHistoric', label: 'Kurslieferant (historisch)', width: 200, group: 'Kurslieferant', render: (wp: Wertpapier) => wp.feed || '', sortFn: (a: Wertpapier, b: Wertpapier) => (a.feed ?? '').localeCompare(b.feed ?? '') },
    { id: 'feedLatest', label: 'Kurslieferant (aktueller Kurs)', width: 200, group: 'Kurslieferant', render: (wp: Wertpapier) => wp.feed || '', sortFn: (a: Wertpapier, b: Wertpapier) => (a.feed ?? '').localeCompare(b.feed ?? '') },
    { id: 'feedUrlHistoric', label: 'URL (historische Kurse)', width: 200, group: 'Kurslieferant', render: (wp: Wertpapier) => wp.feedUrl || '', sortFn: (a: Wertpapier, b: Wertpapier) => (a.feedUrl ?? '').localeCompare(b.feedUrl ?? '') },
    { id: 'feedUrlLatest', label: 'URL (aktueller Kurs)', width: 200, group: 'Kurslieferant', render: (wp: Wertpapier) => wp.feedUrl || '', sortFn: (a: Wertpapier, b: Wertpapier) => (a.feedUrl ?? '').localeCompare(b.feedUrl ?? '') },
  );
  return cols;
}

const BASE_HIDDEN = new Set([
  'note', 'waehrung', 'zielwaehrung', 'inaktiv',
  'datumLetzterHistKurs',
  'quoteChange', 'qc-1y', 'qc-2y', 'qc-3y',
  'distMovAvg', 'sma-5', 'sma-20', 'sma-30', 'sma-38', 'sma-50', 'sma-90', 'sma-100', 'sma-200',
  'distATH', 'ath-1y', 'ath-2y', 'ath-3y',
  'quoteRange', 'qr-1y', 'qr-2y', 'qr-3y',
  'stueck', 'investiert', 'marktwert', 'delta', 'deltaPct',
  'datumErsterKurs', 'completeness', 'expectedQuotes', 'actualQuotes', 'missingQuotes',
  'tax-placeholder',
  'attr-ter', 'attr-fondsgroesse', 'attr-anbieter', 'attr-kaufgebuehr', 'attr-verwaltungsgebuehr', 'attr-logo',
  'divNextExDate', 'divNextPayDate', 'divNextPayAmount',
  'feedHistoric', 'feedLatest', 'feedUrlHistoric', 'feedUrlLatest',
]);

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
   HAUPTKOMPONENTE
   ═══════════════════════════════════════════════════════════════════════ */
interface AlleWertpapiereViewProps {
  filterTyp?: Wertpapier['typ'] | 'Währung';
  title?: string;
  defaultFilters?: string[];
}

export default function AlleWertpapiereView({ filterTyp, title, defaultFilters }: AlleWertpapiereViewProps = {}) {
  const { state, updateWertpapier, deleteWertpapier, importTransaktionen, deleteTransaktion, refreshKurse, kursRefreshInterval, setKursRefreshInterval, isRefreshingKurse, lastKursRefresh } = usePortfolio();
  const histKurseCfg = useColumnConfig('alle-wp-histkurse', HIST_KURSE_COLUMNS);
  const umsaetzeCfg = useColumnConfig('alle-wp-umsaetze', WP_UMSAETZE_COLUMNS);
  const tradesCfg = useColumnConfig('alle-wp-trades', TRADES_COLUMNS);
  const ereignisseCfg = useColumnConfig('alle-wp-ereignisse', EREIGNISSE_COLUMNS);
  const fehlendeCfg = useColumnConfig('alle-wp-fehlend', DQ_DATUM_COLUMNS);
  const unerwarteteCfg = useColumnConfig('alle-wp-unerwartet', DQ_DATUM_COLUMNS);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detailTab, setDetailTab] = useState('diagramm');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => new Set(defaultFilters ?? ['onlyActive']));
  const [createOpen, setCreateOpen] = useState(false);
  const [colMenuPos, setColMenuPos] = useState<{ x: number; y: number } | null>(null);
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
  const [txDialog, setTxDialog] = useState<{ wp: Wertpapier; typ: string } | null>(null);
  const [editDialog, setEditDialog] = useState<Wertpapier | null>(null);
  const [priceDialog, setPriceDialog] = useState<{ wp: Wertpapier; defaultDate?: Date } | null>(null);

  // Kontextmenüs
  const [mainCtx, setMainCtx] = useState<{ x: number; y: number; wpKey: string } | null>(null);
  const [histCtx, setHistCtx] = useState<{ x: number; y: number; idx: number } | null>(null);
  const [txCtx, setTxCtx] = useState<{ x: number; y: number; tx: Transaktion } | null>(null);
  const [eventCtx, setEventCtx] = useState<{ x: number; y: number; idx: number } | null>(null);

  // Detail-Tab Suche/Filter
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('alle');

  const selectedWp = selected ? state.wertpapiere[selected] : null;
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
  const depotCount = Object.keys(state.depots ?? {}).length;
  const taxonomien = useMemo(() => state.taxonomien ?? [], [state.taxonomien]);
  const taxonomieNames = useMemo(() => taxonomien.map(t => t.name), [taxonomien]);
  const taxLookup = useMemo(() => buildTaxLookup(taxonomien), [taxonomien]);

  // PP: Farbe aus Wertpapierart-Taxonomie (typFarbe)
  const wpColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const secTypeTax = (state.taxonomien ?? []).find(t =>
      t.name === 'Wertpapierart' || t.id === 'security-type' ||
      t.name === 'Security Type' || t.name.toLowerCase().includes('wertpapierart')
    );
    if (secTypeTax) {
      const walk = (node: Klassifizierung) => {
        for (const z of node.zuweisungen) {
          if (!map[z.wertpapierKey] && node.farbe) {
            map[z.wertpapierKey] = node.farbe;
          }
        }
        for (const k of node.kinder) walk(k);
      };
      walk(secTypeTax.wurzel);
    }
    return map;
  }, [state.taxonomien]);

  // L1: Strg+E → Wertpapier bearbeiten
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'e' && selectedWp) {
        e.preventDefault();
        setEditDialog(selectedWp);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedWp]);

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

  // Inline-Edit Handler
  const onEditField = useCallback((wp: Wertpapier, field: string, value: string | boolean) => {
    const key = wp.isin || wp.name;
    updateWertpapier(key, { [field]: value });
  }, [updateWertpapier]);

  // B: Filter
  const handleFilterToggle = useCallback((id: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else { const opt = WERTPAPIER_FILTER.find((o: FilterOption) => o.id === id); if (opt?.exclusive) next.delete(opt.exclusive); next.add(id); }
      return next;
    });
  }, []);

  // A1: Suche
  const wps = useMemo(() => {
    let list = Object.values(state.wertpapiere);
    if (filterTyp) list = list.filter(wp => wp.typ === filterTyp);
    if (activeFilters.has('onlyActive')) list = list.filter(wp => !wp.istInaktiv);
    if (activeFilters.has('onlyInactive')) list = list.filter(wp => !!wp.istInaktiv);
    if (activeFilters.has('onlySecurities')) list = list.filter(wp => !wp.isExchangeRate);
    if (activeFilters.has('onlyExchangeRates')) list = list.filter(wp => !!wp.isExchangeRate);
    if (activeFilters.has('sharesNotZero')) list = list.filter(wp => wp.bestand !== 0);
    if (activeFilters.has('sharesZero')) list = list.filter(wp => wp.bestand === 0);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(wp => wp.name.toLowerCase().includes(q) || wp.isin.toLowerCase().includes(q) || (wp.symbol ?? '').toLowerCase().includes(q) || (wp.wkn ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [state.wertpapiere, search, filterTyp, activeFilters]);

  const [showRPDialog, setShowRPDialog] = useState(false);
  const openRPDialog = useCallback(() => setShowRPDialog(true), []);
  const columns = useMemo(() => buildColumns(taxonomien, taxLookup, onEditField, openRPDialog, wpColorMap), [taxonomien, taxLookup, onEditField, openRPDialog, wpColorMap]);
  const hiddenByDefault = useMemo(() => { const s = new Set(BASE_HIDDEN); for (const n of taxonomieNames) { s.add(`tax-${n}`); s.add(`tax-${n}-1`); s.add(`tax-${n}-2`); s.add(`tax-${n}-3`); s.add(`tax-${n}-full`); } return s; }, [taxonomieNames]);

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

  // Transaktion speichern (aus Dialog)
  const handleSaveTx = useCallback((partial: Partial<Transaktion>) => {
    const tx: Transaktion = {
      id: crypto.randomUUID(),
      datum: partial.datum ?? new Date(),
      typ: partial.typ ?? 'kauf',
      betrag: partial.betrag ?? 0,
      stueck: partial.stueck ?? 0,
      kurs: partial.kurs ?? 0,
      gebuehren: partial.gebuehren ?? 0,
      steuern: partial.steuern ?? 0,
      isin: partial.isin ?? '',
      wertpapierName: partial.wertpapierName ?? '',
      waehrung: partial.waehrung ?? 'EUR',
      notiz: partial.notiz,
      depotName: partial.depotName,
      kontoName: partial.kontoName,
      gegenkontoName: partial.gegenkontoName,
    };
    importTransaktionen([tx]);
  }, [importTransaktionen]);

  // CSV Exports
  const exportMainCSV = useCallback(() => {
    const header = 'Name;ISIN;Symbol;WKN;Währung;Letzter Kurs;Δ%;Stück;Einstandspreis;Marktwert;Δ Gewinn;Δ%;Dividenden;Typ;Inaktiv';
    const rows = wps.map(wp => {
      const c = getKursChange(wp);
      return [wp.name, wp.isin, wp.symbol ?? '', wp.wkn ?? '', wp.waehrung, wp.letzterKurs != null ? kurs(wp.letzterKurs) : '', c ? c.pct.toFixed(2) : '', wp.bestand.toFixed(4), wp.investiert.toFixed(2), wp.marktwert?.toFixed(2) ?? '', wp.unrealisierterGewinn?.toFixed(2) ?? '', wp.unrealisierterGewinnProzent?.toFixed(2) ?? '', wp.dividendenGesamt.toFixed(2), wp.typ, wp.istInaktiv ? 'Ja' : 'Nein'].join(';');
    });
    downloadCSV('alle_wertpapiere.csv', header, rows);
  }, [wps]);

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
     K: Kontextmenü-Items für Haupttabelle
     ═══════════════════════════════════════════════════════════════════ */
  const buildMainCtxItems = useCallback((wp: Wertpapier): MenuEntry[] => {
    const key = wp.isin || wp.name;
    const items: MenuEntry[] = [];

    // PP: SecurityContextMenu.menuAboutToShow — nur wenn currencyCode != null
    if (wp.waehrung) {
      // PP: Messages.SecurityMenuBuy + "..."  →  "Kauf..."
      items.push({ label: 'Kauf...', onClick: () => setTxDialog({ wp, typ: 'kauf' }) });
      // PP: Messages.SecurityMenuSell + "..."  →  "Verkauf..."
      items.push({ label: 'Verkauf...', onClick: () => setTxDialog({ wp, typ: 'verkauf' }) });
      // PP: Messages.SecurityMenuDividends + "..."  →  "Dividende..."
      items.push({ label: 'Dividende...', onClick: () => setTxDialog({ wp, typ: 'dividende' }) });
      // PP: AccountTransaction.Type.TAXES + "..."  →  "Steuern..."
      items.push({ label: 'Steuern...', onClick: () => setTxDialog({ wp, typ: 'steuern_tx' }) });
      // PP: AccountTransaction.Type.TAX_REFUND + "..."  →  "Steuerrückerstattung..."
      items.push({ label: 'Steuerrückerstattung...', onClick: () => setTxDialog({ wp, typ: 'steuererstattung' }) });
      // PP: Messages.SecurityMenuStockSplit  →  "Aktiensplit..."
      items.push({ label: 'Aktiensplit...', onClick: () => setTxDialog({ wp, typ: 'aktiensplit' }) });
      // PP: Messages.SecurityMenuAddEvent  →  "Ereignis..."
      items.push({ label: 'Ereignis...', onClick: () => setTxDialog({ wp, typ: 'ereignis' }) });

      // PP: if (owner.getClient().getActivePortfolios().size() > 1)  →  Umbuchung
      if (depotCount > 1) {
        items.push({ separator: true });
        // PP: Messages.SecurityMenuTransfer  →  "Umbuchung..."
        items.push({ label: 'Umbuchung...', onClick: () => setTxDialog({ wp, typ: 'umbuchung' }) });
      }

      items.push({ separator: true });
      // PP: PortfolioTransaction.Type.DELIVERY_INBOUND.toString() + "..."  →  "Einlieferung..."
      items.push({ label: 'Einlieferung...', onClick: () => setTxDialog({ wp, typ: 'umbuchung_ein' }) });
      // PP: PortfolioTransaction.Type.DELIVERY_OUTBOUND.toString() + "..."  →  "Auslieferung..."
      items.push({ label: 'Auslieferung...', onClick: () => setTxDialog({ wp, typ: 'umbuchung_aus' }) });

      // PP: Messages.InvestmentPlanMenuCreate  →  "Neuer Sparplan..."
      items.push({ label: 'Neuer Sparplan...', onClick: () => setTxDialog({ wp, typ: 'sparplan' }) });

      items.push({ separator: true });
    }

    // PP: EditSecurityAction (Messages.SecurityMenuEditSecurity → "Editieren...")
    items.push({ label: 'Editieren...', shortcut: 'Strg+E', onClick: () => setEditDialog(wp) });

    // PP: QuotesContextMenu (Messages.SecurityMenuQuotes → "Kurse")
    items.push({ separator: true });
    const isManualFeed = !wp.feed || wp.feed === 'MANUAL';
    const kurseChildren: MenuEntry[] = [
      // PP: Messages.SecurityMenuUpdateQuotes → "Kurse online aktualisieren"
      { label: 'Kurse online aktualisieren', onClick: () => refreshKurse(), disabled: isManualFeed },
      // PP: Messages.SecurityMenuDebugGetHistoricalQuotes → "Debug: Serverantwort anzeigen"
      { label: 'Debug: Serverantwort anzeigen', onClick: () => {}, disabled: isManualFeed },
      // PP: Messages.SecurityMenuConfigureOnlineUpdate → "Online-Aktualisierung konfigurieren..."
      { label: 'Online-Aktualisierung konfigurieren...', onClick: () => setEditDialog(wp) },
      // PP: Messages.LabelSearchForQuoteFeeds + "..." → "Suche nach Kurslieferanten..."
      { label: 'Suche nach Kurslieferanten...', onClick: () => setEditDialog(wp) },
      { separator: true },
      // PP: Messages.SecurityMenuImportCSV → "CSV-Datei importieren..."
      { label: 'CSV-Datei importieren...', onClick: () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.csv';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const text = reader.result as string;
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) return;
            const newKurse: KursEintrag[] = [];
            for (let i = 1; i < lines.length; i++) {
              const parts = lines[i].split(/[;,\t]/);
              if (parts.length < 2) continue;
              const d = parts[0].trim();
              const k = parseFloat(parts[1].replace(',', '.'));
              if (d && !isNaN(k)) newKurse.push({ datum: new Date(d), kurs: k });
            }
            if (newKurse.length > 0) {
              const existing = new Set((wp.kursHistorie ?? []).map(k => k.datum.toISOString().slice(0, 10)));
              const fresh = newKurse.filter(k => !existing.has(k.datum.toISOString().slice(0, 10)));
              const merged = [...(wp.kursHistorie ?? []), ...fresh].sort((a, b) => a.datum.getTime() - b.datum.getTime());
              updateWertpapier(key, { kursHistorie: merged });
            }
          };
          reader.readAsText(file);
        };
        input.click();
      } },
      // PP: Messages.SecurityMenuImportHTML → "HTML-Tabelle importieren..."
      { label: 'HTML-Tabelle importieren...', onClick: () => {}, disabled: true },
      // PP: Messages.SecurityMenuCreateManually → "Manuell erfassen..."
      { label: 'Manuell erfassen...', onClick: () => {
        const dateStr = prompt('Datum (JJJJ-MM-TT):');
        if (!dateStr) return;
        const kursStr = prompt('Kurs:');
        if (!kursStr) return;
        const kurs = parseFloat(kursStr.replace(',', '.'));
        if (isNaN(kurs)) return;
        const merged = [...(wp.kursHistorie ?? []), { datum: new Date(dateStr), kurs }].sort((a, b) => a.datum.getTime() - b.datum.getTime());
        updateWertpapier(key, { kursHistorie: merged });
      } },
      { separator: true },
      // PP: Messages.SecurityMenuExportCSV → "CSV-Datei exportieren..."
      { label: 'CSV-Datei exportieren...', onClick: () => {
        if (!wp.kursHistorie?.length) return;
        const header = 'Datum;Schlusskurs';
        const rows = [...wp.kursHistorie].sort((a, b) => a.datum.getTime() - b.datum.getTime()).map(k => `${datumKurz(k.datum)};${k.kurs.toFixed(4)}`);
        downloadCSV(`${wp.name}_kurse.csv`, header, rows);
      }, disabled: !wp.kursHistorie?.length },
      { separator: true },
      // PP: Messages.SecurityMenuCreateQuotesFromTransactions → "Historische Kurse aus Buchungen erzeugen"
      { label: 'Historische Kurse aus Buchungen erzeugen', onClick: () => {
        if (!wp.transaktionen.length) return;
        const buchungsKurse: KursEintrag[] = wp.transaktionen
          .filter(tx => tx.kurs > 0 && ['kauf', 'verkauf', 'einlieferung'].includes(tx.typ))
          .map(tx => ({ datum: new Date(tx.datum), kurs: tx.kurs }));
        if (buchungsKurse.length === 0) return;
        const existing = new Set((wp.kursHistorie ?? []).map(k => k.datum.toISOString().slice(0, 10)));
        const newKurse = buchungsKurse.filter(k => !existing.has(k.datum.toISOString().slice(0, 10)));
        if (newKurse.length > 0) {
          const merged = [...(wp.kursHistorie ?? []), ...newKurse].sort((a, b) => a.datum.getTime() - b.datum.getTime());
          updateWertpapier(key, { kursHistorie: merged });
        }
      }, disabled: !wp.waehrung },
      // PP: Messages.SecurityMenuDeleteLatestQuote → "Letzten Kurs löschen"
      { label: 'Letzten Kurs löschen', onClick: () => {
        if (!wp.kursHistorie?.length) return;
        const trimmed = wp.kursHistorie.slice(0, -1);
        updateWertpapier(key, { kursHistorie: trimmed });
      }, disabled: !wp.kursHistorie?.length },
      // PP: Messages.SecurityMenuRoundToXDecimalPlaces → "Historische Kurse auf X Dezimalstellen runden"
      { label: 'Historische Kurse auf X Dezimalstellen runden', onClick: () => {
        if (!wp.kursHistorie?.length) return;
        const input = prompt('Anzahl der Dezimalstellen:', '4');
        if (input == null) return;
        const dec = parseInt(input, 10);
        if (isNaN(dec) || dec < 0 || dec > 10) return;
        const rounded = wp.kursHistorie.map(k => ({ ...k, kurs: parseFloat(k.kurs.toFixed(dec)) }));
        updateWertpapier(key, { kursHistorie: rounded });
      }, disabled: !wp.kursHistorie?.length },
    ];
    items.push({ label: 'Kurse', children: kurseChildren });

    items.push({ separator: true });

    // PP: BookmarkMenu (Messages.MenuOpenSecurityOnSite → "Im Browser öffnen")
    const bmChildren: MenuEntry[] = [
      ...PP_DEFAULT_BOOKMARKS.map(bm => ({
        label: bm.label,
        onClick: () => window.open(buildBookmarkUrl(bm.url, wp), '_blank'),
        disabled: !wp.isin && !wp.symbol,
      })),
    ];
    items.push({ label: 'Im Browser öffnen', children: bmChildren });

    items.push({ separator: true });

    // PP: SecuritiesTable — Wertpapier inaktiv/aktiv setzen
    if (wp.istInaktiv) {
      // PP: Messages.SecurityMenuSetSingleSecurityActive → "Wertpapier aktiv setzen"
      items.push({ label: 'Wertpapier aktiv setzen', onClick: () => updateWertpapier(key, { istInaktiv: false }) });
    } else {
      // PP: Messages.SecurityMenuSetSingleSecurityInactive → "Wertpapier inaktiv setzen"
      items.push({ label: 'Wertpapier inaktiv setzen', onClick: () => updateWertpapier(key, { istInaktiv: true }) });
    }

    // PP: Messages.LabelDuplicateSecurity → "Wertpapier duplizieren"
    items.push({ label: 'Wertpapier duplizieren', onClick: () => {
      const copy: Partial<Wertpapier> = {
        name: wp.name + ' (Kopie)',
        symbol: wp.symbol,
        wkn: wp.wkn,
        waehrung: wp.waehrung,
        typ: wp.typ,
        feed: wp.feed,
        feedUrl: wp.feedUrl,
        coinGeckoId: wp.coinGeckoId,
        notiz: wp.notiz,
        kursHistorie: wp.kursHistorie ? [...wp.kursHistorie] : [],
      };
      const newKey = (wp.isin ? wp.isin + '_copy_' : 'copy_') + Date.now();
      updateWertpapier(newKey, copy as any);
    } });

    // PP: Messages.SecurityMenuDeleteSingleSecurity → "Wertpapier löschen"
    items.push({ label: 'Wertpapier löschen', danger: true, disabled: wp.transaktionen.length > 0,
      onClick: () => {
        if (wp.transaktionen.length === 0 && confirm(`Möchten Sie das Wertpapier '${wp.name}' wirklich löschen?`))
          deleteWertpapier(key);
      }
    });

    return items;
  }, [depotCount, updateWertpapier, deleteWertpapier, refreshKurse]);

  /* ═══════════════════════════════════════════════════════════════════
     MASTER PANEL
     ═══════════════════════════════════════════════════════════════════ */
  const masterPanel = (
    <div className="flex flex-col h-full">
      <Toolbar title={title ?? 'Alle Wertpapiere'} searchValue={search} onSearchChange={setSearch}
        filterOptions={WERTPAPIER_FILTER} activeFilters={activeFilters} onFilterToggle={handleFilterToggle}
        onExportClick={exportMainCSV}
        onSettingsClick={e => {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          setColMenuPos(prev => prev ? null : { x: rect.right - 160, y: rect.bottom + 2 });
        }}
        viewButtons={
          <ViewConfigButtons storageKey={filterTyp ? `wertpapiere-${filterTyp}` : 'alle-wertpapiere'} />
        }>

        <div className="relative">
          <button type="button" className="pp-toolbar-btn" title="Neues Wertpapier anlegen" onClick={() => setCreateOpen(!createOpen)}><Plus size={14} /></button>
          {createOpen && <CreateDropdown onClose={() => setCreateOpen(false)} />}
        </div>
        <div className="flex items-center gap-1 ml-2" style={{ borderLeft: '1px solid var(--pp-border)', paddingLeft: 6 }}>
          <button type="button" className="pp-toolbar-btn" title={isRefreshingKurse ? 'Aktualisiere...' : 'Kurse aktualisieren'} onClick={refreshKurse} disabled={isRefreshingKurse}>
            <RefreshCw size={14} className={isRefreshingKurse ? 'animate-spin' : ''} />
          </button>
          <select
            value={kursRefreshInterval}
            onChange={e => setKursRefreshInterval(Number(e.target.value))}
            title="Automatisches Kurs-Update Intervall"
            style={{ background: 'var(--pp-header-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)', borderRadius: 3, fontSize: 11, padding: '1px 4px', cursor: 'pointer' }}
          >
            <option value={0}>Manuell</option>
            <option value={5}>5 Min</option>
            <option value={15}>15 Min</option>
            <option value={30}>30 Min</option>
            <option value={60}>1 Std</option>
          </select>
          {lastKursRefresh && (
            <span style={{ fontSize: 10, color: 'var(--pp-text-muted)' }} title={`Letzte Aktualisierung: ${lastKursRefresh.toLocaleString('de-DE')}`}>
              {lastKursRefresh.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </Toolbar>
      <PPTable
        columns={columns} data={wps} rowKey={wp => wp.isin || wp.name}
        selectedKey={selected} onSelect={setSelected}
        storageKey={filterTyp ? `wertpapiere-${filterTyp}` : 'alle-wertpapiere'}
        hiddenByDefault={hiddenByDefault}
        onRowContextMenu={(e, wp) => { e.preventDefault(); setMainCtx({ x: e.clientX, y: e.clientY, wpKey: wp.isin || wp.name }); }}
        columnMenuPos={colMenuPos} onColumnMenuClose={() => setColMenuPos(null)}
      />
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════
     DETAIL PANEL — 6 Tabs mit Toolbars + Kontextmenüs
     ═══════════════════════════════════════════════════════════════════ */
  const emptyMsg = (text: string) => <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>{text}</div>;

  const detailPanel = (
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
                  <div className="text-[10px] mono" style={{ color: 'var(--pp-text-muted)' }}>{selectedWp.isin || ' '}</div>
                  <div className="text-[10px] mono" style={{ color: 'var(--pp-text-muted)' }}>{selectedWp.symbol || ' '}</div>
                  <div className="text-[10px] mono" style={{ color: 'var(--pp-text-muted)' }}>{selectedWp.wkn || ' '}</div>
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
                {/* TaxonomyFacets */}
                {(state.taxonomien ?? []).map(tax => (
                  <div key={tax.name}>
                    <div style={{ height: 1, background: 'var(--pp-border)', margin: '2px 8px' }} />
                    <div className="px-2 pt-1 pb-1">
                      <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--pp-text-muted)' }}>{tax.name}</div>
                      <div className="text-[10px]" style={{ color: 'var(--pp-text)' }}>{' '}</div>
                    </div>
                  </div>
                ))}
                {/* NoteFacet */}
                <div style={{ height: 1, background: 'var(--pp-border)', margin: '2px 8px' }} />
                <div className="px-2 pt-1 pb-2">
                  <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--pp-text-muted)' }}>Notiz</div>
                  <div className="text-[10px]" style={{ color: 'var(--pp-text)' }}>{' '}</div>
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
  );

  return (<>
    <SplitPane top={masterPanel} bottom={detailPanel} storageKey={filterTyp ? `wertpapiere-${filterTyp}` : 'alle-wertpapiere'} />

    {/* Haupttabelle Kontextmenü */}
    {mainCtx && state.wertpapiere[mainCtx.wpKey] && (
      <ContextMenuPopup x={mainCtx.x} y={mainCtx.y} onClose={() => setMainCtx(null)}
        items={buildMainCtxItems(state.wertpapiere[mainCtx.wpKey])} />
    )}

    {/* Hist. Kurse Kontextmenü (O6-O10) */}
    {histCtx && selectedWp && (
      <ContextMenuPopup x={histCtx.x} y={histCtx.y} onClose={() => setHistCtx(null)} items={[
        { label: 'Kurs hinzufügen...', onClick: () => setPriceDialog({ wp: selectedWp }) },
        { separator: true },
        { label: 'Kurs löschen', onClick: () => {} },
        { label: 'Alle Kurse löschen', onClick: () => {} },
      ]} />
    )}

    {/* Umsätze Kontextmenü (P8) */}
    {txCtx && (
      <ContextMenuPopup x={txCtx.x} y={txCtx.y} onClose={() => setTxCtx(null)} items={[
        { label: 'Bearbeiten', shortcut: 'Strg+E', onClick: () => {} },
        { label: 'Duplizieren', shortcut: 'Strg+D', onClick: () => {
          const dup = { ...txCtx.tx, id: crypto.randomUUID() };
          importTransaktionen([dup]);
        }},
        { separator: true },
        { label: 'Löschen', danger: true, onClick: () => deleteTransaktion(txCtx.tx.id) },
      ]} />
    )}

    {/* Ereignisse Kontextmenü (R8-R10) */}
    {eventCtx && (
      <ContextMenuPopup x={eventCtx.x} y={eventCtx.y} onClose={() => setEventCtx(null)} items={[
        { label: 'Ereignis hinzufügen', onClick: () => {} },
        { separator: true },
        { label: 'Löschen', danger: true, onClick: () => {} },
      ]} />
    )}

    {/* Dialoge */}
    {txDialog && <TransactionDialog wp={txDialog.wp} typ={txDialog.typ} onClose={() => setTxDialog(null)} onSave={handleSaveTx} />}
    {editDialog && <EditSecurityDialog wp={editDialog} onClose={() => setEditDialog(null)} onSave={patch => { updateWertpapier(editDialog.isin || editDialog.name, patch); }} />}
    {priceDialog && <PriceDialog defaultDate={priceDialog.defaultDate} onClose={() => setPriceDialog(null)} onSave={(_datum, _kurs) => { /* TODO: add price to kursHistorie */ }} />}
    {showRPDialog && <ReportingPeriodDialog onClose={() => setShowRPDialog(false)} onSelect={() => { /* dynamisch neue Spalten hinzufügen noch nicht implementiert */ }} />}
  </>);
}
