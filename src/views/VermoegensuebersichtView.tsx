import { useMemo, useState, useCallback, useRef } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { SplitPane } from '../components/SplitPane';
import { TabBar } from '../components/PPElements';
import { HierarchyMenu, type MenuNode } from '../components/HierarchyMenu';
import { VermoegensaufstellungPane, type KontoRow } from '../components/VermoegensaufstellungPane';
import {
  BaseCurrencyDropDown, TimeMachineDropDown, ClientFilterDropDown, ConfigStoreDropDowns,
  ENTIRE_PORTFOLIO, type ClientFilterValue,
} from '../components/StatementToolbar';
import { useConfigStore } from '../components/useConfigStore';
import { computeDepotPositions } from '../components/vermoegenLogic';
import type { ReportingPeriodResult } from '../components/ReportingPeriodDialog';
import { euro, datumKurz, stueck } from '../utils/format';
import { Download, Settings } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import type { Transaktion } from '../types/portfolio';

const ASSET_STORAGE_KEY = 'vermoegen-uebersicht-asset';

/* ════════════════════════════════════════════════════════════════════════
   Vermögensaufstellung — 1:1 Nachbau von PP StatementOfAssetsView.

   Toolbar (PP addButtons): Basiswährung | TimeMachine (Stichtag) | ClientFilter
   | CSV-Export | Spaltenmenü. Export + Spaltenmenü liefert die
   VermoegensaufstellungPane (PP StatementOfAssetsPane), die die komplette
   Tabelle samt allen Spalten, Klassifizierungs-Gruppierung, Summen-Toggles und
   Konto-/Cash-Zeilen rendert.

   Untere Hälfte (PP addPanePages): Detail-Tabs für die selektierte Position —
   Kursdiagramm, Buchungen, Trades, Ereignisse.
   ════════════════════════════════════════════════════════════════════════ */

const SHARES_ADD = new Set(['kauf', 'umbuchung_ein']);
const SHARES_SUB = new Set(['verkauf', 'umbuchung_aus']);

const DETAIL_TABS = [
  { id: 'diagramm', label: 'Kursdiagramm' },
  { id: 'buchungen', label: 'Buchungen' },
  { id: 'trades', label: 'Trades' },
  { id: 'ereignisse', label: 'Ereignisse' },
];

const TX_LABELS: Record<string, string> = {
  kauf: 'Kauf', verkauf: 'Verkauf', dividende: 'Dividende', ausschuettung: 'Ausschüttung',
  einlage: 'Einlage', entnahme: 'Entnahme', zinsen: 'Zinsen', zinsbelastung: 'Zinsbelastung',
  gebuehren: 'Gebühren', gebuehrenerstattung: 'Gebührenerstattung',
  steuern_tx: 'Steuern', steuererstattung: 'Steuerrückerstattung',
  umbuchung_ein: 'Einlieferung', umbuchung_aus: 'Auslieferung',
};

export default function VermoegensuebersichtView() {
  const { state, setBasisWaehrung, addBerichtszeitraum } = usePortfolio();

  // ── Toolbar-State ──
  const [snapshotDate, setSnapshotDate] = useState<Date | null>(null); // null = heute
  const [clientFilter, setClientFilter] = useState<ClientFilterValue>(ENTIRE_PORTFOLIO);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState('diagramm');

  // ── Spalten-Konfigurations-Store (PP ConfigurationStore, viewToolBar) ──
  // Bei Konfig-Wechsel wird die Pane über paneKey neu gemountet, damit sie den
  // neu in den Storage-Key geschriebenen Snapshot übernimmt.
  const [paneKey, setPaneKey] = useState(0);
  const configStore = useConfigStore('vermoegen-uebersicht-cfgstore', ASSET_STORAGE_KEY, () => setPaneKey(k => k + 1));

  // ── Pane-Controls (Export + Spaltenmenü-Nodes) für den View-Header ──
  // In einer Ref gehalten, damit das fortlaufende Melden aus der Pane kein
  // Re-Render (und damit keine Render-Schleife) auslöst. `ready` schaltet die
  // Buttons frei, sobald die Pane erstmals gemeldet hat.
  const controlsRef = useRef<{ exportCSV: () => void; menuNodes: MenuNode[] } | null>(null);
  const [ready, setReady] = useState(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const receiveControls = useCallback((c: { exportCSV: () => void; menuNodes: MenuNode[] }) => {
    controlsRef.current = c;
    setReady(r => r || true);
  }, []);

  // ── Verwendete Währungen (für Basiswährungs-DropDown) ──
  const usedCurrencies = useMemo(() => {
    const set = new Set<string>([state.basisWaehrung]);
    for (const wp of Object.values(state.wertpapiere)) if (wp.waehrung) set.add(wp.waehrung);
    for (const k of Object.values(state.konten)) if (k.waehrung) set.add(k.waehrung);
    return [...set];
  }, [state.basisWaehrung, state.wertpapiere, state.konten]);

  // ── Welche Depots/Konten fließen ein (ClientFilter) ──
  const allDepotNamen = useMemo(() => Object.keys(state.depots), [state.depots]);
  const allKontoNamen = useMemo(() => Object.keys(state.konten), [state.konten]);
  const aktiveDepotNamen = clientFilter.id === '' ? allDepotNamen : clientFilter.depotNamen;
  const aktiveKontoNamen = clientFilter.id === '' ? allKontoNamen : clientFilter.kontoNamen;

  // ── Berichtszeiträume (zentral) ──
  const reportPeriods = state.berichtszeitraeume;
  const addReportingPeriod = useCallback((r: ReportingPeriodResult) => {
    const days = r.days != null ? r.days : Math.max(0, Math.round((Date.now() - r.start.getTime()) / 86400000));
    addBerichtszeitraum({ key: r.key, label: r.label, days });
  }, [addBerichtszeitraum]);

  // ── Taxonomien + Klassifizierungs-Lookup ──
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

  // ── Positionen (volle Vermögensaufstellung über die aktiven Depots) ──
  const refKontoForDepot = useCallback((d: string) => state.depots[d]?.referenzkontoName, [state.depots]);
  const positions = useMemo(() =>
    computeDepotPositions(aktiveDepotNamen, state.transaktionen, state.wertpapiere, reportPeriods, refKontoForDepot),
    [aktiveDepotNamen, state.transaktionen, state.wertpapiere, reportPeriods, refKontoForDepot]);

  // ── Konto-/Cash-Zeilen (PP: Konten als eigene Zeilen mit Saldo) ──
  const kontoRows = useMemo((): KontoRow[] =>
    aktiveKontoNamen
      .map(n => ({ name: n, saldo: state.konten[n]?.saldo ?? 0, farbe: state.konten[n]?.farbe }))
      .filter(k => Math.abs(k.saldo) > 0.001),
    [aktiveKontoNamen, state.konten]);

  // ── Selektierte Position für die Detail-Panes ──
  const selectedWp = selectedKey ? state.wertpapiere[selectedKey] : undefined;
  const selectedTxs = useMemo(() =>
    selectedKey ? state.transaktionen.filter(tx => (tx.isin || tx.wertpapierName) === selectedKey) : [],
    [selectedKey, state.transaktionen]);

  const depotsForFilter = useMemo(() =>
    allDepotNamen.map(name => ({ name, referenzkontoName: state.depots[name]?.referenzkontoName })),
    [allDepotNamen, state.depots]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — PP StatementOfAssetsView createHeader: 3 Bereiche
          [Titel (mit Konfigname)] [viewToolBar: ConfigStore + ＋] [actionToolBar:
          ClientFilter · Basiswährung · TimeMachine · Export · Spaltenmenü] */}
      <div className="flex items-center px-2 py-[3px] gap-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
        {/* 1. Titel mit aktivem Konfigurationsnamen */}
        <span className="text-[12px] font-semibold whitespace-nowrap flex-shrink-0" style={{ color: 'var(--pp-text)' }}>
          Vermögensaufstellung ({configStore.activeName})
        </span>

        {/* 2.+3. view- + actionToolBar — gemeinsam rechtsbündig, alle Items
            schrumpffest, mit Abstand zwischen ConfigStore und Aktionen */}
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
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
          {/* Trenner zwischen view- und actionToolBar */}
          <div style={{ width: 1, height: 16, background: 'var(--pp-border)', margin: '0 4px', flexShrink: 0 }} />
          {/* actionToolBar in PP-Reihenfolge (addButtons): Basiswährung,
              TimeMachine, ClientFilter, Export, Spaltenmenü */}
          <BaseCurrencyDropDown
            basisWaehrung={state.basisWaehrung}
            usedCurrencies={usedCurrencies}
            onChange={setBasisWaehrung}
          />
          <TimeMachineDropDown snapshotDate={snapshotDate} onChange={setSnapshotDate} />
          <ClientFilterDropDown
            value={clientFilter}
            depots={depotsForFilter}
            gruppierungen={state.gruppierungen}
            onChange={setClientFilter}
            onNewFilter={() => { /* Gruppierung anlegen → "Gruppierte Konten"-View */ }}
            onManageFilter={() => { /* Filter verwalten → "Gruppierte Konten"-View */ }}
          />
          {/* CSV-Export (aus der Pane) */}
          <button className="pp-toolbar-btn" title="Daten exportieren"
            onClick={() => controlsRef.current?.exportCSV()} disabled={!ready}>
            <Download size={14} />
          </button>
          {/* Spaltenmenü (aus der Pane) — Nodes beim Öffnen frisch aus der Ref */}
          <div className="relative">
            <button className="pp-toolbar-btn" title="Spalten anzeigen / ausblenden"
              onClick={() => setColumnMenuOpen(o => !o)} disabled={!ready}>
              <Settings size={14} />
            </button>
            {columnMenuOpen && controlsRef.current && (
              <HierarchyMenu nodes={controlsRef.current.menuNodes} onClose={() => setColumnMenuOpen(false)} />
            )}
          </div>
        </div>
      </div>

      <SplitPane storageKey="vermoegen-uebersicht" defaultTopPercent={60}
        top={
          <VermoegensaufstellungPane
            key={paneKey}
            storageKey={ASSET_STORAGE_KEY}
            positions={positions}
            kontoRows={kontoRows}
            taxonomien={taxonomien}
            klassByTax={klassByTax}
            basisWaehrung={state.basisWaehrung}
            reportPeriods={reportPeriods}
            onAddPeriod={addReportingPeriod}
            exportFileName="vermoegensaufstellung"
            selectedKey={selectedKey}
            onSelectPosition={setSelectedKey}
            externalToolbar
            onControls={receiveControls}
          />
        }
        bottom={
          <div className="flex flex-col h-full">
            <TabBar tabs={DETAIL_TABS} active={detailTab} onChange={setDetailTab} />
            <div className="flex-1 overflow-auto">
              {!selectedKey || !selectedWp ? (
                <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
                  Wähle oben ein Wertpapier, um Details zu sehen.
                </div>
              ) : detailTab === 'diagramm' ? (
                <KursChart wp={selectedWp} />
              ) : detailTab === 'buchungen' ? (
                <BuchungenTab txs={selectedTxs} />
              ) : detailTab === 'trades' ? (
                <TradesTab txs={selectedTxs} />
              ) : (
                <EreignisseTab txs={selectedTxs} />
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}

/* ── Detail-Pane: Kursdiagramm (PP SecurityPriceChartPane) ── */
function KursChart({ wp }: { wp: { name: string; kursHistorie: { datum: Date; kurs: number }[] } }) {
  const data = useMemo(() =>
    (wp.kursHistorie ?? []).map(h => ({ datum: datumKurz(h.datum), kurs: h.kurs })),
    [wp]);
  if (data.length === 0) return <Empty text="Keine Kurshistorie vorhanden." />;
  return (
    <div className="p-3 h-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
          <XAxis dataKey="datum" tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
          <YAxis tick={{ fontSize: 9, fill: 'var(--pp-text-muted)' }} tickLine={false} width={60} domain={['auto', 'auto']} />
          <ReTooltip contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }} formatter={(v) => [euro(v as number), 'Kurs']} />
          <Line type="monotone" dataKey="kurs" stroke="var(--pp-accent)" strokeWidth={1.4} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Detail-Pane: Buchungen (alle Transaktionen der Position) ── */
function BuchungenTab({ txs }: { txs: Transaktion[] }) {
  const sorted = useMemo(() => [...txs].sort((a, b) => b.datum.getTime() - a.datum.getTime()), [txs]);
  if (sorted.length === 0) return <Empty text="Keine Buchungen." />;
  const color = (tx: Transaktion) => (tx.typ === 'verkauf' || tx.typ === 'umbuchung_aus') ? 'var(--pp-red-text)' : 'var(--pp-green-text)';
  return (
    <table className="pp-table">
      <thead><tr>
        <th>Datum</th><th>Typ</th><th>Konto</th>
        <th className="right">Stück</th><th className="right">Kurs</th><th className="right">Betrag</th>
        <th className="right">Gebühren</th><th className="right">Steuern</th>
      </tr></thead>
      <tbody>
        {sorted.map(tx => (
          <tr key={tx.id} className="pp-row">
            <td className="mono" style={{ color: color(tx) }}>{datumKurz(tx.datum)}</td>
            <td style={{ color: color(tx) }}>{TX_LABELS[tx.typ] ?? tx.typ}</td>
            <td style={{ color: 'var(--pp-text-muted)' }}>{tx.kontoName ?? ''}</td>
            <td className="right mono">{tx.stueck > 0 ? stueck(tx.stueck) : ''}</td>
            <td className="right mono">{tx.kurs > 0 ? euro(tx.kurs) : ''}</td>
            <td className="right mono">{euro(tx.betrag)}</td>
            <td className="right mono">{tx.gebuehren > 0 ? euro(tx.gebuehren) : ''}</td>
            <td className="right mono">{tx.steuern > 0 ? euro(tx.steuern) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Detail-Pane: Trades (Käufe/Verkäufe) ── */
function TradesTab({ txs }: { txs: Transaktion[] }) {
  const trades = useMemo(() =>
    txs.filter(tx => SHARES_ADD.has(tx.typ) || SHARES_SUB.has(tx.typ)).sort((a, b) => b.datum.getTime() - a.datum.getTime()),
    [txs]);
  if (trades.length === 0) return <Empty text="Keine Trades." />;
  const color = (tx: Transaktion) => (tx.typ === 'verkauf' || tx.typ === 'umbuchung_aus') ? 'var(--pp-red-text)' : 'var(--pp-green-text)';
  return (
    <table className="pp-table">
      <thead><tr>
        <th>Datum</th><th>Typ</th><th className="right">Stück</th>
        <th className="right">Kurs</th><th className="right">Betrag</th>
      </tr></thead>
      <tbody>
        {trades.map(tx => (
          <tr key={tx.id} className="pp-row">
            <td className="mono" style={{ color: color(tx) }}>{datumKurz(tx.datum)}</td>
            <td style={{ color: color(tx) }}>{TX_LABELS[tx.typ] ?? tx.typ}</td>
            <td className="right mono">{stueck(tx.stueck)}</td>
            <td className="right mono">{tx.kurs > 0 ? euro(tx.kurs) : euro(tx.betrag / Math.max(tx.stueck, 1))}</td>
            <td className="right mono">{euro(tx.betrag)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Detail-Pane: Ereignisse (Dividenden/Ausschüttungen) ── */
function EreignisseTab({ txs }: { txs: Transaktion[] }) {
  const events = useMemo(() =>
    txs.filter(tx => tx.typ === 'dividende' || tx.typ === 'ausschuettung').sort((a, b) => b.datum.getTime() - a.datum.getTime()),
    [txs]);
  if (events.length === 0) return <Empty text="Keine Ereignisse." />;
  return (
    <table className="pp-table">
      <thead><tr><th>Datum</th><th>Typ</th><th>Konto</th><th className="right">Betrag</th></tr></thead>
      <tbody>
        {events.map(tx => (
          <tr key={tx.id} className="pp-row">
            <td className="mono">{datumKurz(tx.datum)}</td>
            <td>{TX_LABELS[tx.typ] ?? tx.typ}</td>
            <td style={{ color: 'var(--pp-text-muted)' }}>{tx.kontoName ?? ''}</td>
            <td className="right mono" style={{ color: 'var(--pp-green-text)' }}>{euro(tx.betrag)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>{text}</div>;
}
