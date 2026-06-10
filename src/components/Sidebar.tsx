import { useState } from 'react';

/* ── View IDs — exactly matching PP's navigation tree ── */
export type ViewId =
  /* Wertpapiere */
  | 'alle-wertpapiere' | 'krypto' | 'etf' | 'waehrungen'
  /* Stammdaten */
  | 'konten' | 'depots' | 'gruppierte-konten' | 'sparplaene' | 'alle-buchungen'
  /* Berichte */
  | 'vermoegensuebersicht' | 'diagramm-berichte' | 'bestand'
  /* Performance */
  | 'berechnung' | 'diagramm-perf' | 'rendite-volatilitaet' | 'wertpapiere-perf' | 'zahlungen' | 'trades'
  /* Klassifizierungen */
  | 'klassifizierung-wertpapierart'
  /* Allgemeine Daten */
  | 'waehrungen-allgemein' | 'einstellungen'
  /* Extra: Steuern + Import */
  | 'steuer' | 'steuer-positionen' | 'import';

/* ── Sidebar item definition ── */
interface SidebarItem {
  id: ViewId;
  label: string;
  iconColor?: string;
  iconType?: 'folder' | 'list' | 'grouped' | 'sparplan';
}

interface SidebarSection {
  id: string;
  label: string;
  hasPlus?: boolean;
  items: SidebarItem[];
}

/* ── PP navigation tree — from source NavigationView.java ── */
const SECTIONS: SidebarSection[] = [
  {
    id: 'wertpapiere',
    label: 'Wertpapiere',
    hasPlus: true,
    items: [
      { id: 'alle-wertpapiere', label: 'Alle Wertpapiere', iconColor: '#4caf50', iconType: 'folder' },
      { id: 'krypto', label: 'Krypto', iconColor: '#4caf50', iconType: 'folder' },
      { id: 'etf', label: 'ETF', iconColor: '#4caf50', iconType: 'folder' },
      { id: 'waehrungen', label: 'Währungen', iconColor: '#4caf50', iconType: 'folder' },
    ],
  },
  {
    id: 'stammdaten',
    label: 'Stammdaten',
    items: [
      { id: 'konten', label: 'Konten', iconColor: '#ff9800', iconType: 'folder' },
      { id: 'depots', label: 'Depots', iconColor: '#2196f3', iconType: 'folder' },
      { id: 'gruppierte-konten', label: 'Gruppierte Konten', iconType: 'grouped' },
      { id: 'sparplaene', label: 'Sparpläne', iconColor: '#9e9e9e', iconType: 'folder' },
      { id: 'alle-buchungen', label: 'Alle Buchungen', iconType: 'list' },
    ],
  },
  {
    id: 'berichte',
    label: 'Berichte',
    items: [
      { id: 'vermoegensuebersicht', label: 'Vermögensaufstellung' },
      { id: 'diagramm-berichte', label: 'Diagramm' },
      { id: 'bestand', label: 'Bestand' },
    ],
  },
  {
    id: 'performance',
    label: 'Performance',
    items: [
      { id: 'berechnung', label: 'Berechnung' },
      { id: 'diagramm-perf', label: 'Diagramm' },
      { id: 'rendite-volatilitaet', label: 'Rendite / Volatilität' },
      { id: 'wertpapiere-perf', label: 'Wertpapiere' },
      { id: 'zahlungen', label: 'Zahlungen' },
      { id: 'trades', label: 'Trades' },
    ],
  },
  {
    id: 'klassifizierungen',
    label: 'Klassifizierungen',
    hasPlus: true,
    items: [
      { id: 'klassifizierung-wertpapierart', label: 'Wertpapierart' },
    ],
  },
  {
    id: 'steuern',
    label: 'Steuern',
    items: [
      { id: 'steuer', label: 'Steuer-Übersicht' },
      { id: 'steuer-positionen', label: 'FIFO-Positionen' },
    ],
  },
  {
    id: 'allgemeine-daten',
    label: 'Allgemeine Daten',
    items: [
      { id: 'waehrungen-allgemein', label: 'Währungen' },
      { id: 'einstellungen', label: 'Einstellungen' },
      { id: 'import', label: 'Import' },
    ],
  },
];

/* ── Mini SVG icons ── */
function FolderIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="12" viewBox="0 0 16 14" className="flex-shrink-0">
      <path d="M1 2h4.5l1.5 1.5H15v9.5H1z" fill={color} opacity="0.85" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 16 14" className="flex-shrink-0">
      <rect x="1" y="2" width="14" height="1.5" rx="0.5" fill="#888" />
      <rect x="1" y="6" width="14" height="1.5" rx="0.5" fill="#888" />
      <rect x="1" y="10" width="14" height="1.5" rx="0.5" fill="#888" />
    </svg>
  );
}
function GroupedIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 16 14" className="flex-shrink-0">
      <circle cx="5" cy="7" r="3.5" fill="#9e9e9e" opacity="0.5" />
      <circle cx="11" cy="7" r="3.5" fill="#9e9e9e" opacity="0.5" />
    </svg>
  );
}
function ItemIcon({ item }: { item: SidebarItem }) {
  if (item.iconType === 'folder' && item.iconColor) return <FolderIcon color={item.iconColor} />;
  if (item.iconType === 'list') return <ListIcon />;
  if (item.iconType === 'grouped') return <GroupedIcon />;
  if (item.iconType === 'sparplan') return <FolderIcon color={item.iconColor ?? '#9e9e9e'} />;
  return <span className="w-[14px] flex-shrink-0" />;
}

/* ── Chevron ── */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0" style={{ color: 'var(--pp-section-header)' }}>
      {open
        ? <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        : <path d="M3.5 2 L6.5 5 L3.5 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      }
    </svg>
  );
}

/* ── Plus icon ── */
function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: 'var(--pp-text-muted)' }} className="flex-shrink-0">
      <path d="M6 2v8M2 6h8" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/* ── Sidebar component ── */
interface SidebarProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
}

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside
      className="flex-shrink-0 flex flex-col overflow-y-auto overflow-x-hidden select-none"
      style={{
        width: 168,
        background: 'var(--pp-sidebar-bg)',
        borderRight: '1px solid var(--pp-border)',
      }}
    >
      {SECTIONS.map(section => {
        const isOpen = !collapsed.has(section.id);
        return (
          <div key={section.id}>
            {/* Section header */}
            <div
              className="flex items-center gap-1 px-2 py-[3px] cursor-pointer"
              onClick={() => toggle(section.id)}
              style={{ marginTop: 2 }}
            >
              <Chevron open={isOpen} />
              <span
                className="text-[11px] font-bold flex-1"
                style={{ color: 'var(--pp-section-header)' }}
              >
                {section.label}
              </span>
              {section.hasPlus && <PlusIcon />}
            </div>

            {/* Items */}
            {isOpen && section.items.map(item => {
              const active = activeView === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="flex items-center gap-[5px] py-[2px] cursor-pointer"
                  style={{
                    paddingLeft: 24,
                    paddingRight: 6,
                    background: active ? 'var(--pp-row-selected)' : 'transparent',
                    color: active ? 'var(--pp-text)' : 'var(--pp-text-secondary)',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget.style.background = 'var(--pp-row-hover)'); }}
                  onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent'); }}
                >
                  <ItemIcon item={item} />
                  <span className="text-[12px] truncate leading-tight">{item.label}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}
