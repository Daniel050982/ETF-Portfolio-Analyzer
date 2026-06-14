import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { ReportingPeriodDialog } from '../components/ReportingPeriodDialog';
import { SplitPane } from '../components/SplitPane';
import { Toolbar, ColorMarker, getColor, ValueArrow, WERTPAPIER_FILTER, type FilterOption } from '../components/PPElements';
import { WertpapierDetailPane } from '../components/WertpapierDetailPane';
import { euro, kurs, stueck, datumKurz, prozent } from '../utils/format';
import type { Wertpapier, Transaktion, Klassifizierung, Taxonomie, KursEintrag } from '../types/portfolio';

import { Plus, SquarePlus, RefreshCw } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Hilfsfunktionen
   ═══════════════════════════════════════════════════════════════════════ */

export const TX_LABELS: Record<string, string> = {
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

export function downloadCSV(filename: string, header: string, rows: string[]) {
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* ═══════════════════════════════════════════════════════════════════════
   Datenqualität-Metriken (PP: QuoteQualityMetrics)
   ═══════════════════════════════════════════════════════════════════════ */
export interface DQMetrics {
  erster: Date; letzter: Date; anzahl: number; erwartet: number;
  vollstaendigkeit: number;
  fehlendeDaten: Date[];
  unerwarteteDaten: Date[];
}

export function computeDQMetrics(kursHistorie: { datum: Date; kurs: number }[]): DQMetrics | null {
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
export type MenuEntry = MenuItem | MenuSep | MenuSub;

function isSubmenu(e: MenuEntry): e is MenuSub { return 'children' in e; }

export function ContextMenuPopup({ x, y, items, onClose }: { x: number; y: number; items: MenuEntry[]; onClose: () => void }) {
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
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => new Set(defaultFilters ?? ['onlyActive']));
  const [createOpen, setCreateOpen] = useState(false);
  const [colMenuPos, setColMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Dialoge
  const [txDialog, setTxDialog] = useState<{ wp: Wertpapier; typ: string } | null>(null);
  const [editDialog, setEditDialog] = useState<Wertpapier | null>(null);

  // Kontextmenüs
  const [mainCtx, setMainCtx] = useState<{ x: number; y: number; wpKey: string } | null>(null);

  const selectedWp = selected ? state.wertpapiere[selected] : null;
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
     DETAIL PANEL — ausgelagert nach WertpapierDetailPane
     ═══════════════════════════════════════════════════════════════════ */
  const detailPanel = (
    <WertpapierDetailPane
      wp={selectedWp}
      onUpdateWertpapier={updateWertpapier}
      onDeleteTransaktion={deleteTransaktion}
      onImportTransaktionen={importTransaktionen}
      storagePrefix="alle-wp"
    />
  );

  return (<>
    <SplitPane top={masterPanel} bottom={detailPanel} storageKey={filterTyp ? `wertpapiere-${filterTyp}` : 'alle-wertpapiere'} />

    {/* Haupttabelle Kontextmenü */}
    {mainCtx && state.wertpapiere[mainCtx.wpKey] && (
      <ContextMenuPopup x={mainCtx.x} y={mainCtx.y} onClose={() => setMainCtx(null)}
        items={buildMainCtxItems(state.wertpapiere[mainCtx.wpKey])} />
    )}

    {/* Dialoge */}
    {txDialog && <TransactionDialog wp={txDialog.wp} typ={txDialog.typ} onClose={() => setTxDialog(null)} onSave={handleSaveTx} />}
    {editDialog && <EditSecurityDialog wp={editDialog} onClose={() => setEditDialog(null)} onSave={patch => { updateWertpapier(editDialog.isin || editDialog.name, patch); }} />}
    {showRPDialog && <ReportingPeriodDialog onClose={() => setShowRPDialog(false)} onSelect={() => { /* dynamisch neue Spalten hinzufügen noch nicht implementiert */ }} />}
  </>);
}
