import { useMemo, useState, useCallback } from 'react';
import { usePortfolio } from '../store/PortfolioContext';
import { SplitPane } from '../components/SplitPane';
import { HierarchyMenu, type MenuNode } from '../components/HierarchyMenu';
import { VermoegensaufstellungPane, type KontoRow } from '../components/VermoegensaufstellungPane';
import { WertpapierDetailPane } from '../components/WertpapierDetailPane';
import {
  BaseCurrencyDropDown, TimeMachineDropDown, ClientFilterDropDown, ConfigStoreDropDowns,
  ENTIRE_PORTFOLIO, type ClientFilterValue,
} from '../components/StatementToolbar';
import { useConfigStore } from '../components/useConfigStore';
import { computeDepotPositions } from '../components/vermoegenLogic';
import type { ReportingPeriodResult } from '../components/ReportingPeriodDialog';
import { Download, Settings } from 'lucide-react';

const ASSET_STORAGE_KEY = 'vermoegen-uebersicht-asset';

/* ════════════════════════════════════════════════════════════════════════
   Vermögensaufstellung — 1:1 Nachbau von PP StatementOfAssetsView.

   Toolbar (PP addButtons): Basiswährung | TimeMachine (Stichtag) | ClientFilter
   | CSV-Export | Spaltenmenü. Export + Spaltenmenü liefert die
   VermoegensaufstellungPane (PP StatementOfAssetsPane), die die komplette
   Tabelle samt allen Spalten, Klassifizierungs-Gruppierung, Summen-Toggles und
   Konto-/Cash-Zeilen rendert.

   Untere Hälfte (PP addPanePages == SecurityListView): derselbe Detail-Bereich
   wie in "Alle Wertpapiere" via WertpapierDetailPane (Chart + Werkzeuge, 6 Tabs:
   Diagramm, Historische Kurse, Umsätze, Trades, Ereignisse, Datenqualität).
   ════════════════════════════════════════════════════════════════════════ */

export default function VermoegensuebersichtView() {
  const { state, setBasisWaehrung, addBerichtszeitraum, updateWertpapier, deleteTransaktion, importTransaktionen } = usePortfolio();

  // ── Toolbar-State ──
  const [snapshotDate, setSnapshotDate] = useState<Date | null>(null); // null = heute
  const [clientFilter, setClientFilter] = useState<ClientFilterValue>(ENTIRE_PORTFOLIO);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // ── Spalten-Konfigurations-Store (PP ConfigurationStore, viewToolBar) ──
  // Bei Konfig-Wechsel wird die Pane über paneKey neu gemountet, damit sie den
  // neu in den Storage-Key geschriebenen Snapshot übernimmt.
  const [paneKey, setPaneKey] = useState(0);
  const configStore = useConfigStore('vermoegen-uebersicht-cfgstore', ASSET_STORAGE_KEY, () => setPaneKey(k => k + 1));

  // ── Pane-Controls (Export + Spaltenmenü-Nodes) für den View-Header ──
  // Als State gehalten, damit das offene Spaltenmenü sich aktualisiert, wenn
  // sich Spalten-Sichtbarkeit ändert. Die Pane meldet nur bei echten
  // Änderungen (nicht bei jedem Render), daher keine Render-Schleife.
  const [controls, setControls] = useState<{ exportCSV: () => void; menuNodes: MenuNode[] } | null>(null);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const receiveControls = useCallback((c: { exportCSV: () => void; menuNodes: MenuNode[] }) => {
    setControls(c);
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
  // PP: Default-Gruppierung = "Wertpapierart"-Taxonomie (die Wertpapiere UND
  // Konten zuordnet). Gibt es sie nicht, Fallback auf die eingebaute Typ-
  // Gruppierung ('__typ__').
  const defaultKlass = useMemo(() => {
    const wpArt = state.taxonomien.find(t => t.name === 'Wertpapierart' || t.id === 'security-type');
    return wpArt ? wpArt.id : '__typ__';
  }, [state.taxonomien]);
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

  // ── Selektierte Position für die Detail-Pane ──
  const selectedWp = selectedKey ? state.wertpapiere[selectedKey] : undefined;

  const depotsForFilter = useMemo(() =>
    allDepotNamen.map(name => ({ name, referenzkontoName: state.depots[name]?.referenzkontoName })),
    [allDepotNamen, state.depots]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — PP StatementOfAssetsView createHeader: 3 Bereiche
          [Titel (mit Konfigname)] [viewToolBar: ConfigStore + ＋] [actionToolBar:
          ClientFilter · Basiswährung · TimeMachine · Export · Spaltenmenü] */}
      <div className="flex items-center px-2 py-[3px] gap-2 overflow-hidden" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
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
            onClick={() => controls?.exportCSV()} disabled={!controls}>
            <Download size={14} />
          </button>
          {/* Spaltenmenü (aus der Pane) — Nodes aus State, aktualisiert beim Toggle */}
          <div className="relative">
            <button className="pp-toolbar-btn" title="Spalten anzeigen / ausblenden"
              onClick={() => setColumnMenuOpen(o => !o)} disabled={!controls}>
              <Settings size={14} />
            </button>
            {columnMenuOpen && controls && (
              <HierarchyMenu nodes={controls.menuNodes} onClose={() => setColumnMenuOpen(false)} />
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
            defaultKlassifizierung={defaultKlass}
          />
        }
        bottom={
          // PP StatementOfAssetsView.addPanePages == SecurityListView: derselbe
          // Detail-Bereich wie in "Alle Wertpapiere" (Chart + Werkzeuge, 6 Tabs).
          <WertpapierDetailPane
            wp={selectedWp ?? null}
            onUpdateWertpapier={updateWertpapier}
            onDeleteTransaktion={deleteTransaktion}
            onImportTransaktionen={importTransaktionen}
            storagePrefix="vermoegen-detail"
          />
        }
      />
    </div>
  );
}
