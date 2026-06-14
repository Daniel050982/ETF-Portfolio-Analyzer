import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { usePortfolio } from '../store/PortfolioContext';
import { SplitPane } from '../components/SplitPane';
import { WertpapierDetailPane } from '../components/WertpapierDetailPane';
import { ConfigStoreDropDowns } from '../components/StatementToolbar';
import { useConfigStore } from '../components/useConfigStore';
import { ReportingPeriodDialog, type ReportingPeriodResult } from '../components/ReportingPeriodDialog';
import { berechneVermoegensReihen, type ReihenId, type ReihenPunkt } from '../core/vermoegensReihen';
import { REIHEN_META, REIHEN_META_BY_ID } from '../core/vermoegensReihenMeta';
import { euro } from '../utils/format';
import { ChevronDown, Download, Settings, Plus, X } from 'lucide-react';

/* ════════════════════════════════════════════════════════════════════════
   Diagramm (Berichte → Vermögensaufstellung → Diagramm)
   1:1 Nachbau von PP StatementOfAssetsHistoryView
   (extends AbstractHistoricView → AbstractFinanceView).

   Klassenhierarchie / Toolbar laut PP-Source:
   - createHeader (AbstractFinanceView): [Titel] [viewToolBar] [actionToolBar]
   - viewToolBar  = DataSeriesConfigurator → ConfigurationStore-Buttons
     (gespeicherte Diagramm-Konfigurationen + "Neu"); jede Konfiguration
     hält ihre eigene Datenreihen-Auswahl.
   - actionToolBar (AbstractHistoricView.addButtons → super, dann
     StatementOfAssetsHistoryView.addButtons):
       1. ReportingPeriodDropDown            (AbstractHistoricView)
       2. Export-Button (Messages.MenuExportData "Daten exportieren")
       3. DropDown "Diagramm konfigurieren" (Messages.MenuConfigureChart)
          → Datenreihen-Auswahl + "Datenreihen zurücksetzen"
            (Messages.MenuResetChartSeries)
   - Titel: "Vermögensaufstellung - Historie (<configname>)"
     (Messages.LabelStatementOfAssetsHistory)
   - Untere Hälfte (addPanePages → InformationPane): SecurityPriceChart /
     HistoricalPrices / Transactions / Trades / SecurityEvents = unsere
     WertpapierDetailPane (Sash/SplitPane).

   PP-Default (DataSeriesSet.buildStatementOfAssetsDataSeries): nur die
   Gesamtsumme (TOTALS, schwarze Linie) ist sichtbar.
   ════════════════════════════════════════════════════════════════════════ */

const CFGSTORE_KEY = 'soa-history-cfgstore';
const SERIES_KEY = 'soa-history-series';   // aktive Datenreihen-Auswahl (ConfigStore folgt diesem Key)
const PERIOD_KEY = 'soa-history-period';

type Period = { key: string; label: string; days: number | null };

const BUILTIN_PERIODS: Period[] = [
  { key: '1M', label: '1 Monat', days: 30 },
  { key: '3M', label: '3 Monate', days: 91 },
  { key: '6M', label: '6 Monate', days: 182 },
  { key: '1J', label: '1 Jahr', days: 365 },
  { key: '3J', label: '3 Jahre', days: 1095 },
  { key: '5J', label: '5 Jahre', days: 1825 },
  { key: '10J', label: '10 Jahre', days: 3650 },
  { key: 'all', label: 'Gesamter Zeitraum', days: null },
];

/* ── Datenreihen-Auswahl pro Konfiguration ──
   Wir legen sie im SERIES_KEY im selben JSON-Format ab, das useConfigStore
   snapshottet (order/hidden), damit der ConfigStore beim Konfig-Wechsel die
   richtige Auswahl lädt: order = im Diagramm vorhandene Reihen,
   hidden = davon temporär ausgeblendete. */
interface SeriesSel { visible: ReihenId[]; hidden: ReihenId[]; }

function defaultSel(): SeriesSel {
  return { visible: REIHEN_META.filter(m => m.defaultAktiv).map(m => m.id), hidden: [] };
}

function loadSel(): SeriesSel {
  try {
    const raw = localStorage.getItem(SERIES_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const visible = (p.order ?? p.visible) as ReihenId[] | undefined;
      if (visible) return { visible, hidden: (p.hidden ?? []) as ReihenId[] };
    }
  } catch { /* */ }
  return defaultSel();
}

function saveSel(sel: SeriesSel) {
  // Format kompatibel zu useConfigStore (order/widths/sortCols/hidden).
  try {
    localStorage.setItem(SERIES_KEY, JSON.stringify({
      order: sel.visible, widths: {}, sortCols: [], hidden: sel.hidden,
    }));
  } catch { /* */ }
}

export default function StatementOfAssetsHistoryView() {
  const { state, addBerichtszeitraum, updateWertpapier, deleteTransaktion, importTransaktionen } = usePortfolio();

  // ── Konfigurations-Store (PP DataSeriesConfigurator / ConfigurationStore) ──
  // Bei Konfig-Wechsel schreibt der Store die Auswahl in SERIES_KEY; chartKey
  // remountet das Diagramm, damit es die neue Auswahl übernimmt.
  const [chartKey, setChartKey] = useState(0);
  const configStore = useConfigStore(CFGSTORE_KEY, SERIES_KEY, () => setChartKey(k => k + 1));

  return (
    <HistoryChart
      key={chartKey}
      state={state}
      configStore={configStore}
      addBerichtszeitraum={addBerichtszeitraum}
      updateWertpapier={updateWertpapier}
      deleteTransaktion={deleteTransaktion}
      importTransaktionen={importTransaktionen}
    />
  );
}

/* Innerer Chart — wird bei Konfig-Wechsel über chartKey neu gemountet und
   liest dann die in SERIES_KEY abgelegte Datenreihen-Auswahl frisch ein. */
function HistoryChart({
  state, configStore, addBerichtszeitraum, updateWertpapier, deleteTransaktion, importTransaktionen,
}: {
  state: ReturnType<typeof usePortfolio>['state'];
  configStore: ReturnType<typeof useConfigStore>;
  addBerichtszeitraum: ReturnType<typeof usePortfolio>['addBerichtszeitraum'];
  updateWertpapier: ReturnType<typeof usePortfolio>['updateWertpapier'];
  deleteTransaktion: ReturnType<typeof usePortfolio>['deleteTransaktion'];
  importTransaktionen: ReturnType<typeof usePortfolio>['importTransaktionen'];
}) {
  const initial = useMemo(() => loadSel(), []);
  const [visible, setVisible] = useState<Set<ReihenId>>(() => new Set(initial.visible));
  const [hidden, setHidden] = useState<Set<ReihenId>>(() => new Set(initial.hidden));

  // Auswahl bei jeder Änderung in den ConfigStore-Key zurückschreiben.
  useEffect(() => { saveSel({ visible: [...visible], hidden: [...hidden] }); }, [visible, hidden]);

  // ── Berichtszeitraum ──
  const extraPeriods = useMemo<Period[]>(
    () => state.berichtszeitraeume.map(b => ({ key: b.key, label: b.label, days: b.days })),
    [state.berichtszeitraeume],
  );
  const allPeriods = useMemo(() => {
    const seen = new Set<string>();
    return [...BUILTIN_PERIODS, ...extraPeriods].filter(p => !seen.has(p.key) && seen.add(p.key));
  }, [extraPeriods]);
  const [periodKey, setPeriodKey] = useState<string>(() => {
    try { return localStorage.getItem(PERIOD_KEY) || 'all'; } catch { return 'all'; }
  });
  useEffect(() => { try { localStorage.setItem(PERIOD_KEY, periodKey); } catch { /* */ } }, [periodKey]);
  const activePeriod = allPeriods.find(p => p.key === periodKey) ?? allPeriods[allPeriods.length - 1];

  // ── Zeitreihen-Berechnung (alle 19 Reihen über das volle Raster) ──
  const reihen = useMemo(
    () => berechneVermoegensReihen(state.transaktionen, state.wertpapiere),
    [state.transaktionen, state.wertpapiere],
  );

  // ── Auf den gewählten Berichtszeitraum beschneiden ──
  const chartData = useMemo(() => {
    if (reihen.length === 0) return [] as ReihenPunkt[];
    if (activePeriod?.days == null) return reihen;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - activePeriod.days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return reihen.filter(p => p.datum >= cutoffStr);
  }, [reihen, activePeriod]);

  // ── Jahres-Gitter (PP TimelineChart: vertikale Linien + Jahreszahl je Jahr) ──
  const yearTicks = useMemo(() => {
    const ticks: string[] = [];
    let lastYear = '';
    for (const p of chartData) {
      const y = p.datum.slice(0, 4);
      if (y !== lastYear) { ticks.push(p.datum); lastYear = y; }
    }
    return ticks;
  }, [chartData]);

  // ── Welche Reihen werden tatsächlich gezeichnet ──
  const drawn = useMemo(
    () => REIHEN_META.filter(m => visible.has(m.id) && !hidden.has(m.id)),
    [visible, hidden],
  );

  // ── Dropdowns / Dialoge ──
  const [periodOpen, setPeriodOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [showPeriodDialog, setShowPeriodDialog] = useState(false);

  const addPeriod = useCallback((r: ReportingPeriodResult) => {
    const days = r.days != null ? r.days : Math.max(0, Math.round((Date.now() - r.start.getTime()) / 86400000));
    addBerichtszeitraum({ key: r.key, label: r.label, days });
    setPeriodKey(r.key);
    setShowPeriodDialog(false);
  }, [addBerichtszeitraum]);

  const toggleSeries = useCallback((id: ReihenId) => {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleHidden = useCallback((id: ReihenId) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const removeSeries = useCallback((id: ReihenId) => {
    setVisible(prev => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  const resetSeries = useCallback(() => {
    const d = defaultSel();
    setVisible(new Set(d.visible));
    setHidden(new Set(d.hidden));
  }, []);

  // ── CSV-Export ──
  const exportCSV = useCallback(() => {
    if (chartData.length === 0) return;
    const cols = REIHEN_META.filter(m => visible.has(m.id));
    const head = ['Datum', ...cols.map(c => c.label)].join(';');
    const rows = chartData.map(p =>
      [p.datum, ...cols.map(c => String(p[c.id]).replace('.', ','))].join(';'),
    );
    const csv = [head, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'vermoegensaufstellung-historie.csv';
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [chartData, visible]);

  const fmtTick = (d: string) => d.slice(0, 4); // Jahreszahl

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar (PP createHeader) ── */}
      <div className="flex items-center px-2 py-[3px] gap-2 overflow-hidden"
        style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
        {/* 1. Titel mit aktivem Konfigurationsnamen */}
        <span className="text-[12px] font-semibold whitespace-nowrap flex-shrink-0" style={{ color: 'var(--pp-text)' }}>
          Vermögensaufstellung - Historie ({configStore.activeName})
        </span>

        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          {/* 2. viewToolBar: ConfigStore-Buttons (DataSeriesConfigurator) */}
          <ConfigStoreDropDowns
            configs={configStore.configs}
            activeId={configStore.activeId}
            onActivate={configStore.activate}
            onDuplicate={configStore.createNew}
            onRename={configStore.rename}
            onDelete={configStore.remove}
            onBringToFront={configStore.bringToFront}
            onNew={() => configStore.createNew(null)}
          />
          <div style={{ width: 1, height: 16, background: 'var(--pp-border)', margin: '0 4px', flexShrink: 0 }} />

          {/* 3. actionToolBar: ReportingPeriod · Export · Diagramm konfigurieren */}
          {/* ReportingPeriodDropDown */}
          <div className="relative">
            <button className="pp-toolbar-btn flex items-center gap-1 px-2" style={{ width: 'auto' }}
              title="Berichtszeitraum" onClick={() => { setPeriodOpen(o => !o); setExportOpen(false); setConfigOpen(false); }}>
              <span className="text-[11px]">{activePeriod?.label}</span>
              <ChevronDown size={12} />
            </button>
            {periodOpen && (
              <DropMenu onClose={() => setPeriodOpen(false)}>
                {allPeriods.map(p => (
                  <DropItem key={p.key} active={p.key === periodKey}
                    onClick={() => { setPeriodKey(p.key); setPeriodOpen(false); }}>
                    {p.label}
                  </DropItem>
                ))}
                <div style={{ borderTop: '1px solid var(--pp-border)', margin: '3px 0' }} />
                <DropItem onClick={() => { setShowPeriodDialog(true); setPeriodOpen(false); }}>
                  <span className="flex items-center gap-1"><Plus size={11} /> Neuer Zeitraum…</span>
                </DropItem>
              </DropMenu>
            )}
          </div>
          {/* Export-DropDown (Messages.MenuExportData) */}
          <div className="relative">
            <button className="pp-toolbar-btn" title="Daten exportieren"
              onClick={() => { setExportOpen(o => !o); setPeriodOpen(false); setConfigOpen(false); }}>
              <Download size={14} />
            </button>
            {exportOpen && (
              <DropMenu onClose={() => setExportOpen(false)}>
                <DropItem onClick={exportCSV}>Werte als CSV exportieren…</DropItem>
              </DropMenu>
            )}
          </div>
          {/* Diagramm konfigurieren (Messages.MenuConfigureChart) */}
          <div className="relative">
            <button className="pp-toolbar-btn" title="Diagramm konfigurieren"
              onClick={() => { setConfigOpen(o => !o); setPeriodOpen(false); setExportOpen(false); }}>
              <Settings size={14} />
            </button>
            {configOpen && (
              <DropMenu onClose={() => setConfigOpen(false)} wide>
                <div className="px-2 py-1 text-[11px] font-semibold" style={{ color: 'var(--pp-text-muted)' }}>
                  Datenreihen
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {REIHEN_META.map(m => (
                    <label key={m.id}
                      className="flex items-center gap-2 px-2 py-[3px] cursor-pointer text-[11px] hover:bg-[var(--pp-hover)]">
                      <input type="checkbox" checked={visible.has(m.id)} onChange={() => toggleSeries(m.id)} />
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: m.farbe, flexShrink: 0 }} />
                      <span>{m.label}</span>
                    </label>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--pp-border)', margin: '3px 0' }} />
                {/* Messages.MenuResetChartSeries */}
                <DropItem onClick={resetSeries}>Datenreihen zurücksetzen</DropItem>
              </DropMenu>
            )}
          </div>
        </div>
      </div>

      {showPeriodDialog && (
        <ReportingPeriodDialog onClose={() => setShowPeriodDialog(false)} onSelect={addPeriod} />
      )}

      <SplitPane storageKey="soa-history" defaultTopPercent={70}
        top={
          <div className="flex flex-col h-full">
            {chartData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
                Keine Daten vorhanden.
              </div>
            ) : (
              <>
                <div className="flex-1 p-3 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" vertical={false} />
                      {/* Jahres-Gitter: gestrichelte vertikale Linien am Jahreswechsel */}
                      {yearTicks.map(t => (
                        <ReferenceLine key={t} x={t} stroke="var(--pp-border)" strokeDasharray="4 3" />
                      ))}
                      <XAxis dataKey="datum" tickFormatter={fmtTick} ticks={yearTicks}
                        tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }} tickLine={false} />
                      <YAxis tickFormatter={(v: number) => euro(v)} tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }} tickLine={false} width={90} orientation="right" />
                      <Tooltip
                        labelFormatter={(d) => formatDate(d as string)}
                        formatter={(value, name) => [euro(value as number), REIHEN_META_BY_ID[name as ReihenId]?.label ?? String(name)]}
                        contentStyle={{ fontSize: '11px', background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                      />
                      {/* Reihenfolge: erst Flächen, dann Balken, dann Linien (oben) */}
                      {drawn.filter(m => m.typ === 'area').map(m => (
                        <Area key={m.id} type="stepAfter" dataKey={m.id} stroke={m.farbe} strokeWidth={1.5}
                          fill={m.farbe} fillOpacity={0.18} dot={false} isAnimationActive={false} />
                      ))}
                      {drawn.filter(m => m.typ === 'bar').map(m => (
                        <Bar key={m.id} dataKey={m.id} fill={m.farbe} isAnimationActive={false} />
                      ))}
                      {drawn.filter(m => m.typ === 'line').map(m => (
                        <Line key={m.id} type={m.id === 'TOTALS' ? 'monotone' : 'stepAfter'} dataKey={m.id}
                          stroke={m.farbe} strokeWidth={m.id === 'TOTALS' ? 2 : 1.5} dot={false} isAnimationActive={false} />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {/* ── Legende (PP: Marker + Name, Klick = aus-/einblenden, X = entfernen) ── */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 py-2 overflow-y-auto"
                  style={{ borderTop: '1px solid var(--pp-border)', maxHeight: 84, flexShrink: 0 }}>
                  {REIHEN_META.filter(m => visible.has(m.id)).map(m => {
                    const isHidden = hidden.has(m.id);
                    return (
                      <span key={m.id} className="group flex items-center gap-1.5 text-[11px] select-none">
                        <button className="flex items-center gap-1.5" title={isHidden ? 'Einblenden' : 'Ausblenden'}
                          onClick={() => toggleHidden(m.id)} style={{ opacity: isHidden ? 0.4 : 1 }}>
                          <span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 2, background: m.farbe, flexShrink: 0 }} />
                          <span style={{ textDecoration: isHidden ? 'line-through' : 'none', color: 'var(--pp-text)' }}>{m.label}</span>
                        </button>
                        <button className="opacity-0 group-hover:opacity-100" title="Aus Diagramm entfernen"
                          onClick={() => removeSeries(m.id)} style={{ color: 'var(--pp-text-muted)' }}>
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                  {visible.size === 0 && (
                    <span className="text-[11px]" style={{ color: 'var(--pp-text-muted)' }}>
                      Keine Datenreihe gewählt — über „Diagramm konfigurieren“ hinzufügen.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        }
        bottom={
          <WertpapierDetailPane
            wp={null}
            onUpdateWertpapier={updateWertpapier}
            onDeleteTransaktion={deleteTransaktion}
            onImportTransaktionen={importTransaktionen}
            storagePrefix="soa-history-detail"
          />
        }
      />
    </div>
  );
}

function formatDate(d: string): string {
  // d = 'YYYY-MM-DD' → 'DD.MM.YYYY'
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

/* ── Kleines Dropdown-Menü (Klick außerhalb schließt) ── */
function DropMenu({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 mt-1 py-1 rounded shadow-lg z-50"
      style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', minWidth: wide ? 240 : 180 }}>
      {children}
    </div>
  );
}

function DropItem({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick}
      className="w-full text-left px-3 py-[3px] text-[11px] hover:bg-[var(--pp-hover)]"
      style={{ color: 'var(--pp-text)', background: active ? 'var(--pp-hover)' : 'transparent' }}>
      {children}
    </button>
  );
}
