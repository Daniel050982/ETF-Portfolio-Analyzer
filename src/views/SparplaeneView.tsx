import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { SplitPane } from '../components/SplitPane';
import { TabBar, ColorMarker, getColor } from '../components/PPElements';
import { useUmsaetze } from '../components/UmsaetzePane';
import { euro, datumKurz } from '../utils/format';
import { Plus, Settings, Check, Download } from 'lucide-react';
import { ResponsiveContainer, Tooltip as ReTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { Sparplan, SparplanTyp, Transaktion } from '../types/portfolio';

/* ════════════════════════════════════════════════════════════════════════
   Sparpläne — 1:1 Nachbau von PP InvestmentPlanListView.java.
   Obere Tabelle: Name | Wertpapier | Depot | Konto | Anfangsdatum |
   Letzte Ausführung | Nächste Ausführung | Intervall | Betrag | Gebühren |
   Steuern | Automatisch erstellen | Notiz (hidden). Inline-Editing, Sortierung,
   Spaltenmenü. Toolbar: "Neuer Sparplan..." (4 Typen) + Spaltenmenü.
   Kontextmenü: Buchungen erstellen | Sparplan editieren... | Sparplan löschen.
   Untere Tabelle: Umsätze | Diagramm | Historische Kurse (zum WP des Sparplans).
   ════════════════════════════════════════════════════════════════════════ */

const SHARES_ADD = new Set(['kauf', 'umbuchung_ein']);
const SHARES_SUB = new Set(['verkauf', 'umbuchung_aus']);

const PANE_TABS = [
  { id: 'umsaetze', label: 'Umsätze' },
  { id: 'diagramm', label: 'Diagramm' },
  { id: 'historische-kurse', label: 'Historische Kurse' },
];

const TYP_OPTIONS: { typ: SparplanTyp; label: string }[] = [
  { typ: 'kauf', label: 'Wertpapierkauf/-einlieferung' },
  { typ: 'einzahlung', label: 'Einzahlung' },
  { typ: 'entnahme', label: 'Entnahme' },
  { typ: 'zinsen', label: 'Zinsen' },
];

/* PP InvestmentPlanModel.toString(): interval < 100 = monatlich, > 100 = wöchentlich. */
const WEEKS_THRESHOLD = 100;
function intervalLabel(interval: number): string {
  if (interval < WEEKS_THRESHOLD) {
    return interval === 1 ? 'monatlich' : `alle ${interval} Monate`;
  }
  const w = interval - WEEKS_THRESHOLD;
  return w === 1 ? 'wöchentlich' : `alle ${w} Wochen`;
}
// Verfügbare Intervalle für das Dropdown (PP InvestmentPlanModel.Intervals)
const INTERVAL_VALUES = [WEEKS_THRESHOLD + 1, WEEKS_THRESHOLD + 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/* Datum N Intervalle nach start (PP InvestmentPlan: plusMonths / plusWeeks). */
function addInterval(date: Date, interval: number, count: number): Date {
  const d = new Date(date);
  if (interval < WEEKS_THRESHOLD) d.setMonth(d.getMonth() + interval * count);
  else d.setDate(d.getDate() + (interval - WEEKS_THRESHOLD) * 7 * count);
  return d;
}

interface SparplanRow {
  sp: Sparplan;
  wpName: string;
  letzteAusfuehrung?: Date;
  naechsteAusfuehrung?: Date;
}

export default function SparplaeneView() {
  const { state, addSparplan, updateSparplan, deleteSparplan, generateSparplanTx } = usePortfolio();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colMenuPos, setColMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [neuMenuPos, setNeuMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [editDialog, setEditDialog] = useState<{ mode: 'neu' | 'edit'; typ: SparplanTyp; sp?: Sparplan } | null>(null);
  const [paneTab, setPaneTab] = useState('umsaetze');

  const wpNameOf = useCallback((key: string) => state.wertpapiere[key]?.name ?? key, [state.wertpapiere]);

  const rows = useMemo((): SparplanRow[] => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return state.sparplaene.map(sp => {
      // generierte Käufe dieses Sparplans (per WP + Depot)
      const planTxs = state.transaktionen
        .filter(tx => tx.depotName === sp.depotName && (tx.isin || tx.wertpapierName) === sp.wertpapierKey
          && (SHARES_ADD.has(tx.typ) || SHARES_SUB.has(tx.typ)))
        .sort((a, b) => a.datum.getTime() - b.datum.getTime());
      const letzte = planTxs.length > 0 ? planTxs[planTxs.length - 1].datum : undefined;
      // nächste Ausführung = letztes + 1 Intervall, sonst start; mindestens >= heute
      let naechste: Date | undefined;
      if (sp.startDatum && sp.startDatum.getTime() > 0) {
        naechste = letzte ? addInterval(letzte, sp.intervall, 1) : new Date(sp.startDatum);
        let guard = 0;
        while (naechste < today && guard++ < 600) naechste = addInterval(naechste, sp.intervall, 1);
      }
      return { sp, wpName: wpNameOf(sp.wertpapierKey), letzteAusfuehrung: letzte, naechsteAusfuehrung: naechste };
    });
  }, [state.sparplaene, state.transaktionen, wpNameOf]);

  const selected = rows.find(r => r.sp.id === selectedId)?.sp ?? rows[0]?.sp ?? null;
  useEffect(() => {
    if (selectedId === null && rows.length > 0) setSelectedId(rows[0].sp.id);
  }, [rows, selectedId]);

  // Depot-/Konto-Optionen für Inline-Edit/Dialog
  const depotNamen = useMemo(() => Object.keys(state.depots), [state.depots]);
  const kontoNamen = useMemo(() => Object.keys(state.konten), [state.konten]);
  const wpList = useMemo(() => Object.values(state.wertpapiere).filter(w => w.bestand >= 0).map(w => ({ key: w.isin || w.name, name: w.name })), [state.wertpapiere]);

  // ── Buchungen erstellen (PP generateTransactions) ──
  const generateTransactions = useCallback((sp: Sparplan): number => {
    if (!sp.startDatum || sp.startDatum.getTime() <= 0) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const existing = state.transaktionen
      .filter(tx => tx.depotName === sp.depotName && (tx.isin || tx.wertpapierName) === sp.wertpapierKey && SHARES_ADD.has(tx.typ));
    const existingDates = new Set(existing.map(t => t.datum.toISOString().slice(0, 10)));
    const wp = state.wertpapiere[sp.wertpapierKey];
    const txs: Transaktion[] = [];
    let d = new Date(sp.startDatum);
    let guard = 0;
    while (d <= today && guard++ < 600) {
      const ds = d.toISOString().slice(0, 10);
      if (!existingDates.has(ds) && sp.planTyp === 'kauf' && sp.wertpapierKey) {
        const kurs = wp?.kursHistorie?.find(h => h.datum >= d)?.kurs ?? wp?.letzterKurs ?? 0;
        const nettoBetrag = sp.betrag - sp.gebuehren - sp.steuern;
        const stueck = kurs > 0 ? nettoBetrag / kurs : 0;
        txs.push({
          id: `splan-${sp.id}-${ds}`,
          datum: new Date(d),
          typ: 'kauf',
          isin: wp?.isin ?? '',
          wertpapierName: wp?.name ?? sp.wertpapierKey,
          stueck, kurs,
          betrag: nettoBetrag,
          gebuehren: sp.gebuehren,
          steuern: sp.steuern,
          waehrung: wp?.waehrung ?? 'EUR',
          notiz: `Generiert von Sparplan '${sp.name}'`,
          kontoName: sp.kontoName,
          depotName: sp.depotName,
        });
      }
      d = addInterval(d, sp.intervall, 1);
    }
    if (txs.length > 0) generateSparplanTx(sp.id, txs);
    return txs.length;
  }, [state.transaktionen, state.wertpapiere, generateSparplanTx]);

  // ── Spalten (PP InvestmentPlanListView.addColumns) ──
  const columns = useMemo((): PPColumn<SparplanRow>[] => [
    {
      id: 'name', label: 'Name', width: 200, editable: true, editType: 'text',
      getValue: r => r.sp.name, onEdit: (r, v) => updateSparplan(r.sp.id, { name: String(v) }),
      render: r => <span style={{ color: 'var(--pp-text)' }}>{r.sp.name}</span>,
      sortFn: (a, b) => a.sp.name.localeCompare(b.sp.name),
    },
    {
      id: 'wertpapier', label: 'Wertpapier', width: 250,
      render: r => {
        if (!r.sp.wertpapierKey) return '';
        const wp = state.wertpapiere[r.sp.wertpapierKey];
        return <span className="flex items-center gap-1.5">
          <ColorMarker color={wp?.typFarbe || getColor(r.sp.wertpapierKey)} inaktiv={wp?.istInaktiv} />
          <span style={{ color: wp?.istInaktiv ? 'var(--pp-text-muted)' : undefined }}>{r.wpName}</span>
        </span>;
      },
      sortFn: (a, b) => a.wpName.localeCompare(b.wpName),
    },
    {
      id: 'depot', label: 'Depot', width: 120,
      render: r => r.sp.depotName
        ? <span className="flex items-center gap-1.5"><ColorMarker color={state.depots[r.sp.depotName]?.farbe || getColor(r.sp.depotName)} />{r.sp.depotName}</span>
        : (r.sp.planTyp === 'einzahlung' ? '(Einzahlung)' : r.sp.planTyp === 'entnahme' ? '(Entnahme)' : r.sp.planTyp === 'zinsen' ? '(Zinsen)' : ''),
      sortFn: (a, b) => a.sp.depotName.localeCompare(b.sp.depotName),
    },
    {
      id: 'konto', label: 'Konto', width: 120,
      render: r => r.sp.kontoName
        ? <span className="flex items-center gap-1.5"><ColorMarker color={state.konten[r.sp.kontoName]?.farbe || getColor(r.sp.kontoName)} />{r.sp.kontoName}</span>
        : (r.sp.planTyp === 'kauf' ? '(Einlieferung)' : ''),
      sortFn: (a, b) => a.sp.kontoName.localeCompare(b.sp.kontoName),
    },
    {
      id: 'start', label: 'Anfangsdatum', width: 90, editable: true, editType: 'text',
      getValue: r => r.sp.startDatum ? datumKurz(r.sp.startDatum) : '',
      onEdit: (r, v) => { const d = parseDmy(String(v)); if (d) updateSparplan(r.sp.id, { startDatum: d }); },
      render: r => r.sp.startDatum && r.sp.startDatum.getTime() > 0 ? datumKurz(r.sp.startDatum) : '',
      sortFn: (a, b) => (a.sp.startDatum?.getTime() ?? 0) - (b.sp.startDatum?.getTime() ?? 0),
    },
    {
      id: 'letzte', label: 'Letzte Ausführung', width: 110,
      render: r => r.letzteAusfuehrung ? datumKurz(r.letzteAusfuehrung) : '',
      sortFn: (a, b) => (a.letzteAusfuehrung?.getTime() ?? 0) - (b.letzteAusfuehrung?.getTime() ?? 0),
    },
    {
      id: 'naechste', label: 'Nächste Ausführung', width: 120,
      render: r => r.naechsteAusfuehrung ? datumKurz(r.naechsteAusfuehrung) : '',
      sortFn: (a, b) => (a.naechsteAusfuehrung?.getTime() ?? 0) - (b.naechsteAusfuehrung?.getTime() ?? 0),
    },
    {
      id: 'intervall', label: 'Intervall', width: 100, editable: true, editType: 'select',
      selectOptions: INTERVAL_VALUES.map(v => ({ value: String(v), label: intervalLabel(v) })),
      getValue: r => String(r.sp.intervall),
      onEdit: (r, v) => updateSparplan(r.sp.id, { intervall: parseInt(String(v), 10) }),
      render: r => intervalLabel(r.sp.intervall),
      sortFn: (a, b) => a.sp.intervall - b.sp.intervall,
    },
    {
      id: 'betrag', label: 'Betrag', width: 90, align: 'right', editable: true, editType: 'text',
      getValue: r => r.sp.betrag.toFixed(2).replace('.', ','),
      onEdit: (r, v) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); if (!isNaN(n)) updateSparplan(r.sp.id, { betrag: n }); },
      render: r => euro(r.sp.betrag),
      sortFn: (a, b) => a.sp.betrag - b.sp.betrag,
    },
    {
      id: 'gebuehren', label: 'Gebühren', width: 80, align: 'right',
      render: r => r.sp.gebuehren > 0 ? euro(r.sp.gebuehren) : '',
      sortFn: (a, b) => a.sp.gebuehren - b.sp.gebuehren,
    },
    {
      id: 'steuern', label: 'Steuern', width: 80, align: 'right',
      render: r => r.sp.steuern > 0 ? euro(r.sp.steuern) : '',
      sortFn: (a, b) => a.sp.steuern - b.sp.steuern,
    },
    {
      id: 'autoGenerate', label: 'Automatisch erstellen', width: 130, editable: true, editType: 'checkbox',
      getValue: r => r.sp.autoGenerate,
      onEdit: (r, v) => updateSparplan(r.sp.id, { autoGenerate: Boolean(v) }),
      render: r => r.sp.autoGenerate ? <Check size={13} style={{ color: 'var(--pp-accent)' }} /> : '',
      sortFn: (a, b) => Number(a.sp.autoGenerate) - Number(b.sp.autoGenerate),
    },
    {
      id: 'notiz', label: 'Notiz', width: 200, editable: true, editType: 'text',
      getValue: r => r.sp.notiz ?? '', onEdit: (r, v) => updateSparplan(r.sp.id, { notiz: String(v) }),
      render: r => <span style={{ color: 'var(--pp-text-muted)' }}>{r.sp.notiz ?? ''}</span>,
      sortFn: (a, b) => (a.sp.notiz ?? '').localeCompare(b.sp.notiz ?? ''),
    },
  ], [state.wertpapiere, state.depots, state.konten, updateSparplan]);
  // Notiz initial ausgeblendet (PP setVisible(false))
  const hiddenByDefault = useMemo(() => new Set(['notiz']), []);

  // ── Untere Tabelle: Umsätze des Sparplan-Wertpapiers ──
  const planTxs = useMemo(() => {
    if (!selected) return [];
    return state.transaktionen
      .filter(tx => tx.depotName === selected.depotName && (tx.isin || tx.wertpapierName) === selected.wertpapierKey);
  }, [selected, state.transaktionen]);
  // Symbol/WKN-Lookup für die Umsätze-Pane
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
  // Umsätze-Toolbar + Tabelle getrennt (Layout wie Konten: Toolbar in der TabBar-Zeile)
  const umsaetze = useUmsaetze({
    transaktionen: planTxs, symbolWknOf, wpFarbe, wpInaktiv, kontoFarbe,
    storageKey: 'sparplaene-umsaetze', exportFileName: `${selected?.name ?? 'sparplan'}_umsaetze`,
  });

  // Diagramm: Kurshistorie des WP
  const kursSeries = useMemo(() => {
    if (!selected) return [];
    const wp = state.wertpapiere[selected.wertpapierKey];
    return (wp?.kursHistorie ?? []).map(h => ({ datum: datumKurz(h.datum), kurs: h.kurs }));
  }, [selected, state.wertpapiere]);

  // Historische Kurse (Tabelle)
  const histRows = useMemo(() => {
    if (!selected) return [];
    const wp = state.wertpapiere[selected.wertpapierKey];
    return [...(wp?.kursHistorie ?? [])].sort((a, b) => b.datum.getTime() - a.datum.getTime());
  }, [selected, state.wertpapiere]);

  const masterRowKey = useCallback((r: SparplanRow) => r.sp.id, []);
  const onRowContextMenu = useCallback((e: React.MouseEvent, r: SparplanRow) => {
    e.preventDefault(); setSelectedId(r.sp.id);
    setCtxMenu({ x: e.clientX, y: e.clientY, id: r.sp.id });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar im Konten-Stil (pp-toolbar) — PP addButtons: Neuer Sparplan + Spaltenmenü */}
      <div className="pp-toolbar">
        <span className="pp-toolbar-title">Sparpläne</span>
        <div style={{ flex: 1 }} />
        <div className="relative">
          <button type="button" className="pp-toolbar-btn" title="Neuer Sparplan..."
            onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setNeuMenuPos(prev => prev ? null : { x: r.right - 220, y: r.bottom + 2 }); }}>
            <Plus size={14} />
          </button>
        </div>
        <button type="button" className="pp-toolbar-btn" title="Spalten anzeigen / ausblenden"
          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setColMenuPos(prev => prev ? null : { x: r.right - 160, y: r.bottom + 2 }); }}>
          <Settings size={14} />
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Keine Sparpläne vorhanden. Lege mit „+" oben rechts einen neuen Sparplan an oder importiere eine PP-XML-Datei.
        </div>
      ) : (
        <SplitPane storageKey="sparplaene" defaultTopPercent={50}
          top={
            <PPTable
              columns={columns} data={rows} rowKey={masterRowKey}
              selectedKey={selected?.id} onSelect={setSelectedId}
              storageKey="sparplaene" hiddenByDefault={hiddenByDefault}
              onRowContextMenu={onRowContextMenu}
              columnMenuPos={colMenuPos}
              onColumnMenuClose={() => setColMenuPos(null)}
            />
          }
          bottom={
            <div className="flex flex-col h-full">
              {/* Toolbar in der TabBar-Zeile (Layout wie Konten) — nur im Umsätze-Tab */}
              <TabBar tabs={PANE_TABS} active={paneTab} onChange={setPaneTab}
                actions={paneTab === 'umsaetze' && selected ? umsaetze.toolbar : undefined} />
              <div className="flex-1 min-h-0 flex flex-col">
                {!selected ? (
                  <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>Kein Sparplan gewählt</div>
                ) : paneTab === 'umsaetze' ? (
                  umsaetze.table
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
                    ) : (
                      <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>Keine Kursdaten vorhanden</div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    {/* PP HistoricalPricesPane.addButtons: Daten exportieren */}
                    <div className="flex items-center justify-end px-2 py-[2px]" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
                      <button className="pp-toolbar-btn" title="Daten exportieren" onClick={() => {
                        const header = 'Datum;Kurs';
                        const lines = histRows.map(h => `${datumKurz(h.datum)};${h.kurs.toFixed(4).replace('.', ',')}`);
                        const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
                        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                        a.download = `${selected.wpName}_historische_kurse.csv`; a.click();
                      }}><Download size={12} /></button>
                    </div>
                    <div className="flex-1 overflow-auto">
                      <table className="pp-table">
                        <thead><tr><th style={{ width: 120 }}>Datum</th><th className="right" style={{ width: 120 }}>Kurs</th></tr></thead>
                        <tbody>
                          {histRows.map((h, i) => (
                            <tr key={i} className="pp-row">
                              <td className="mono">{datumKurz(h.datum)}</td>
                              <td className="right mono">{euro(h.kurs)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          }
        />
      )}

      {/* "Neuer Sparplan..."-Dropdown (4 Typen) */}
      {neuMenuPos && (
        <FloatMenu x={neuMenuPos.x} y={neuMenuPos.y} onClose={() => setNeuMenuPos(null)}>
          {TYP_OPTIONS.map(o => (
            <FloatItem key={o.typ} label={o.label} onClick={() => { setEditDialog({ mode: 'neu', typ: o.typ }); setNeuMenuPos(null); }} />
          ))}
        </FloatMenu>
      )}

      {/* Spaltenmenü übernimmt PPTable via columnMenuPos */}

      {/* Kontextmenü */}
      {ctxMenu && (() => {
        const sp = state.sparplaene.find(s => s.id === ctxMenu.id);
        if (!sp) return null;
        return (
          <FloatMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}>
            <FloatItem label="Buchungen erstellen" onClick={() => {
              const n = generateTransactions(sp);
              alert(n > 0 ? `${n} Buchung(en) erstellt.` : 'Keine neuen Buchungen zu erstellen.');
              setCtxMenu(null);
            }} />
            <div style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />
            <FloatItem label="Sparplan editieren..." onClick={() => { setEditDialog({ mode: 'edit', typ: sp.planTyp, sp }); setCtxMenu(null); }} />
            <div style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />
            <FloatItem label="Sparplan löschen" danger onClick={() => { deleteSparplan(sp.id); setCtxMenu(null); }} />
          </FloatMenu>
        );
      })()}

      {/* Neuer/Editieren-Dialog */}
      {editDialog && (
        <SparplanDialog
          mode={editDialog.mode} typ={editDialog.typ} sp={editDialog.sp}
          depotNamen={depotNamen} kontoNamen={kontoNamen} wpList={wpList}
          onClose={() => setEditDialog(null)}
          onSave={data => {
            if (editDialog.mode === 'neu') {
              const id = `sp-${Date.now()}`;
              addSparplan({ id, aktiv: data.autoGenerate, ...data });
              setSelectedId(id);
            } else if (editDialog.sp) {
              updateSparplan(editDialog.sp.id, data);
            }
            setEditDialog(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Hilfen ── */
function parseDmy(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

/* ── Float-Menü (Dropdown/Kontextmenü) ── */
function FloatMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} style={{ position: 'fixed', left: x, top: y, zIndex: 9000, minWidth: 200, padding: '4px 0',
      background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
      {children}
    </div>
  );
}
function FloatItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '3px 12px', fontSize: 11, border: 'none', background: 'transparent', cursor: 'pointer', color: danger ? 'var(--pp-red-text)' : 'var(--pp-text)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      {label}
    </button>
  );
}

/* ── Neuer/Editieren-Dialog (PP InvestmentPlanDialog) ── */
function SparplanDialog({ mode, typ, sp, depotNamen, kontoNamen, wpList, onClose, onSave }: {
  mode: 'neu' | 'edit'; typ: SparplanTyp; sp?: Sparplan;
  depotNamen: string[]; kontoNamen: string[]; wpList: { key: string; name: string }[];
  onClose: () => void;
  onSave: (data: Omit<Sparplan, 'id' | 'aktiv'>) => void;
}) {
  const isKauf = typ === 'kauf';
  const [name, setName] = useState(sp?.name ?? '');
  const [wertpapierKey, setWertpapierKey] = useState(sp?.wertpapierKey ?? wpList[0]?.key ?? '');
  const [depotName, setDepotName] = useState(sp?.depotName ?? depotNamen[0] ?? '');
  const [kontoName, setKontoName] = useState(sp?.kontoName ?? kontoNamen[0] ?? '');
  const [intervall, setIntervall] = useState(sp?.intervall ?? 1);
  const [betrag, setBetrag] = useState(sp ? String(sp.betrag) : '100');
  const [gebuehren, setGebuehren] = useState(sp ? String(sp.gebuehren) : '0');
  const [steuern, setSteuern] = useState(sp ? String(sp.steuern) : '0');
  const [startStr, setStartStr] = useState(sp?.startDatum ? datumKurz(sp.startDatum) : datumKurz(new Date()));
  const [autoGenerate, setAutoGenerate] = useState(sp?.autoGenerate ?? false);
  const [notiz, setNotiz] = useState(sp?.notiz ?? '');

  const inputStyle: React.CSSProperties = { width: '100%', padding: '4px 8px', fontSize: 12, background: 'var(--pp-content-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)', borderRadius: 3 };
  const row = (label: string, el: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ width: 110, fontSize: 12, color: 'var(--pp-text-muted)' }}>{label}</span>
      <div style={{ flex: 1 }}>{el}</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--pp-sidebar-bg)', border: '1px solid var(--pp-border)', borderRadius: 6, padding: 16, minWidth: 420 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--pp-text)', marginBottom: 12 }}>
          {mode === 'neu' ? 'Neuer Sparplan' : 'Sparplan editieren'}: {TYP_OPTIONS.find(o => o.typ === typ)?.label}
        </div>
        {row('Name', <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />)}
        {isKauf && row('Wertpapier', <select value={wertpapierKey} onChange={e => setWertpapierKey(e.target.value)} style={inputStyle}>{wpList.map(w => <option key={w.key} value={w.key}>{w.name}</option>)}</select>)}
        {isKauf && row('Depot', <select value={depotName} onChange={e => setDepotName(e.target.value)} style={inputStyle}>{depotNamen.map(d => <option key={d} value={d}>{d}</option>)}</select>)}
        {row('Konto', <select value={kontoName} onChange={e => setKontoName(e.target.value)} style={inputStyle}>{kontoNamen.map(k => <option key={k} value={k}>{k}</option>)}</select>)}
        {row('Anfangsdatum', <input value={startStr} onChange={e => setStartStr(e.target.value)} placeholder="TT.MM.JJJJ" style={inputStyle} />)}
        {row('Intervall', <select value={intervall} onChange={e => setIntervall(+e.target.value)} style={inputStyle}>{INTERVAL_VALUES.map(v => <option key={v} value={v}>{intervalLabel(v)}</option>)}</select>)}
        {row('Betrag', <input type="number" value={betrag} onChange={e => setBetrag(e.target.value)} style={inputStyle} />)}
        {row('Gebühren', <input type="number" value={gebuehren} onChange={e => setGebuehren(e.target.value)} style={inputStyle} />)}
        {row('Steuern', <input type="number" value={steuern} onChange={e => setSteuern(e.target.value)} style={inputStyle} />)}
        {row('Automatisch erstellen', <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--pp-text)' }}><input type="checkbox" checked={autoGenerate} onChange={e => setAutoGenerate(e.target.checked)} style={{ accentColor: 'var(--pp-accent)' }} /> aktiv</label>)}
        {row('Notiz', <input value={notiz} onChange={e => setNotiz(e.target.value)} style={inputStyle} />)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="pp-toolbar-btn" style={{ padding: '4px 16px' }} onClick={onClose}>Abbrechen</button>
          <button className="pp-toolbar-btn" style={{ padding: '4px 16px', background: 'var(--pp-accent)', color: '#fff' }}
            disabled={!name.trim()}
            onClick={() => onSave({
              name: name.trim(), planTyp: typ,
              wertpapierKey: isKauf ? wertpapierKey : '',
              depotName: isKauf ? depotName : '',
              kontoName,
              intervall,
              betrag: parseFloat(betrag) || 0,
              gebuehren: parseFloat(gebuehren) || 0,
              steuern: parseFloat(steuern) || 0,
              startDatum: parseDmy(startStr) ?? new Date(),
              autoGenerate,
              notiz: notiz.trim() || undefined,
            })}>OK</button>
        </div>
      </div>
    </div>
  );
}
