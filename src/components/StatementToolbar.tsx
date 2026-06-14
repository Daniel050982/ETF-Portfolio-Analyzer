/* Toolbar-DropDowns der Vermögensaufstellung (PP StatementOfAssetsView.addButtons).
   1:1: Basiswährungs-DropDown, TimeMachine-DropDown, ClientFilter-DropDown. */
import { useState } from 'react';
import { HierarchyMenu, type MenuNode } from './HierarchyMenu';
import { Calendar, CalendarClock, Layers, SquarePlus } from 'lucide-react';
import { datumKurz } from '../utils/format';
import type { StoredConfig } from './useConfigStore';

/* ════════════════════════════════════════════════════════════════════════
   Gemeinsamer DropDown-Button: Label/Icon + aufklappbares HierarchyMenu.
   ════════════════════════════════════════════════════════════════════════ */
/* DropDown-Button. Zwei Stile (PP StatementOfAssetsView):
   - Standard (Text-Box): wie der ConfigStore-Button aus "Alle Wertpapiere"
     (Rahmen-Box, 11px, ▼ in 7px). `square` zeigt das 7×7-Quadrat (ConfigStore),
     `active` = oranger Hintergrund + weiße Schrift.
   - iconOnly: reiner pp-toolbar-btn (22×22, nur Icon) — für TimeMachine und
     ClientFilter, die in PP nur ein Icon tragen. `active` färbt das Icon orange. */
function DropDownButton({ label, icon, square, active, iconOnly, buildNodes }: {
  label: string;
  icon?: React.ReactNode;
  square?: boolean;
  active?: boolean;
  iconOnly?: boolean;
  buildNodes: (close: () => void) => MenuNode[];
}) {
  const [open, setOpen] = useState(false);

  if (iconOnly) {
    return (
      <div className="relative flex-shrink-0">
        <button
          className="pp-toolbar-btn"
          style={active ? { color: 'var(--pp-accent)' } : undefined}
          title={label}
          onClick={() => setOpen(o => !o)}
        >
          {icon}
        </button>
        {open && <HierarchyMenu nodes={buildNodes(() => setOpen(false))} onClose={() => setOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        className="flex items-center gap-1 px-2 py-0.5 text-[11px] flex-shrink-0"
        style={{
          background: active ? 'var(--pp-accent)' : 'var(--pp-sidebar-bg)',
          color: active ? '#fff' : 'var(--pp-text)',
          border: '1px solid var(--pp-border)', borderRadius: 3, cursor: 'pointer',
        }}
        title={label}
        onClick={() => setOpen(o => !o)}
      >
        {square
          ? <span style={{ width: 7, height: 7, borderRadius: 1, background: active ? '#fff' : 'var(--pp-text-muted)', flexShrink: 0 }} />
          : icon}
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{label}</span>
        <span style={{ fontSize: 7, marginLeft: 2, opacity: 0.7, flexShrink: 0 }}>▼</span>
      </button>
      {open && <HierarchyMenu nodes={buildNodes(() => setOpen(false))} onClose={() => setOpen(false)} />}
    </div>
  );
}

/* ── ConfigurationStore-DropDowns (PP viewToolBar: gespeicherte Spalten-Sets) ──
   Je Konfiguration ein DropDown mit Icon (aktiv = gefüllt) + Name; Menü:
   Anzeigen · Ansicht duplizieren · Ansicht umbenennen · Ansicht löschen ·
   Ganz nach vorne. Am Ende ein "＋"-Button (Neue Ansicht). ── */
export function ConfigStoreDropDowns({ configs, activeId, onActivate, onDuplicate, onRename, onDelete, onBringToFront, onNew }: {
  configs: StoredConfig[];
  activeId: string;
  onActivate: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onBringToFront: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {configs.map((cfg, idx) => {
        const isActive = cfg.id === activeId;
        return (
          <DropDownButton
            key={cfg.id}
            label={cfg.name}
            square
            active={isActive}
            buildNodes={(close) => {
              const nodes: MenuNode[] = [];
              if (!isActive) {
                nodes.push({ kind: 'action', label: 'Anzeigen', onClick: () => { onActivate(cfg.id); close(); } });
                nodes.push({ kind: 'separator' });
              }
              nodes.push({ kind: 'action', label: 'Ansicht duplizieren', onClick: () => { onDuplicate(cfg.id); close(); } });
              nodes.push({ kind: 'action', label: 'Ansicht umbenennen', onClick: () => { onRename(cfg.id); close(); } });
              // PP: "Ansicht löschen" immer vorhanden (löscht die letzte → neue Standard)
              nodes.push({ kind: 'action', label: 'Ansicht löschen', danger: true, onClick: () => { onDelete(cfg.id); close(); } });
              if (idx > 0) {
                nodes.push({ kind: 'separator' });
                nodes.push({ kind: 'action', label: 'Ganz nach vorne', onClick: () => { onBringToFront(cfg.id); close(); } });
              }
              return nodes;
            }}
          />
        );
      })}
      <button className="pp-toolbar-btn" title="Neue Ansicht" onClick={onNew}><SquarePlus size={14} /></button>
    </div>
  );
}

/* ── Basiswährungs-DropDown (PP: verwendete Währungen oben, dann gruppierte Liste) ── */
/* Gängige Währungen (PP CurrencyUnit.getAvailableCurrencyUnitsGrouped, gekürzt auf
   die im Tool relevanten — vollständig genug für die Auswahl). */
const CURRENCY_GROUPS: { group: string; codes: string[] }[] = [
  { group: 'Euro & wichtige', codes: ['EUR', 'USD', 'GBP', 'CHF', 'JPY'] },
  { group: 'Amerika', codes: ['USD', 'CAD', 'BRL', 'MXN', 'ARS'] },
  { group: 'Europa', codes: ['EUR', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF'] },
  { group: 'Asien/Pazifik', codes: ['JPY', 'CNY', 'HKD', 'SGD', 'AUD', 'NZD', 'INR', 'KRW'] },
  { group: 'Sonstige', codes: ['ZAR', 'TRY', 'RUB', 'ILS', 'AED'] },
];

export function BaseCurrencyDropDown({ basisWaehrung, usedCurrencies, onChange }: {
  basisWaehrung: string;
  usedCurrencies: string[];
  onChange: (code: string) => void;
}) {
  return (
    <DropDownButton
      label={basisWaehrung}
      buildNodes={(close) => {
        const used = [...new Set(usedCurrencies.length ? usedCurrencies : [basisWaehrung])];
        const nodes: MenuNode[] = used.map(code => ({
          kind: 'radio', label: code, selected: code === basisWaehrung,
          onSelect: () => { onChange(code); close(); },
        }));
        nodes.push({ kind: 'separator' });
        for (const grp of CURRENCY_GROUPS) {
          nodes.push({
            kind: 'submenu', label: grp.group,
            children: grp.codes.map(code => ({
              kind: 'radio' as const, label: code, selected: code === basisWaehrung,
              onSelect: () => { onChange(code); close(); },
            })),
          });
        }
        return nodes;
      }}
    />
  );
}

/* ── TimeMachine-DropDown (PP: Heute / Voriger Handelstag / Anderes Datum…) ── */
export function TimeMachineDropDown({ snapshotDate, onChange }: {
  snapshotDate: Date | null; // null = heute
  onChange: (date: Date | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isToday = snapshotDate === null;

  const previousTradingDay = (): Date => {
    const d = snapshotDate ? new Date(snapshotDate) : new Date();
    d.setDate(d.getDate() - 1);
    // Wochenenden überspringen (vereinfachter Handelskalender)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d;
  };

  return (
    <>
      <DropDownButton
        label={isToday ? 'Stichtag: Heute' : `Stichtag: ${datumKurz(snapshotDate!)}`}
        iconOnly
        icon={isToday ? <Calendar size={14} /> : <CalendarClock size={14} />}
        active={!isToday}
        buildNodes={(close) => [
          { kind: 'header', label: isToday ? 'Stichtag: Heute' : `Stichtag: ${datumKurz(snapshotDate!)}` },
          { kind: 'separator' },
          { kind: 'action', label: 'Heute', onClick: () => { onChange(null); close(); } },
          { kind: 'action', label: 'Voriger Handelstag', onClick: () => { onChange(previousTradingDay()); close(); } },
          { kind: 'action', label: 'Anderes Datum…', onClick: () => { setPickerOpen(true); close(); } },
        ]}
      />
      {pickerOpen && (
        <DateDialog
          initial={snapshotDate ?? new Date()}
          onClose={() => setPickerOpen(false)}
          onConfirm={(d) => {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const sel = new Date(d); sel.setHours(0, 0, 0, 0);
            onChange(sel.getTime() >= today.getTime() ? null : sel);
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}

/* Kalender-Dialog für "Anderes Datum…". */
function DateDialog({ initial, onClose, onConfirm }: {
  initial: Date; onClose: () => void; onConfirm: (d: Date) => void;
}) {
  const [value, setValue] = useState(() => {
    const y = initial.getFullYear(), m = String(initial.getMonth() + 1).padStart(2, '0'), d = String(initial.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--pp-sidebar-bg)', border: '1px solid var(--pp-border)', borderRadius: 6, padding: 16, minWidth: 280 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--pp-text)', marginBottom: 10 }}>Stichtag wählen</div>
        <input type="date" autoFocus value={value} onChange={e => setValue(e.target.value)} max={new Date().toISOString().slice(0, 10)}
          style={{ width: '100%', padding: '4px 8px', fontSize: 12, background: 'var(--pp-content-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)', borderRadius: 3 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="pp-toolbar-btn" style={{ padding: '4px 16px' }} onClick={onClose}>Abbrechen</button>
          <button className="pp-toolbar-btn" style={{ padding: '4px 16px', background: 'var(--pp-accent)', color: '#fff' }}
            onClick={() => { const [y, m, d] = value.split('-').map(Number); onConfirm(new Date(y, m - 1, d)); }}>OK</button>
        </div>
      </div>
    </div>
  );
}

/* ── ClientFilter ──
   Ein Filter beschreibt, welche Konten/Depots in die Auswertung einfließen.
   PP: Gesamtportfolio (kein Filter) + je Depot + je Depot+Referenzkonto +
   gespeicherte Filter (= Gruppierungen) + "Neuer Filter…" / "Filter verwalten…". */
export interface ClientFilterValue {
  id: string;        // '' = Gesamtportfolio
  label: string;
  kontoNamen: string[];
  depotNamen: string[];
}

export const ENTIRE_PORTFOLIO: ClientFilterValue = { id: '', label: 'Gesamtportfolio', kontoNamen: [], depotNamen: [] };

export function ClientFilterDropDown({ value, depots, gruppierungen, onChange, onNewFilter, onManageFilter }: {
  value: ClientFilterValue;
  depots: { name: string; referenzkontoName?: string }[];
  gruppierungen: { id: string; name: string; kontoNamen: string[]; depotNamen: string[] }[];
  onChange: (v: ClientFilterValue) => void;
  onNewFilter: () => void;
  onManageFilter: () => void;
}) {
  return (
    <DropDownButton
      label={value.id === '' ? 'Daten nach Depot und Referenzkonto filtern' : value.label}
      iconOnly
      icon={<Layers size={14} />}
      active={value.id !== ''}
      buildNodes={(close) => {
        const nodes: MenuNode[] = [];
        // Gesamtportfolio
        nodes.push({ kind: 'radio', label: 'Gesamtportfolio', selected: value.id === '', onSelect: () => { onChange(ENTIRE_PORTFOLIO); close(); } });
        // Je Depot (+ Referenzkonto)
        if (depots.length) {
          nodes.push({ kind: 'separator' });
          for (const d of depots) {
            const idDepot = `depot:${d.name}`;
            nodes.push({
              kind: 'radio', label: d.name, selected: value.id === idDepot,
              onSelect: () => { onChange({ id: idDepot, label: d.name, kontoNamen: [], depotNamen: [d.name] }); close(); },
            });
            if (d.referenzkontoName) {
              const idCombo = `depot:${d.name}+${d.referenzkontoName}`;
              nodes.push({
                kind: 'radio', label: `${d.name} + ${d.referenzkontoName}`, selected: value.id === idCombo,
                onSelect: () => { onChange({ id: idCombo, label: `${d.name} + ${d.referenzkontoName}`, kontoNamen: [d.referenzkontoName!], depotNamen: [d.name] }); close(); },
              });
            }
          }
        }
        // Gespeicherte Filter (Gruppierungen)
        if (gruppierungen.length) {
          nodes.push({ kind: 'separator' });
          for (const g of gruppierungen) {
            const idGrp = `grp:${g.id}`;
            nodes.push({
              kind: 'radio', label: g.name, selected: value.id === idGrp,
              onSelect: () => { onChange({ id: idGrp, label: g.name, kontoNamen: g.kontoNamen, depotNamen: g.depotNamen }); close(); },
            });
          }
        }
        nodes.push({ kind: 'separator' });
        nodes.push({ kind: 'action', label: 'Neuer Filter…', onClick: () => { onNewFilter(); close(); } });
        nodes.push({ kind: 'action', label: 'Filter verwalten…', onClick: () => { onManageFilter(); close(); } });
        return nodes;
      }}
    />
  );
}

