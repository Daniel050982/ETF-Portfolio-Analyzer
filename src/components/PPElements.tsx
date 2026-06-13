import { useState, useRef, useEffect } from 'react';
import { Search, Filter, Settings, Download } from 'lucide-react';

/* ── Value arrows (green ▲ / red ▼) ── */
export function ArrowUp() {
  return <span style={{ color: 'var(--pp-green-text)', fontSize: '9px', lineHeight: 1 }}>▲</span>;
}
export function ArrowDown() {
  return <span style={{ color: 'var(--pp-red-text)', fontSize: '9px', lineHeight: 1 }}>▼</span>;
}
export function ValueArrow({ value }: { value: number }) {
  if (value > 0) return <ArrowUp />;
  if (value < 0) return <ArrowDown />;
  return null;
}

/* ── Color marker (the small colored square before names) ── */
/* Farbiges Symbol vor Namen. inaktiv → ausgegraut (PP: SECURITY_RETIRED-Symbol
   für deaktivierte/retired Wertpapiere). */
export function ColorMarker({ color, inaktiv }: { color: string; inaktiv?: boolean }) {
  return (
    <span className="inline-block w-[9px] h-[9px] rounded-[1px] flex-shrink-0"
      style={inaktiv
        ? { backgroundColor: 'var(--pp-text-muted)', opacity: 0.4 }
        : { backgroundColor: color }} />
  );
}

/* ── Suchfeld (PP TransactionSearchField) — für Detail-Pane-Toolbars ── */
export function SearchInput({ value, onChange, width = 180 }: {
  value: string; onChange: (v: string) => void; width?: number;
}) {
  return (
    <div className="pp-toolbar-search" style={{ width }}>
      <Search size={12} style={{ color: 'var(--pp-text-muted)' }} />
      <input type="text" placeholder="Suchen" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

/* ── Broker-Farben (Markenfarben) ── */
export const BROKER_COLORS: Record<string, string> = {
  'comdirect':  '#FFCB05',
  'consors':    '#003D7A',
  'consorsbank':'#003D7A',
  'scalable':   '#00D4AA',
  'krypto':     '#F7931A',
  'bargeld':    '#607d8b',
};

export const FALLBACK_PALETTE = ['#2196f3', '#ff9800', '#4caf50', '#9c27b0', '#e91e63', '#00bcd4', '#ff5722', '#607d8b', '#8bc34a', '#3f51b5'];

// Deterministische Farbe aus dem Schlüssel: gleicher Name → IMMER gleiche Farbe,
// unabhängig von Render-Reihenfolge (der frühere globale Zähler vergab je nach
// Reihenfolge wechselnde Farben — das war der Bug).
function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getColor(key: string): string {
  const lower = key.toLowerCase();
  for (const [broker, color] of Object.entries(BROKER_COLORS)) {
    if (lower.includes(broker)) return color;
  }
  return FALLBACK_PALETTE[hashKey(key) % FALLBACK_PALETTE.length];
}

/* ── Filter options (PP-style checkbox dropdown) ── */
export interface FilterOption {
  id: string;
  label: string;
  exclusive?: string;
}

export const WERTPAPIER_FILTER: FilterOption[] = [
  { id: 'onlyActive', label: 'Inaktive ausblenden', exclusive: 'onlyInactive' },
  { id: 'onlyInactive', label: 'Nur Inaktive', exclusive: 'onlyActive' },
  { id: 'onlySecurities', label: 'Nur Wertpapiere', exclusive: 'onlyExchangeRates' },
  { id: 'onlyExchangeRates', label: 'Nur Wechselkurse', exclusive: 'onlySecurities' },
  { id: 'sharesNotZero', label: 'Anteile ≠ 0', exclusive: 'sharesZero' },
  { id: 'sharesZero', label: 'Anteile = 0', exclusive: 'sharesNotZero' },
  { id: 'limitExceeded', label: 'Kursalarm überschritten' },
];

function FilterDropdown({ options, active, onChange, onClose }: {
  options: FilterOption[];
  active: Set<string>;
  onChange: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-full mt-[2px] z-50 py-1 min-w-[220px] shadow-lg"
      style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', borderRadius: 3 }}>
      {options.map(opt => {
        const checked = active.has(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            className="w-full text-left px-3 py-[3px] text-[11px] flex items-center gap-2"
            style={{
              color: 'var(--pp-text)',
              background: 'transparent',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => onChange(opt.id)}
          >
            <span className="inline-flex items-center justify-center w-[13px] h-[13px] rounded-[2px] flex-shrink-0"
              style={{
                border: `1px solid ${checked ? 'var(--pp-accent)' : 'var(--pp-text-muted)'}`,
                background: checked ? 'var(--pp-accent)' : 'transparent',
              }}>
              {checked && <span className="text-[9px] leading-none" style={{ color: 'var(--pp-bg)' }}>✓</span>}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Toolbar ── */
/* PP AbstractFinanceView.createHeader: 3-column GridLayout
   Col 1: title label
   Col 2: viewToolBar (ConfigurationStore buttons), grab=true, align=SWT.END
   Col 3: actionToolBar

   PP SecurityListView.addButtons (actionToolBar order):
   addSearchButton | Separator | CreateSecurityDropDown | FilterDropDown | addExportButton | DropDown(MenuShowHideColumns, CONFIG) */
interface ToolbarProps {
  title: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  showSearch?: boolean;
  filterOptions?: FilterOption[];
  activeFilters?: Set<string>;
  onFilterToggle?: (id: string) => void;
  onExportClick?: () => void;
  onSettingsClick?: (e: React.MouseEvent) => void;
  viewButtons?: React.ReactNode;
  children?: React.ReactNode;
}

export function Toolbar({ title, searchValue, onSearchChange, showSearch = true, filterOptions, activeFilters, onFilterToggle, onExportClick, onSettingsClick, viewButtons, children }: ToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const isFiltered = activeFilters && activeFilters.size > 0;

  return (
    <div className="pp-toolbar">
      {/* PP Col 1: Title */}
      <span className="pp-toolbar-title">{title}</span>
      {/* PP Col 2: viewToolBar — right-aligned, grab horizontal space */}
      <div style={{ flex: 1 }} />
      {viewButtons}
      {/* PP Col 3: actionToolBar — Search | Separator | + | Filter | Export | ⚙ */}
      {showSearch && (
        <div className="pp-toolbar-search">
          <Search size={12} style={{ color: 'var(--pp-text-muted)' }} />
          <input
            type="text"
            placeholder="Suchen"
            value={searchValue ?? ''}
            onChange={e => onSearchChange?.(e.target.value)}
          />
        </div>
      )}
      {/* PP: Separator between search and action buttons */}
      {showSearch && <div style={{ width: 1, height: 16, background: 'var(--pp-border)', flexShrink: 0 }} />}
      {children}
      <div className="relative">
        <button
          type="button"
          className="pp-toolbar-btn"
          title="Filter"
          style={{ color: isFiltered ? 'var(--pp-accent)' : undefined }}
          onClick={() => filterOptions ? setFilterOpen(!filterOpen) : undefined}
        >
          <Filter size={14} />
        </button>
        {filterOpen && filterOptions && onFilterToggle && activeFilters && (
          <FilterDropdown
            options={filterOptions}
            active={activeFilters}
            onChange={onFilterToggle}
            onClose={() => setFilterOpen(false)}
          />
        )}
      </div>
      {onExportClick && (
        <button type="button" className="pp-toolbar-btn" title="CSV Export" onClick={onExportClick}><Download size={14} /></button>
      )}
      {onSettingsClick && (
        <button type="button" className="pp-toolbar-btn" title="Spalten anzeigen/ausblenden" onClick={e => onSettingsClick?.(e)}><Settings size={14} /></button>
      )}
    </div>
  );
}

/* ── Tab bar (PP-style detail tabs) ──
   PP InformationPane: Tabs links, die Pane-Toolbar (addButtons) rechts in
   DERSELBEN Header-Zeile. `actions` rendert rechtsbündig in der Tab-Leiste. */
interface TabBarProps {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  actions?: React.ReactNode;
}

export function TabBar({ tabs, active, onChange, actions }: TabBarProps) {
  return (
    <div className="flex items-stretch flex-shrink-0" style={{ background: 'var(--pp-header-bg)', borderBottom: '1px solid var(--pp-border)' }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="px-3 py-[4px] text-[11px] relative"
            style={{
              background: isActive ? 'var(--pp-tab-active-bg)' : 'var(--pp-tab-inactive-bg)',
              color: isActive ? 'var(--pp-text)' : 'var(--pp-text-muted)',
              fontWeight: isActive ? 600 : 400,
              borderRight: '1px solid var(--pp-border)',
            }}
          >
            <span className="flex items-center gap-1.5">
              <ColorMarker color={isActive ? '#ff9800' : '#555'} />
              {tab.label}
            </span>
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'var(--pp-tab-indicator)' }} />
            )}
          </button>
        );
      })}
      {actions && (
        <div className="flex items-center gap-1 ml-auto px-2">
          {actions}
        </div>
      )}
    </div>
  );
}

/* ── Statusbar ── */
export function Statusbar({ children }: { children?: React.ReactNode }) {
  return (
    <footer
      className="h-[20px] flex-shrink-0 flex items-center px-2 text-[10px]"
      style={{ background: 'var(--pp-header-bg)', borderTop: '1px solid var(--pp-border)', color: 'var(--pp-text-muted)' }}
    >
      {children}
      <span className="ml-auto">ETF Portfolio Analyzer v1.0</span>
    </footer>
  );
}

/* ── Placeholder view for unimplemented views ── */
export function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="flex flex-col h-full">
      <Toolbar title={title} showSearch={false} />
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--pp-text-muted)' }}>
        <span className="text-[12px]">Wird in einer späteren Phase implementiert.</span>
      </div>
    </div>
  );
}
