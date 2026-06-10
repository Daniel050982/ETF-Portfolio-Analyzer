import { Search, Filter, Settings } from 'lucide-react';

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
export function ColorMarker({ color }: { color: string }) {
  return <span className="inline-block w-[9px] h-[9px] rounded-[1px] flex-shrink-0" style={{ backgroundColor: color }} />;
}

/* ── Color palettes ── */
const PALETTE = ['#2196f3', '#ff9800', '#4caf50', '#9c27b0', '#e91e63', '#00bcd4', '#ff5722', '#607d8b', '#8bc34a', '#3f51b5'];
const colorCache: Record<string, string> = {};
let nextIdx = 0;

export function getColor(key: string): string {
  if (!colorCache[key]) {
    colorCache[key] = PALETTE[nextIdx % PALETTE.length];
    nextIdx++;
  }
  return colorCache[key];
}

/* ── Toolbar ── */
interface ToolbarProps {
  title: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  showSearch?: boolean;
  children?: React.ReactNode;
}

export function Toolbar({ title, searchValue, onSearchChange, showSearch = true, children }: ToolbarProps) {
  return (
    <div className="pp-toolbar">
      <span className="pp-toolbar-title">{title}</span>
      {children}
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
      <button type="button" className="pp-toolbar-btn"><Filter size={14} /></button>
      <button type="button" className="pp-toolbar-btn"><Settings size={14} /></button>
    </div>
  );
}

/* ── Tab bar (PP-style detail tabs) ── */
interface TabBarProps {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="flex items-end flex-shrink-0" style={{ background: 'var(--pp-header-bg)', borderBottom: '1px solid var(--pp-border)' }}>
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
