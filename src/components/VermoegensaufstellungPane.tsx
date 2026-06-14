import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { ColorMarker, getColor } from './PPElements';
import { useColumnConfig, ColumnHeader } from './useColumnConfig';
import { HierarchyMenu, type MenuNode } from './HierarchyMenu';
import { ReportingPeriodDialog, type ReportingPeriodResult } from './ReportingPeriodDialog';
import { euro, kurs as kursFmt, kursLive, stueck, num, datumKurz } from '../utils/format';
import { Download, Settings } from 'lucide-react';
import {
  type DepotPosition, type ReportPeriod, SMA_PERIODS,
  PERF_METRICS, DIV_METRICS, type PeriodMetric,
  buildVermoegenColumns, buildVermoegenHiddenDefault,
} from './vermoegenLogic';

/* ══════════════════════════════════════════════════════════════════════
   VermöggensaufstellungPane — die vollständige PP-StatementOfAssetsViewer-
   Tabelle samt komplettem Spaltenmenü (Klassifizierungen, Spalten-Submenüs,
   Performance/Dividenden-Perioden, Devisen, SMA/ATH/Kursspanne, Darstellung,
   Neu…-Berichtszeitraum). Wird von Depots UND Gruppierte Konten genutzt.

   positions: berechnete Wertpapier-Positionen (computeDepotPositions).
   kontoRows: zusätzliche Konto-Zeilen (nur Gruppierte Konten — Salden).
   taxonomien / klassByTax: für Klassifizierungs-Spalten & Gruppierung.
   ══════════════════════════════════════════════════════════════════════ */

export interface KontoRow { name: string; saldo: number; farbe?: string }

/* Kategorienamen der eingebauten "Wertpapierart"-Gruppierung (PP-Taxonomie
   "security-type": exakt die Labels aus security-type_de.properties).
   In PP ist die Vermögensaufstellung standardmäßig nach dieser Taxonomie
   gruppiert (StatementOfAssetsViewer.loadTaxonomy → erste Taxonomie). */
const TYP_LABELS: Record<string, string> = {
  Aktie: 'Aktie',
  Fonds: 'Aktienfonds',
  ETF: 'Exchange Traded Fund (ETF)',
  Anleihe: 'Anleihe',
  Optionsschein: 'Optionsschein',
  Index: 'Index',
  Währung: 'Währung',
  Krypto: 'Kryptowährung',
  Sonstige: 'Sonstige',
};

interface Props {
  storageKey: string;
  positions: DepotPosition[];
  kontoRows?: KontoRow[];
  taxonomien: { id: string; name: string }[];
  klassByTax: Map<string, Map<string, string>>;
  basisWaehrung: string;
  reportPeriods: ReportPeriod[];
  onAddPeriod: (r: ReportingPeriodResult, targetMetricId: string) => void;
  exportFileName?: string;
  /* PP: Auswahl einer Wertpapier-Zeile speist die unteren Detail-Panes. */
  selectedKey?: string | null;
  onSelectPosition?: (wpKey: string | null) => void;
  /* PP StatementOfAssetsView: Export + Spaltenmenü sitzen im View-Header, nicht
     in einer eigenen Pane-Zeile. Wenn gesetzt, unterdrückt die Pane ihre eigene
     Toolbar und meldet die Steuer-Elemente (CSV-Export, Spaltenmenü-Nodes) an
     den View, der sie im Header rendert. */
  externalToolbar?: boolean;
  onControls?: (controls: { exportCSV: () => void; menuNodes: MenuNode[] }) => void;
  /* PP StatementOfAssetsViewer.loadTaxonomy: standardmäßig nach "Wertpapierart"
     gruppiert. Die Vermögensaufstellung übergibt '__typ__'; Depots/Gruppierte
     Konten lassen es bei 'keine'. */
  defaultKlassifizierung?: string;
}

export function VermoegensaufstellungPane({
  storageKey, positions, kontoRows = [], taxonomien, klassByTax, basisWaehrung,
  reportPeriods, onAddPeriod, exportFileName = 'vermoegensaufstellung',
  selectedKey, onSelectPosition, externalToolbar, onControls,
  defaultKlassifizierung = 'keine',
}: Props) {
  const vermoegenColumns = useMemo(() => buildVermoegenColumns(reportPeriods, taxonomien), [reportPeriods, taxonomien]);
  const vermoegenHiddenDefault = useMemo(() => buildVermoegenHiddenDefault(reportPeriods, taxonomien), [reportPeriods, taxonomien]);
  const cfg = useColumnConfig(storageKey, vermoegenColumns, vermoegenHiddenDefault);

  const [menuOpen, setMenuOpen] = useState(false);
  const [neuPeriodeDialog, setNeuPeriodeDialog] = useState<string | null>(null);
  const [summeOben, setSummeOben] = useState(() => { try { return localStorage.getItem(`${storageKey}-summe-oben`) === 'true'; } catch { return false; } });
  const [summeUnten, setSummeUnten] = useState(() => { try { return localStorage.getItem(`${storageKey}-summe-unten`) !== 'false'; } catch { return true; } });
  // Klassifizierungs-Auswahl. Versionierter Key (-klass3), damit bestehende
  // Nutzer mit altem implizitem "keine"-Zustand einmalig den neuen Default
  // (PP: Gruppierung nach Wertpapierart) bekommen; spätere bewusste Änderungen
  // bleiben erhalten.
  const [klassifizierung, setKlassifizierung] = useState(() => { try { return localStorage.getItem(`${storageKey}-klass3`) ?? defaultKlassifizierung; } catch { return defaultKlassifizierung; } });

  // Gesamtvolumen = Marktwerte aller Positionen + Konto-Salden (für Anteil)
  const totalVolumen = useMemo(
    () => positions.reduce((s, p) => s + p.marktwert, 0) + kontoRows.reduce((s, k) => s + k.saldo, 0),
    [positions, kontoRows]
  );

  // ── Menü-Helfer ──
  const colLabel = (id: string) => vermoegenColumns.find(c => c.id === id)?.label ?? id;
  const check = (id: string): MenuNode =>
    ({ kind: 'check', label: colLabel(id), checked: !cfg.hidden.has(id), onToggle: () => cfg.toggleHidden(id) });
  const checkLabel = (id: string, label: string): MenuNode =>
    ({ kind: 'check', label, checked: !cfg.hidden.has(id), onToggle: () => cfg.toggleHidden(id) });
  const groupAddRemove = (ids: string[]): MenuNode[] => [
    { kind: 'separator' },
    { kind: 'action', label: 'Alle hinzufügen', onClick: () => ids.forEach(id => { if (cfg.hidden.has(id)) cfg.toggleHidden(id); }) },
    { kind: 'action', label: 'Alle entfernen', onClick: () => ids.forEach(id => { if (!cfg.hidden.has(id)) cfg.toggleHidden(id); }) },
  ];
  const periodSubmenu = (m: PeriodMetric): MenuNode => ({
    kind: 'submenu', label: m.menuLabel,
    children: [
      ...reportPeriods.map(per => checkLabel(`${m.id}_${per.key}`, per.label)),
      { kind: 'separator' },
      { kind: 'action', label: 'Neu...', onClick: () => { setMenuOpen(false); setNeuPeriodeDialog(m.id); } },
    ],
  });
  const periodIds = (metrics: PeriodMetric[]): string[] =>
    metrics.flatMap(m => reportPeriods.map(per => `${m.id}_${per.key}`));

  const setKlass = (v: string) => { setKlassifizierung(v); try { localStorage.setItem(`${storageKey}-klass3`, v); } catch { /* */ } };

  // Gibt es eine echte "Wertpapierart"-Taxonomie (sie ordnet Wertpapiere UND
  // Konten zu), wird sie als reguläres Radio gezeigt — sie ist auch der Default.
  // Nur wenn sie fehlt, bieten wir die eingebaute Typ-Gruppierung ('__typ__')
  // als Ersatz an.
  const hatWpArtTax = taxonomien.some(t => t.name === 'Wertpapierart' || t.id === 'security-type');
  const menuNodes: MenuNode[] = [
    { kind: 'header', label: 'Klassifizierungen' },
    { kind: 'radio', label: '(keine)', selected: klassifizierung === 'keine', onSelect: () => setKlass('keine') },
    ...(hatWpArtTax ? [] : [{ kind: 'radio' as const, label: 'Wertpapierart', selected: klassifizierung === '__typ__', onSelect: () => setKlass('__typ__') }]),
    ...taxonomien.map((t): MenuNode => ({ kind: 'radio', label: t.name, selected: klassifizierung === t.id, onSelect: () => setKlass(t.id) })),
    { kind: 'header', label: 'Spalten' },
    check('bestand'), check('name'), check('symbol'), check('isin'), check('wkn'),
    check('kurs'), check('kursdatum'), check('marktwert'), check('anteil'),
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
    { kind: 'submenu', label: 'Performance', children: [...PERF_METRICS.map(periodSubmenu), ...groupAddRemove(periodIds(PERF_METRICS))] },
    { kind: 'submenu', label: 'Dividenden', children: [...DIV_METRICS.map(periodSubmenu), ...groupAddRemove(periodIds(DIV_METRICS))] },
    ...(taxonomien.length > 0 ? [{
      kind: 'submenu' as const, label: 'Klassifizierung',
      children: [...taxonomien.map(t => check(`tax_${t.id}`)), ...groupAddRemove(taxonomien.map(t => `tax_${t.id}`))],
    }] : []),
    { kind: 'submenu', label: 'Devisen', children: [
      check('waehrung'), check('wechselkurs'), check('kursBasis'), check('marktwertBasis'),
      check('einstandspreisBasis'), check('einstandskursBasis'), check('gewinnBasis'),
      ...groupAddRemove(['waehrung', 'wechselkurs', 'kursBasis', 'marktwertBasis', 'einstandspreisBasis', 'einstandskursBasis', 'gewinnBasis']),
    ] },
    { kind: 'submenu', label: 'Abstand zu SMA', children: SMA_PERIODS.map(n => checkLabel(`sma${n}`, `${n} Tage`)) },
    { kind: 'submenu', label: 'Abstand vom ATH', children: [
      ...reportPeriods.map(per => checkLabel(`ath_${per.key}`, per.label)),
      { kind: 'separator' }, { kind: 'action', label: 'Neu...', onClick: () => { setMenuOpen(false); setNeuPeriodeDialog('ath'); } },
    ] },
    { kind: 'submenu', label: 'Kursspanne', children: [
      ...reportPeriods.map(per => checkLabel(`kursspanne_${per.key}`, per.label)),
      { kind: 'separator' }, { kind: 'action', label: 'Neu...', onClick: () => { setMenuOpen(false); setNeuPeriodeDialog('kursspanne'); } },
    ] },
    { kind: 'separator' },
    { kind: 'action', label: 'Spalten zurücksetzen', onClick: () => cfg.resetColumns() },
    { kind: 'submenu', label: 'Darstellung', children: [
      { kind: 'check', label: 'Summenzeile oben', checked: summeOben,
        onToggle: () => { const v = !summeOben; setSummeOben(v); try { localStorage.setItem(`${storageKey}-summe-oben`, String(v)); } catch { /* */ } } },
      { kind: 'check', label: 'Summenzeile unten', checked: summeUnten,
        onToggle: () => { const v = !summeUnten; setSummeUnten(v); try { localStorage.setItem(`${storageKey}-summe-unten`, String(v)); } catch { /* */ } } },
    ] },
  ];

  // ── Zell-Rendering ──
  const cols = cfg.orderedColumns;
  const anteilOf = (p: DepotPosition) => totalVolumen > 0 ? (p.marktwert / totalVolumen) * 100 : 0;
  const wechselkurs = (p: DepotPosition) => p.waehrung === basisWaehrung ? 1 : 1;
  const periodVal = (p: DepotPosition, id: string): number | null => {
    for (const m of [...PERF_METRICS, ...DIV_METRICS]) {
      if (id.startsWith(m.id + '_')) { const key = id.slice(m.id.length + 1); return p.perfByPeriod[key]?.[m.field] ?? null; }
    }
    return null;
  };
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
      case 'name': return <span className="flex items-center gap-1.5"><ColorMarker color={p.typFarbe || getColor(p.wpKey)} />{p.name}</span>;
      case 'isin': return p.isin;
      case 'symbol': return p.symbol;
      case 'wkn': return p.wkn;
      case 'kurs': return kursLive(p.kurs);
      case 'kursdatum': return p.kursdatum ? datumKurz(p.kursdatum) : '';
      case 'marktwert': return euro(p.marktwert);
      case 'anteil': return num(anteilOf(p));
      case 'einstandskurs': return kursFmt(p.einstandskurs);
      case 'einstandskursGld': return kursFmt(p.einstandskursGldNetto);
      case 'einstandskursBrutto': return kursFmt(p.einstandskursFifoBrutto);
      case 'einstandskursGldBrutto': return kursFmt(p.einstandskursGldBrutto);
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
        if (id.startsWith('sma')) { const v = p.abstandSma[Number(id.slice(3))]; return v != null ? gp(v) : ''; }
        if (id.startsWith('ath_')) { const v = p.abstandAth[id.slice(4)]; return v != null ? gp(v) : ''; }
        if (id.startsWith('kursspanne_')) { const r = p.kursspanne[id.slice(11)]; return r && r.hoch > r.tief ? `${euro(r.tief)} – ${euro(r.hoch)}` : ''; }
        for (const m of [...PERF_METRICS, ...DIV_METRICS]) {
          if (id.startsWith(m.id + '_')) {
            const key = id.slice(m.id.length + 1);
            const v = p.perfByPeriod[key]?.[m.field];
            if (v == null) return '';
            if ((m.id === 'divFifo' || m.id === 'divGld') && (p.perfByPeriod[key]?.divSumme ?? 0) <= 0) return '';
            return m.fmt === 'eur' ? gv(v) : gp(v);
          }
        }
        return '';
      }
    }
  };
  // Konto-Zeile rendern (nur Name/Marktwert/Anteil relevant)
  const kontoCell = (k: KontoRow, id: string): React.ReactNode => {
    switch (id) {
      case 'name': return <span className="flex items-center gap-1.5"><ColorMarker color={k.farbe || getColor(k.name)} />{k.name}</span>;
      case 'marktwert': case 'marktwertBasis': return euro(k.saldo);
      case 'anteil': return num(totalVolumen > 0 ? (k.saldo / totalVolumen) * 100 : 0);
      case 'waehrung': return basisWaehrung;
      default: return '';
    }
  };
  const sumCell = (items: DepotPosition[], kontos: KontoRow[], id: string, label: string): React.ReactNode => {
    const sum = (f: (p: DepotPosition) => number) => items.reduce((s, p) => s + Math.round(f(p) * 100) / 100, 0);
    const kontoSum = kontos.reduce((s, k) => s + k.saldo, 0);
    const totalMw = sum(p => p.marktwert) + kontoSum;
    switch (id) {
      case 'name': return label;
      case 'marktwert': case 'marktwertBasis': return euro(totalMw);
      case 'anteil': return num(totalVolumen > 0 ? (totalMw / totalVolumen) * 100 : 0);
      case 'einstandspreis': case 'einstandspreisBasis': return euro(sum(p => p.investiert));
      case 'einstandspreisGld': return euro(sum(p => p.investiertGldBrutto));
      case 'gewinn': case 'gewinnBasis': return gv(sum(p => p.gewinn));
      default: {
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

  // Gruppierung nach Klassifizierung. Eine Gruppe hält Wertpapier-Positionen
  // UND Konto-Zeilen, da PPs "Wertpapierart"-Taxonomie auch Konten zuordnet
  // (Buchgeld / Virtuelle Kryptokonten / Bargeld).
  interface Gruppe { positionen: DepotPosition[]; konten: KontoRow[] }
  const groups = new Map<string, Gruppe>();
  const ensure = (g: string): Gruppe => {
    let e = groups.get(g);
    if (!e) { e = { positionen: [], konten: [] }; groups.set(g, e); }
    return e;
  };
  const grouped = klassifizierung !== 'keine';
  if (!grouped) {
    ensure('').positionen.push(...positions);
    // Konten bleiben separat (siehe Render unten)
  } else if (klassifizierung === '__typ__') {
    // Eingebaute Typ-Gruppierung (Fallback ohne echte Taxonomie).
    for (const p of positions) ensure(TYP_LABELS[p.typ] ?? p.typ ?? 'Sonstige').positionen.push(p);
    for (const k of kontoRows) ensure('Barbestand').konten.push(k);
  } else {
    // Echte Taxonomie: Positionen über wpKey, Konten über Konto-Name zuordnen.
    const lookup = klassByTax.get(klassifizierung);
    for (const p of positions) ensure(lookup?.get(p.wpKey) || 'Nicht klassifiziert').positionen.push(p);
    for (const k of kontoRows) ensure(lookup?.get(k.name) || 'Nicht klassifiziert').konten.push(k);
  }

  const sumRow = (label: string) => (
    <tr className="pp-sum">
      {cols.map(c => <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}>{sumCell(positions, kontoRows, c.id, label)}</td>)}
    </tr>
  );

  const exportCSV = useCallback(() => {
    const header = cols.map(c => c.label).join(';');
    const escape = (n: React.ReactNode): string => typeof n === 'string' ? n : '';
    const rows = positions.map(p => cols.map(c => {
      const v = cell(p, c.id);
      return escape(v) || (sortVal(p, c.id) ?? '');
    }).join(';'));
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${exportFileName}.csv`;
    a.click();
  }, [cols, positions]); // eslint-disable-line react-hooks/exhaustive-deps

  // PP: Im externen Modus (View-Header) die Steuer-Elemente nach außen melden.
  useEffect(() => {
    if (externalToolbar && onControls) onControls({ exportCSV, menuNodes });
  }); // bei jedem Render melden, damit menuNodes (Sichtbarkeiten) aktuell bleiben

  return (
    <div className="flex flex-col h-full">
      {/* Pane-Toolbar (PP StatementOfAssetsPane.addButtons) — nur im internen
          Modus; im externen Modus rendert der View die Buttons im Header. */}
      {!externalToolbar && (
        <div className="flex items-center justify-end gap-1 px-2 py-[2px]" style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-header-bg)' }}>
          <button className="pp-toolbar-btn" title="Daten exportieren" onClick={exportCSV}><Download size={12} /></button>
          <div className="relative">
            <button className="pp-toolbar-btn" title="Spalten anzeigen / ausblenden" onClick={() => setMenuOpen(o => !o)}><Settings size={12} /></button>
            {menuOpen && <HierarchyMenu nodes={menuNodes} onClose={() => setMenuOpen(false)} />}
          </div>
        </div>
      )}
      {neuPeriodeDialog !== null && (
        <ReportingPeriodDialog onClose={() => setNeuPeriodeDialog(null)} onSelect={r => onAddPeriod(r, neuPeriodeDialog)} />
      )}
      <div className="flex-1 overflow-auto">
        <table className="pp-table">
          <thead><tr>{cols.map((c, i) => <ColumnHeader key={c.id} col={c} index={i} cfg={cfg} />)}</tr></thead>
          <tbody>
            {summeOben && (positions.length > 0 || kontoRows.length > 0) && sumRow('Summe')}
            {Array.from(groups.entries()).map(([typ, g]) => {
              const items = cfg.sortData(g.positionen, sortVal);
              const anzahl = items.length + g.konten.length;
              return (
                <Fragment key={typ || '_all'}>
                  {grouped && (
                    <tr className="pp-group">
                      {cols.map(c => (
                        <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}>
                          {c.id === 'name' ? `${typ} (${anzahl})` : sumCell(items, g.konten, c.id, '')}
                        </td>
                      ))}
                    </tr>
                  )}
                  {items.map(p => (
                    <tr key={p.wpKey} className={`pp-row${selectedKey === p.wpKey ? ' selected' : ''}`}
                      style={onSelectPosition ? { cursor: 'pointer' } : undefined}
                      onClick={onSelectPosition ? () => onSelectPosition(selectedKey === p.wpKey ? null : p.wpKey) : undefined}>
                      {cols.map(c => (
                        <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}
                          style={c.id === 'name' && grouped ? { paddingLeft: 20 } : undefined}>
                          {cell(p, c.id)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Konto-Zeilen dieser Gruppe (PP: Buchgeld/Virtuelle Kryptokonten/Bargeld). */}
                  {g.konten.map(k => (
                    <tr key={`konto:${k.name}`} className="pp-row">
                      {cols.map(c => (
                        <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}
                          style={c.id === 'name' && grouped ? { paddingLeft: 20 } : undefined}>
                          {kontoCell(k, c.id)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {/* Ungruppiert: Konten direkt unter den Positionen (keine Gruppe). */}
            {!grouped && kontoRows.map(k => (
              <tr key={`konto:${k.name}`} className="pp-row">
                {cols.map(c => <td key={c.id} className={c.align === 'right' ? 'right mono' : undefined}>{kontoCell(k, c.id)}</td>)}
              </tr>
            ))}
            {summeUnten && (positions.length > 0 || kontoRows.length > 0) && sumRow('Summe')}
          </tbody>
        </table>
      </div>
    </div>
  );
}
