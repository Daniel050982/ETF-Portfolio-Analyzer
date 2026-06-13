import { useState, useRef, useLayoutEffect } from 'react';

/* ══════════════════════════════════════════════════════════════════════
   HierarchyMenu — generisches mehrstufiges Dropdown-Menü (Header-Labels,
   Checkboxen, Radio-Items, Submenüs mit ▸). Optik IDENTISCH zum Spaltenmenü
   der PPTable (echte Checkbox-Quadrate via accentColor). Submenüs öffnen bei
   Hover; Eintrag + Submenü liegen im selben relative-Container, damit die Maus
   beim Übergang nicht "herausfällt" (PP ShowHideColumnHelper-Muster).
   ══════════════════════════════════════════════════════════════════════ */

export type MenuNode =
  | { kind: 'header'; label: string }
  | { kind: 'separator' }
  | { kind: 'check'; label: string; checked: boolean; onToggle: () => void }
  | { kind: 'radio'; label: string; selected: boolean; onSelect: () => void }
  | { kind: 'action'; label: string; onClick: () => void; danger?: boolean }
  | { kind: 'submenu'; label: string; children: MenuNode[] };

const MENU_STYLE: React.CSSProperties = {
  background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)',
  borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.4)', minWidth: 220,
  padding: '4px 0', whiteSpace: 'nowrap',
  // über sticky Tabellen-Header (thead) liegen, damit Submenüs anklickbar sind
  zIndex: 9000,
};
const ITEM_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '2px 12px',
  cursor: 'pointer', color: 'var(--pp-text)', background: 'transparent',
  border: 'none', width: '100%', textAlign: 'left', fontSize: 11,
};
const hoverOn = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = 'var(--pp-selected-bg)'; };
const hoverOff = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = 'transparent'; };

/* Selbst gerendertes Checkbox-Quadrat (statt nativer <input>), damit die Optik
   plattformunabhängig identisch ist: orange gefülltes Quadrat mit weißem Haken
   im aktiven Zustand, sonst leeres Quadrat mit Rahmen. */
export function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 13, height: 13, flexShrink: 0, borderRadius: 2,
      border: `1px solid ${checked ? 'var(--pp-accent)' : 'var(--pp-border)'}`,
      background: checked ? 'var(--pp-accent)' : 'transparent',
    }}>
      {checked && (
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
/* Radio-Kreis (analog, gefüllter Punkt im aktiven Zustand). */
function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 13, height: 13, flexShrink: 0, borderRadius: '50%',
      border: `1px solid ${selected ? 'var(--pp-accent)' : 'var(--pp-border)'}`,
    }}>
      {selected && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pp-accent)' }} />}
    </span>
  );
}

function CheckItem({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button className="flex items-center gap-2 px-3 py-[2px] cursor-pointer"
      style={{ color: 'var(--pp-text)', fontSize: 11, background: 'transparent', border: 'none', width: '100%', textAlign: 'left' }}
      onMouseEnter={hoverOn} onMouseLeave={hoverOff} onClick={onToggle}>
      <CheckBox checked={checked} />
      {label}
    </button>
  );
}

function RadioItem({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button className="flex items-center gap-2 px-3 py-[2px] cursor-pointer"
      style={{ color: 'var(--pp-text)', fontSize: 11, background: 'transparent', border: 'none', width: '100%', textAlign: 'left' }}
      onMouseEnter={hoverOn} onMouseLeave={hoverOff} onClick={onSelect}>
      <RadioDot selected={selected} />
      {label}
    </button>
  );
}

function Submenu({ node, depth }: { node: Extract<MenuNode, { kind: 'submenu' }>; depth: number }) {
  const [open, setOpen] = useState(false);
  // Submenü FIXED zum Viewport, damit es nicht vom scrollbaren Eltern-Menü
  // abgeschnitten wird; öffnet zur Seite mit Platz und nach oben falls nötig.
  const [pos, setPos] = useState<{ left?: number; right?: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) { setPos(null); return; }
    const a = ref.current.getBoundingClientRect();
    const subW = 230, margin = 8;
    const openLeft = a.right + subW > window.innerWidth;
    const horiz = openLeft ? { right: window.innerWidth - a.left } : { left: a.right };
    const subH = subRef.current?.scrollHeight ?? node.children.length * 24 + 8;
    const spaceBelow = window.innerHeight - a.top - margin;
    const top = subH > spaceBelow ? Math.max(margin, window.innerHeight - subH - margin) : a.top;
    setPos({ ...horiz, top, maxHeight: window.innerHeight - 2 * margin });
  }, [open, node.children.length]);

  return (
    <div ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <div className="flex items-center justify-between px-3 py-[2px] cursor-pointer"
        style={{ color: 'var(--pp-text)', fontSize: 11, background: open ? 'var(--pp-selected-bg)' : 'transparent' }}>
        <span>{node.label}</span>
        <span style={{ fontSize: 8, marginLeft: 12, color: 'var(--pp-text-muted)' }}>▶</span>
      </div>
      {open && pos && (
        <div ref={subRef}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          style={{ ...MENU_STYLE, position: 'fixed', ...pos, overflowY: 'auto', overflowX: 'visible' }}>
          {node.children.map((c, i) => <NodeRenderer key={i} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

function NodeRenderer({ node, depth }: { node: MenuNode; depth: number }) {
  switch (node.kind) {
    case 'header':
      return <div style={{ padding: '4px 12px 2px', fontSize: 11, color: 'var(--pp-text-muted)' }}>{node.label}</div>;
    case 'separator':
      return <div style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />;
    case 'check':
      return <CheckItem label={node.label} checked={node.checked} onToggle={node.onToggle} />;
    case 'radio':
      return <RadioItem label={node.label} selected={node.selected} onSelect={node.onSelect} />;
    case 'action':
      return (
        <button style={{ ...ITEM_STYLE, color: node.danger ? 'var(--pp-red-text)' : undefined }}
          onMouseEnter={hoverOn} onMouseLeave={hoverOff} onClick={node.onClick}>
          {node.label}
        </button>
      );
    case 'submenu':
      return <Submenu node={node} depth={depth} />;
  }
}

export function HierarchyMenu({ nodes, onClose, anchorRight = true }: {
  nodes: MenuNode[];
  onClose: () => void;
  anchorRight?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Fixed-Positionierung relativ zum Trigger (parent), damit das Menü nie vom
  // unteren Tabellenrand abgeschnitten wird. Klappt nach oben, wenn unten kein
  // Platz ist; begrenzt die Höhe auf den Viewport (dann scrollbar).
  const [pos, setPos] = useState<{ left?: number; right?: number; top?: number; bottom?: number; maxHeight: number }>({ maxHeight: 9999 });

  useLayoutEffect(() => {
    const el = ref.current;
    const anchor = el?.parentElement; // der relative-Wrapper um den Trigger-Button
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const menuH = el.scrollHeight;
    const margin = 8;
    const spaceBelow = window.innerHeight - a.bottom - margin;
    const spaceAbove = a.top - margin;
    const openUp = menuH > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, openUp ? spaceAbove : spaceBelow);
    const horiz = anchorRight ? { right: window.innerWidth - a.right } : { left: a.left };
    setPos(openUp
      ? { ...horiz, bottom: window.innerHeight - a.top + 2, maxHeight }
      : { ...horiz, top: a.bottom + 2, maxHeight });
  }, [anchorRight]);

  useLayoutEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} style={{ ...MENU_STYLE, position: 'fixed', ...pos, overflowY: 'auto', overflowX: 'visible' }}>
      {nodes.map((n, i) => <NodeRenderer key={i} node={n} depth={0} />)}
    </div>
  );
}
