import { useMemo, useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { ColorMarker, getColor, TabBar } from '../components/PPElements';
import { SplitPane } from '../components/SplitPane';
import { useColumnConfig, ColumnHeader, type ColumnDef } from '../components/useColumnConfig';
import { HierarchyMenu, type MenuNode } from '../components/HierarchyMenu';
import { VermoegensaufstellungPane, type KontoRow } from '../components/VermoegensaufstellungPane';
import { computeDepotPositions, REPORT_PERIODS, type ReportPeriod } from '../components/vermoegenLogic';
import type { ReportingPeriodResult } from '../components/ReportingPeriodDialog';
import { euro } from '../utils/format';
import { Plus, Settings, Layers, ChevronRight, ChevronDown } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { Gruppierung, Wertpapier, Transaktion } from '../types/portfolio';

/* ════════════════════════════════════════════════════════════════════════
   Gruppierte Konten — 1:1 Nachbau von PP GroupedAccountsListView.java.

   Obere Tabelle: TreeViewer. Top-Level = Gruppierungen (ClientFilterMenu.Item),
   Kinder = enthaltene Konten/Depots. Spalten: Stammdaten | Kontostand | Notiz.
   Drag&Drop ordnet die Gruppierungen um. Kontextmenü: Elemente hinzufügen /
   Löschen (Gruppe) bzw. Entfernen (Kind). Doppelklick = Name inline editieren.
   Toolbar: "Neuer Filter..." (Dialog Konten/Depots wählen) + Spaltenmenü.

   Untere Tabelle (PP InformationPanePages, abhängig von der Auswahl oben):
   Vermögensaufstellung | Diagramm (Kontostand-Verlauf) | Bestand (Tortendiagr.).
   ════════════════════════════════════════════════════════════════════════ */

const SHARES_ADD = new Set(['kauf', 'umbuchung_ein']);
const SHARES_SUB = new Set(['verkauf', 'umbuchung_aus']);
const PIE_COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];

const PANE_TABS = [
  { id: 'vermoegen', label: 'Vermögensaufstellung' },
  { id: 'diagramm', label: 'Diagramm' },
  { id: 'bestand', label: 'Bestand' },
];

// PP GroupedAccountsListView: NameColumn (Stammdaten, nicht entfernbar) | Kontostand | Notiz
const TOP_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Stammdaten', width: 300 },
  { id: 'kontostand', label: 'Kontostand', align: 'right', width: 120 },
  { id: 'notiz', label: 'Notiz', width: 200 },
];

interface AssetRow { key: string; name: string; typ: 'wertpapier' | 'konto'; wert: number; farbe?: string }

/* Marktwert je Wertpapier in einem Depot (aktueller Bestand × letzter Kurs). */
function depotPositions(depotName: string, transaktionen: Transaktion[], wertpapiere: Record<string, Wertpapier>): AssetRow[] {
  const grouped = new Map<string, number>();
  for (const tx of transaktionen) {
    if (tx.depotName !== depotName) continue;
    if (!SHARES_ADD.has(tx.typ) && !SHARES_SUB.has(tx.typ)) continue;
    const key = tx.isin || tx.wertpapierName;
    if (!key) continue;
    grouped.set(key, (grouped.get(key) ?? 0) + (SHARES_ADD.has(tx.typ) ? tx.stueck : -tx.stueck));
  }
  const rows: AssetRow[] = [];
  for (const [key, shares] of grouped) {
    if (Math.abs(shares) < 0.0001) continue;
    const wp = wertpapiere[key];
    const kurs = wp?.letzterKurs ?? wp?.kursHistorie?.at(-1)?.kurs ?? 0;
    rows.push({ key, name: wp?.name ?? key, typ: 'wertpapier', wert: shares * kurs, farbe: wp?.typFarbe });
  }
  return rows;
}

export default function GruppierteKontenView() {
  const {
    state, addGruppierung, renameGruppierung, deleteGruppierung, setGruppierungNotiz,
    gruppierungAddElemente, gruppierungRemoveElement, reorderGruppierungen, addBerichtszeitraum,
  } = usePortfolio();

  const gruppierungen = state.gruppierungen;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('gruppierte-konten-expanded') ?? '[]')); } catch { return new Set(); }
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; kind: 'gruppe'; id: string } | { x: number; y: number; kind: 'element'; id: string; elTyp: 'konto' | 'depot'; elName: string } | null>(null);
  const [neuDialog, setNeuDialog] = useState(false);
  const [addElementeFor, setAddElementeFor] = useState<string | null>(null);
  const [paneTab, setPaneTab] = useState('vermoegen');
  const [dragId, setDragId] = useState<string | null>(null);
  // Spaltenkonfiguration der oberen Tree-Tabelle
  const topCfg = useColumnConfig('gruppierte-konten-top', TOP_COLUMNS);
  const [topMenuOpen, setTopMenuOpen] = useState(false);

  // Default-Auswahl: erste Gruppierung
  useEffect(() => {
    if (selectedId === null && gruppierungen.length > 0) setSelectedId(gruppierungen[0].id);
    if (selectedId !== null && !gruppierungen.some(g => g.id === selectedId)) {
      setSelectedId(gruppierungen[0]?.id ?? null);
    }
  }, [gruppierungen, selectedId]);

  const persistExpanded = useCallback((s: Set<string>) => {
    setExpanded(new Set(s));
    try { localStorage.setItem('gruppierte-konten-expanded', JSON.stringify([...s])); } catch { /* */ }
  }, []);
  const toggleExpand = (id: string) => {
    const s = new Set(expanded);
    if (s.has(id)) s.delete(id); else s.add(id);
    persistExpanded(s);
  };

  // Kontostand / Marktwert / Gruppensumme
  const kontoSaldo = (name: string) => state.konten[name]?.saldo ?? 0;
  const depotMarktwert = useCallback((depotName: string) =>
    depotPositions(depotName, state.transaktionen, state.wertpapiere).reduce((s, r) => s + r.wert, 0),
    [state.transaktionen, state.wertpapiere]);
  const gruppeWert = useCallback((g: Gruppierung) =>
    g.kontoNamen.reduce((s, n) => s + kontoSaldo(n), 0) + g.depotNamen.reduce((s, n) => s + depotMarktwert(n), 0),
    [state.konten, depotMarktwert]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = gruppierungen.find(g => g.id === selectedId) ?? null;

  // ── Berichtszeiträume: ZENTRAL aus dem globalen State (PP ClientInput.
  //    reportingPeriods) — von allen Tabs/Tabellen geteilt. ──
  const reportPeriods = state.berichtszeitraeume;
  const addReportingPeriod = useCallback((r: ReportingPeriodResult) => {
    const days = r.days != null ? r.days : Math.max(0, Math.round((Date.now() - r.start.getTime()) / 86400000));
    addBerichtszeitraum({ key: r.key, label: r.label, days });
  }, [addBerichtszeitraum]);

  // Echte Taxonomien + Klassifizierungs-Lookup (für Klassifizierungs-Spalten/Gruppierung)
  const taxonomien = useMemo(() => state.taxonomien.map(t => ({ id: t.id, name: t.name })), [state.taxonomien]);
  const klassByTax = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const t of state.taxonomien) {
      const wpToKlass = new Map<string, string>();
      const walk = (k: { name: string; kinder: typeof k[]; zuweisungen: { wertpapierKey: string }[] }) => {
        for (const z of k.zuweisungen) if (!wpToKlass.has(z.wertpapierKey)) wpToKlass.set(z.wertpapierKey, k.name);
        for (const child of k.kinder) walk(child);
      };
      for (const child of t.wurzel.kinder) walk(child);
      m.set(t.id, wpToKlass);
    }
    return m;
  }, [state.taxonomien]);

  // Positionen aller Depots der gewählten Gruppierung (volle Vermögensaufstellung)
  const refKontoForDepot = useCallback((d: string) => state.depots[d]?.referenzkontoName, [state.depots]);
  const selectedPositions = useMemo(() =>
    selected ? computeDepotPositions(selected.depotNamen, state.transaktionen, state.wertpapiere, reportPeriods, refKontoForDepot) : [],
    [selected, state.transaktionen, state.wertpapiere, reportPeriods, refKontoForDepot]);
  // Konto-Zeilen der Gruppierung (Salden ≠ 0)
  const selectedKontoRows = useMemo((): KontoRow[] =>
    selected ? selected.kontoNamen.map(n => ({ name: n, saldo: kontoSaldo(n), farbe: state.konten[n]?.farbe })).filter(k => Math.abs(k.saldo) > 0.001) : [],
    [selected, state.konten]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bestand-Tab (Tortendiagramm) + Daten für Diagramm ──
  const assetRows = useMemo((): AssetRow[] => {
    if (!selected) return [];
    const rows: AssetRow[] = [];
    for (const dep of selected.depotNamen) rows.push(...depotPositions(dep, state.transaktionen, state.wertpapiere));
    for (const k of selected.kontoNamen) {
      const saldo = kontoSaldo(k);
      if (Math.abs(saldo) > 0.001) rows.push({ key: `konto:${k}`, name: k, typ: 'konto', wert: saldo, farbe: state.konten[k]?.farbe });
    }
    return rows.sort((a, b) => b.wert - a.wert);
  }, [selected, state.transaktionen, state.wertpapiere, state.konten]); // eslint-disable-line react-hooks/exhaustive-deps

  const pieData = useMemo(() => assetRows.filter(r => r.wert > 0).map((r, i) => ({
    name: r.name, value: r.wert, color: r.farbe || PIE_COLORS[i % PIE_COLORS.length],
  })), [assetRows]);

  // Kontostand-Verlauf (Monatsenden) — PP GroupedAccountBalancePane
  const balanceSeries = useMemo(() => {
    if (!selected) return [];
    const depotTxs = state.transaktionen
      .filter(tx => selected.depotNamen.includes(tx.depotName ?? '') && (SHARES_ADD.has(tx.typ) || SHARES_SUB.has(tx.typ)))
      .sort((a, b) => a.datum.getTime() - b.datum.getTime());
    if (depotTxs.length === 0) return [];
    const start = new Date(depotTxs[0].datum.getFullYear(), depotTxs[0].datum.getMonth() + 1, 0);
    const today = new Date();
    const samples: Date[] = [];
    for (let d = start; d < today; d = new Date(d.getFullYear(), d.getMonth() + 2, 0)) samples.push(d);
    samples.push(today);
    const result: { datum: string; wert: number }[] = [];
    let idx = 0; const shares = new Map<string, number>();
    const kursAm = (key: string, datum: Date) => {
      const wp = state.wertpapiere[key];
      const hist = wp?.kursHistorie ?? [];
      if (hist.length === 0) return wp?.letzterKurs ?? 0;
      let k = hist[0].kurs;
      for (const h of hist) { if (h.datum <= datum) k = h.kurs; else break; }
      return k;
    };
    for (const sample of samples) {
      while (idx < depotTxs.length && depotTxs[idx].datum <= sample) {
        const tx = depotTxs[idx]; const key = tx.isin || tx.wertpapierName;
        shares.set(key, (shares.get(key) ?? 0) + (SHARES_ADD.has(tx.typ) ? tx.stueck : -tx.stueck));
        idx++;
      }
      let wert = 0;
      for (const [key, anz] of shares) { if (anz > 0.0001) wert += anz * kursAm(key, sample); }
      result.push({ datum: sample.toLocaleDateString('de-DE', { month: '2-digit', year: '2-digit' }), wert });
    }
    return result;
  }, [selected, state.transaktionen, state.wertpapiere]);

  // ── Drag&Drop der Gruppierungen ──
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const ids = gruppierungen.map(g => g.id);
    const from = ids.indexOf(dragId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    ids.splice(from, 1);
    ids.splice(ids.indexOf(targetId) + (to > from ? 1 : 0), 0, dragId);
    reorderGruppierungen(ids);
    setDragId(null);
  };

  // ── Spaltenmenüs (Sichtbarkeit ein-/ausblenden) ──
  // PP ShowHideColumnHelper.menuAboutToShow: Spalten-Checks + "Spalten zurücksetzen"
  const topMenuNodes: MenuNode[] = [
    ...TOP_COLUMNS.map((c): MenuNode => ({
      kind: 'check', label: c.label, checked: !topCfg.hidden.has(c.id),
      onToggle: () => { if (c.id !== 'name') topCfg.toggleHidden(c.id); }, // Stammdaten nicht entfernbar (PP setRemovable(false))
    })),
    { kind: 'separator' },
    { kind: 'action', label: 'Spalten zurücksetzen', onClick: () => topCfg.resetColumns() },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Kopfzeile mit Toolbar (PP addButtons: Neuer Filter + Spaltenmenü) */}
      <div className="flex items-center px-2 py-[3px]" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
        <span className="text-[12px] font-semibold" style={{ color: 'var(--pp-text)' }}>Gruppierte Konten</span>
        <div className="ml-auto flex items-center gap-1">
          <button className="pp-toolbar-btn" title="Neuer Filter..." onClick={() => setNeuDialog(true)}><Plus size={13} /></button>
          <div className="relative">
            <button className="pp-toolbar-btn" title="Spalten anzeigen / ausblenden" onClick={() => setTopMenuOpen(o => !o)}><Settings size={12} /></button>
            {topMenuOpen && <HierarchyMenu nodes={topMenuNodes} onClose={() => setTopMenuOpen(false)} />}
          </div>
        </div>
      </div>

      {gruppierungen.length === 0 ? (
        <div className="p-4 text-[11px]" style={{ color: 'var(--pp-text-muted)', lineHeight: 1.6 }}>
          In dieser Ansicht kannst du „gruppierte Konten" verwalten, um Auswertungen auf bestimmte Depots und Konten
          zu beschränken. Erstelle oben rechts mit „+" eine neue Gruppierung und füge über das Kontextmenü weitere
          Konten oder Depots hinzu. Die Reihenfolge kannst du einfach per Drag-and-Drop anpassen.
        </div>
      ) : (
        <SplitPane storageKey="gruppierte-konten" defaultTopPercent={50}
          top={
            <div className="flex-1 overflow-auto h-full" onClick={() => setCtxMenu(null)}>
              <table className="pp-table">
                <thead>
                  <tr>
                    {topCfg.orderedColumns.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={topCfg} />)}
                  </tr>
                </thead>
                <tbody>
                  {gruppierungen.map(g => {
                    const isOpen = expanded.has(g.id);
                    const children: { typ: 'konto' | 'depot'; name: string; wert: number }[] = [
                      ...g.depotNamen.map(n => ({ typ: 'depot' as const, name: n, wert: depotMarktwert(n) })),
                      ...g.kontoNamen.map(n => ({ typ: 'konto' as const, name: n, wert: kontoSaldo(n) })),
                    ];
                    // Zellinhalt der Gruppen-Zeile je Spalte
                    const groupCell = (id: string) => {
                      if (id === 'name') return (
                        <span className="flex items-center gap-1" style={{ cursor: 'pointer' }}>
                          <span onClick={e => { e.stopPropagation(); toggleExpand(g.id); }}
                            style={{ display: 'inline-flex', width: 14, color: 'var(--pp-text-muted)' }}>
                            {children.length > 0 ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
                          </span>
                          <Layers size={12} style={{ color: 'var(--pp-accent)' }} />
                          {editId === g.id ? (
                            <input autoFocus defaultValue={g.name}
                              onClick={e => e.stopPropagation()}
                              onBlur={e => { renameGruppierung(g.id, e.target.value); setEditId(null); }}
                              onKeyDown={e => { if (e.key === 'Enter') { renameGruppierung(g.id, (e.target as HTMLInputElement).value); setEditId(null); } else if (e.key === 'Escape') setEditId(null); }}
                              style={{ flex: 1, padding: '1px 4px', fontSize: 12, background: 'var(--pp-content-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-accent)', borderRadius: 2 }} />
                          ) : (
                            <span style={{ fontWeight: 600 }} onDoubleClick={e => { e.stopPropagation(); setEditId(g.id); }}>{g.name}</span>
                          )}
                        </span>
                      );
                      if (id === 'kontostand') return euro(gruppeWert(g));
                      if (id === 'notiz') return editNoteId === g.id ? (
                        <input autoFocus defaultValue={g.notiz ?? ''}
                          onClick={e => e.stopPropagation()}
                          onBlur={e => { setGruppierungNotiz(g.id, e.target.value); setEditNoteId(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') { setGruppierungNotiz(g.id, (e.target as HTMLInputElement).value); setEditNoteId(null); } else if (e.key === 'Escape') setEditNoteId(null); }}
                          style={{ width: '100%', padding: '1px 4px', fontSize: 12, background: 'var(--pp-content-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-accent)', borderRadius: 2 }} />
                      ) : (
                        <span style={{ display: 'block', width: '100%', color: 'var(--pp-text-muted)' }}
                          onDoubleClick={e => { e.stopPropagation(); setEditNoteId(g.id); }}>{g.notiz ?? ''}</span>
                      );
                      return '';
                    };
                    return (
                      <Fragment key={g.id}>
                        <tr className={`pp-row${selectedId === g.id ? ' selected' : ''}`}
                          draggable
                          onDragStart={() => setDragId(g.id)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => onDrop(g.id)}
                          style={{ opacity: dragId === g.id ? 0.5 : 1, cursor: 'pointer' }}
                          onClick={() => setSelectedId(g.id)}
                          onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'gruppe', id: g.id }); }}>
                          {topCfg.orderedColumns.map(c => (
                            <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}
                              style={c.id === 'kontostand' ? { fontWeight: 600 } : undefined}>
                              {groupCell(c.id)}
                            </td>
                          ))}
                        </tr>
                        {isOpen && children.map(c => (
                          <tr key={`${g.id}-${c.typ}-${c.name}`} className="pp-row"
                            onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'element', id: g.id, elTyp: c.typ, elName: c.name }); }}>
                            {topCfg.orderedColumns.map(col => (
                              <td key={col.id} className={col.align === 'right' ? 'right mono' : undefined}>
                                {col.id === 'name' ? (
                                  <span className="flex items-center gap-1.5" style={{ paddingLeft: 30 }}>
                                    <ColorMarker color={getColor(c.name)} />{c.name}
                                  </span>
                                ) : col.id === 'kontostand' ? euro(c.wert) : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          }
          bottom={
            <div className="flex flex-col h-full">
              <TabBar tabs={PANE_TABS} active={paneTab} onChange={setPaneTab} />
              <div className="flex-1 overflow-hidden flex flex-col">
                {!selected ? (
                  <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>Keine Gruppierung gewählt</div>
                ) : paneTab === 'vermoegen' ? (
                  <VermoegensaufstellungPane
                    storageKey={`gruppierte-konten-asset-${selected.id}`}
                    positions={selectedPositions}
                    kontoRows={selectedKontoRows}
                    taxonomien={taxonomien}
                    klassByTax={klassByTax}
                    basisWaehrung={state.basisWaehrung}
                    reportPeriods={reportPeriods}
                    onAddPeriod={addReportingPeriod}
                    exportFileName={`${selected.name}_vermoegensaufstellung`}
                  />
                ) : paneTab === 'diagramm' ? (
                  <div className="p-3 h-full">
                    {balanceSeries.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={balanceSeries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
                          <XAxis dataKey="datum" tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} width={70} domain={['auto', 'auto']} />
                          <ReTooltip contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }} formatter={(v) => [euro(v as number), '']} />
                          <Line type="monotone" dataKey="wert" stroke="var(--pp-accent)" strokeWidth={1.5} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>Keine Daten vorhanden</div>
                    )}
                  </div>
                ) : (
                  pieData.length > 0 ? (
                    <div className="p-3 h-full flex">
                      <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" innerRadius="30%" strokeWidth={1} stroke="var(--pp-bg)">
                              {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                            <ReTooltip contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }} formatter={(v) => [euro(v as number), '']} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-[200px] overflow-auto text-[10px] pl-2">
                        {pieData.map((d, i) => (
                          <div key={i} className="flex items-center gap-1.5 py-[2px]">
                            <span className="inline-block w-[8px] h-[8px] rounded-[1px] flex-shrink-0" style={{ backgroundColor: d.color }} />
                            <span className="truncate" style={{ color: 'var(--pp-text)' }}>{d.name}</span>
                            <span className="ml-auto" style={{ color: 'var(--pp-text-muted)' }}>{euro(d.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>Keine Daten vorhanden</div>
                  )
                )}
              </div>
            </div>
          }
        />
      )}

      {/* Kontextmenü */}
      {ctxMenu && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}>
          {ctxMenu.kind === 'gruppe' ? (
            <>
              <CtxItem label="Elemente hinzufügen" onClick={() => { setAddElementeFor(ctxMenu.id); setCtxMenu(null); }} />
              <div style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />
              <CtxItem label="Löschen" danger onClick={() => {
                const g = gruppierungen.find(x => x.id === ctxMenu.id);
                if (g && confirm(`Filter '${g.name}' wirklich löschen?`)) deleteGruppierung(ctxMenu.id);
                setCtxMenu(null);
              }} />
            </>
          ) : (
            <CtxItem label="Entfernen" onClick={() => {
              gruppierungRemoveElement(ctxMenu.id, { typ: ctxMenu.elTyp, name: ctxMenu.elName });
              setCtxMenu(null);
            }} />
          )}
        </CtxMenu>
      )}

      {/* "Neuer Filter..."-Dialog */}
      {neuDialog && (
        <ElementeDialog
          titel="Konten und Depots wählen"
          mitName
          kontoNamen={Object.keys(state.konten)}
          depotNamen={Object.keys(state.depots)}
          onClose={() => setNeuDialog(false)}
          onConfirm={(name, kontoNamen, depotNamen) => {
            const label = name.trim() || [...depotNamen, ...kontoNamen].join(', ');
            const id = `grp-${Date.now()}-${Math.floor(performance.now())}`;
            addGruppierung({ id, name: label, kontoNamen, depotNamen });
            setSelectedId(id);
            setNeuDialog(false);
          }}
        />
      )}

      {/* "Elemente hinzufügen"-Dialog */}
      {addElementeFor && (() => {
        const g = gruppierungen.find(x => x.id === addElementeFor);
        if (!g) return null;
        return (
          <ElementeDialog
            titel="Konten und Depots wählen"
            kontoNamen={Object.keys(state.konten).filter(n => !g.kontoNamen.includes(n))}
            depotNamen={Object.keys(state.depots).filter(n => !g.depotNamen.includes(n))}
            onClose={() => setAddElementeFor(null)}
            onConfirm={(_name, kontoNamen, depotNamen) => {
              gruppierungAddElemente(addElementeFor, kontoNamen, depotNamen);
              setAddElementeFor(null);
            }}
          />
        );
      })()}
    </div>
  );
}

/* ── Kontextmenü (Fixed, schließt bei Klick außerhalb) ── */
function CtxMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} style={{ position: 'fixed', left: x, top: y, zIndex: 9000, minWidth: 180, padding: '4px 0',
      background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
      {children}
    </div>
  );
}
function CtxItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '3px 12px', fontSize: 11, border: 'none', background: 'transparent', cursor: 'pointer', color: danger ? 'var(--pp-red-text)' : 'var(--pp-text)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      {label}
    </button>
  );
}

/* ── Dialog: Konten & Depots wählen (+ optional Name) — PP ListSelectionDialog ── */
function ElementeDialog({ titel, mitName, kontoNamen, depotNamen, onClose, onConfirm }: {
  titel: string; mitName?: boolean;
  kontoNamen: string[]; depotNamen: string[];
  onClose: () => void;
  onConfirm: (name: string, kontoNamen: string[], depotNamen: string[]) => void;
}) {
  const [name, setName] = useState('');
  const [selKonten, setSelKonten] = useState<Set<string>>(new Set());
  const [selDepots, setSelDepots] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const s = new Set(set); if (s.has(v)) s.delete(v); else s.add(v); setter(s);
  };
  const row = (label: string, checked: boolean, onToggle: () => void) => (
    <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 4px', fontSize: 12, color: 'var(--pp-text)', cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ accentColor: 'var(--pp-accent)' }} />
      {label}
    </label>
  );
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--pp-sidebar-bg)', border: '1px solid var(--pp-border)', borderRadius: 6, padding: 16, minWidth: 360, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--pp-text)', marginBottom: 10 }}>Konten und Depots</div>
        <div style={{ fontSize: 11, color: 'var(--pp-text-muted)', marginBottom: 10 }}>{titel}</div>
        {mitName && (
          <input autoFocus placeholder="Name" value={name} onChange={e => setName(e.target.value)}
            style={{ width: '100%', padding: '4px 8px', fontSize: 12, marginBottom: 10, background: 'var(--pp-content-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)', borderRadius: 3 }} />
        )}
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--pp-border)', borderRadius: 3, padding: 4, minHeight: 120 }}>
          {depotNamen.length > 0 && <div style={{ fontSize: 10, color: 'var(--pp-text-muted)', padding: '2px 4px' }}>Depots</div>}
          {depotNamen.map(n => row(n, selDepots.has(n), () => toggle(selDepots, setSelDepots, n)))}
          {kontoNamen.length > 0 && <div style={{ fontSize: 10, color: 'var(--pp-text-muted)', padding: '4px 4px 2px' }}>Konten</div>}
          {kontoNamen.map(n => row(n, selKonten.has(n), () => toggle(selKonten, setSelKonten, n)))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="pp-toolbar-btn" style={{ padding: '4px 16px' }} onClick={onClose}>Abbrechen</button>
          <button className="pp-toolbar-btn" style={{ padding: '4px 16px', background: 'var(--pp-accent)', color: '#fff' }}
            disabled={selKonten.size + selDepots.size === 0}
            onClick={() => onConfirm(name, [...selKonten], [...selDepots])}>OK</button>
        </div>
      </div>
    </div>
  );
}
