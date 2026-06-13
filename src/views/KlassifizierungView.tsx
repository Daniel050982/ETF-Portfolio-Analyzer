import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Treemap as RechartsTreemap } from 'recharts';
import { usePortfolio } from '../store/PortfolioContext';
import { ColorMarker } from '../components/PPElements';
import { useResizableColumns } from '../components/useResizableColumns';
import { euro } from '../utils/format';
import type { Taxonomie, Klassifizierung, KlassifizierungZuweisung } from '../types/portfolio';
import {
  List, Circle, PieChart as PieIcon, LayoutGrid, AreaChart, BarChart3,
  Search, Filter, Settings, ChevronDown, ChevronRight, Download,
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════
   PP view modes — 7 in original TaxonomyView.java addButtons()
   ══════════════════════════════════════════════════════════════════════ */
const VIEW_MODES = [
  { id: 'definition', label: 'Definition der Klassifizierung', icon: List },
  { id: 'rebalancing', label: 'Rebalancing', icon: BarChart3 },
  { id: 'pie', label: 'Kreisdiagramm', icon: PieIcon },
  { id: 'donut', label: 'Donut-Diagramm', icon: Circle },
  { id: 'treemap', label: 'Baumkarte', icon: LayoutGrid },
  { id: 'stacked-pct', label: 'Flächendiagramm %', icon: AreaChart },
  { id: 'stacked-val', label: 'Flächendiagramm Wert', icon: AreaChart },
] as const;

/* ══════════════════════════════════════════════════════════════════════
   Tree node model — mirrors PP TaxonomyNode
   ══════════════════════════════════════════════════════════════════════ */
interface TreeNode {
  id: string;
  name: string;
  farbe: string;
  wert: number;
  gewichtung: number;        // 0–10000 (PP weight system, 10000 = 100%)
  istProzent: number;        // % of parent
  istProzentGesamt: number;  // % of total (Gesamtvermögen)
  kinder: TreeNode[];
  isLeaf: boolean;
  isClassification: boolean;
  isUnassigned: boolean;
  depth: number;
  wertpapierKey?: string;    // only for leaf assignments
  classificationId?: string; // only for classification nodes
  // rebalancing
  sollProzent: number;       // target allocation (0–100)
  delta: number;             // actual - target (EUR)
  deltaProzent: number;      // (actual/target - 1) * 100
}

type WpInfo = { bestand: number; marktwert?: number; investiert: number; name: string };

/* ══════════════════════════════════════════════════════════════════════
   Tree building — from PP TaxonomyModel + DefinitionViewer
   ══════════════════════════════════════════════════════════════════════ */
function calcNodeValue(node: Klassifizierung, wps: Record<string, WpInfo>): number {
  let total = 0;
  for (const z of node.zuweisungen) {
    const wp = wps[z.wertpapierKey];
    if (wp) total += (wp.bestand > 0 ? (wp.marktwert ?? wp.investiert) : 0) * (z.gewicht / 10000);
  }
  for (const child of node.kinder) total += calcNodeValue(child, wps);
  return total;
}

function buildTree(
  node: Klassifizierung, wps: Record<string, WpInfo>,
  gesamtValue: number, depth: number,
): TreeNode {
  const kinder: TreeNode[] = [];

  for (const child of node.kinder) {
    kinder.push(buildTree(child, wps, gesamtValue, depth + 1));
  }

  let ownValue = 0;
  const leafChildren: TreeNode[] = [];
  for (const z of node.zuweisungen) {
    const wp = wps[z.wertpapierKey];
    if (wp) {
      const wert = wp.bestand > 0 ? (wp.marktwert ?? wp.investiert) * (z.gewicht / 10000) : 0;
      ownValue += wert;
      leafChildren.push({
        id: `${node.id}-${z.wertpapierKey}`,
        name: wp.name || z.wertpapierKey,
        farbe: node.farbe || '#888888',
        wert,
        gewichtung: z.gewicht,
        istProzent: 0,
        istProzentGesamt: gesamtValue > 0 ? (wert / gesamtValue) * 100 : 0,
        kinder: [],
        isLeaf: true,
        isClassification: false,
        isUnassigned: false,
        depth: depth + 1,
        wertpapierKey: z.wertpapierKey,
        sollProzent: 0, delta: 0, deltaProzent: 0,
      });
    }
  }

  const childrenValue = kinder.reduce((s, k) => s + k.wert, 0);
  const totalValue = ownValue + childrenValue;

  for (const lc of leafChildren) lc.istProzent = totalValue > 0 ? (lc.wert / totalValue) * 100 : 0;
  for (const k of kinder) k.istProzent = totalValue > 0 ? (k.wert / totalValue) * 100 : 0;

  return {
    id: node.id,
    name: node.name,
    farbe: node.farbe || '#888888',
    wert: totalValue,
    gewichtung: 0,
    istProzent: 0,
    istProzentGesamt: gesamtValue > 0 ? (totalValue / gesamtValue) * 100 : 0,
    kinder: [...kinder, ...leafChildren],
    isLeaf: false,
    isClassification: true,
    isUnassigned: false,
    depth,
    classificationId: node.id,
    sollProzent: 0, delta: 0, deltaProzent: 0,
  };
}

function buildFullTree(tax: Taxonomie, wps: Record<string, WpInfo>): TreeNode {
  const assignedWeights = new Map<string, number>();
  function collectWeights(node: Klassifizierung) {
    for (const z of node.zuweisungen)
      assignedWeights.set(z.wertpapierKey, (assignedWeights.get(z.wertpapierKey) ?? 0) + z.gewicht);
    for (const child of node.kinder) collectWeights(child);
  }
  collectWeights(tax.wurzel);

  const unassignedChildren: TreeNode[] = [];
  for (const [key, wp] of Object.entries(wps)) {
    const assigned = assignedWeights.get(key) ?? 0;
    if (assigned >= 10000) continue;
    const fraction = (10000 - assigned) / 10000;
    const wert = (wp.marktwert ?? wp.investiert) * fraction;
    unassignedChildren.push({
      id: `$unassigned$-${key}`,
      name: wp.name || key,
      farbe: '#aaaaaa',
      wert,
      gewichtung: 10000 - assigned,
      istProzent: 0,
      istProzentGesamt: 0,
      kinder: [],
      isLeaf: true,
      isClassification: false,
      isUnassigned: true,
      depth: 2,
      wertpapierKey: key,
      sollProzent: 0, delta: 0, deltaProzent: 0,
    });
  }
  const unassignedValue = unassignedChildren.reduce((s, c) => s + c.wert, 0);
  const classifiedValue = calcNodeValue(tax.wurzel, wps);
  const gesamtValue = classifiedValue + unassignedValue;

  const root = buildTree(tax.wurzel, wps, gesamtValue, 0);

  if (unassignedChildren.length > 0) {
    for (const uc of unassignedChildren) {
      uc.istProzent = unassignedValue > 0 ? (uc.wert / unassignedValue) * 100 : 0;
      uc.istProzentGesamt = gesamtValue > 0 ? (uc.wert / gesamtValue) * 100 : 0;
    }
    unassignedChildren.sort((a, b) => a.name.localeCompare(b.name));
    root.kinder.push({
      id: '$unassigned$',
      name: 'Ohne Klassifizierung',
      farbe: '#aaaaaa',
      wert: unassignedValue,
      gewichtung: 0,
      istProzent: gesamtValue > 0 ? (unassignedValue / gesamtValue) * 100 : 0,
      istProzentGesamt: gesamtValue > 0 ? (unassignedValue / gesamtValue) * 100 : 0,
      kinder: unassignedChildren,
      isLeaf: false,
      isClassification: true,
      isUnassigned: true,
      depth: 1,
      sollProzent: 0, delta: 0, deltaProzent: 0,
    });
  }

  root.wert = gesamtValue;
  root.istProzent = 100;
  root.istProzentGesamt = 100;
  for (const k of root.kinder) {
    k.istProzent = gesamtValue > 0 ? (k.wert / gesamtValue) * 100 : 0;
    k.istProzentGesamt = gesamtValue > 0 ? (k.wert / gesamtValue) * 100 : 0;
  }
  return root;
}

/* ══════════════════════════════════════════════════════════════════════
   Deep-clone helpers for immutable taxonomy updates
   ══════════════════════════════════════════════════════════════════════ */
function cloneTaxonomie(tax: Taxonomie): Taxonomie {
  return { ...tax, wurzel: cloneKlassifizierung(tax.wurzel) };
}
function cloneKlassifizierung(k: Klassifizierung): Klassifizierung {
  return {
    ...k,
    kinder: k.kinder.map(cloneKlassifizierung),
    zuweisungen: k.zuweisungen.map(z => ({ ...z })),
  };
}
function findClassification(node: Klassifizierung, id: string): Klassifizierung | null {
  if (node.id === id) return node;
  for (const child of node.kinder) {
    const found = findClassification(child, id);
    if (found) return found;
  }
  return null;
}
function findParent(root: Klassifizierung, childId: string): Klassifizierung | null {
  for (const child of root.kinder) {
    if (child.id === childId) return root;
    const found = findParent(child, childId);
    if (found) return found;
  }
  return null;
}
function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10);
}
function randomColor(): string {
  const h = Math.floor(Math.random() * 360);
  return `hsl(${h}, 65%, 55%)`;
}

/* ══════════════════════════════════════════════════════════════════════
   Sort criteria — PP MenuTaxonomySortTreeBy
   ══════════════════════════════════════════════════════════════════════ */
type SortCriterion = 'type-name' | 'type-value' | 'name' | 'value';

function sortChildren(node: Klassifizierung, criterion: SortCriterion, wps: Record<string, WpInfo>) {
  const getValue = (k: Klassifizierung) => calcNodeValue(k, wps);
  node.kinder.sort((a, b) => {
    switch (criterion) {
      case 'type-name': return a.name.localeCompare(b.name);
      case 'type-value': return getValue(b) - getValue(a);
      case 'name': return a.name.localeCompare(b.name);
      case 'value': return getValue(b) - getValue(a);
    }
  });
}

/* ══════════════════════════════════════════════════════════════════════
   Context menu component
   ══════════════════════════════════════════════════════════════════════ */
interface CtxMenuProps {
  x: number; y: number;
  node: TreeNode;
  unassignedWps: string[];
  wps: Record<string, WpInfo>;
  onClose: () => void;
  onAddClassification: (parentId: string) => void;
  onDeleteClassification: (id: string) => void;
  onAssign: (classId: string, wpKey: string) => void;
  onRemoveAssignment: (classId: string, wpKey: string) => void;
  onEditColor: (classId: string) => void;
  onRandomColors: (classId: string) => void;
  onCascadeColor: (classId: string) => void;
  onSort: (classId: string, criterion: SortCriterion) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

function ContextMenu({
  x, y, node, unassignedWps, wps, onClose,
  onAddClassification, onDeleteClassification, onAssign, onRemoveAssignment,
  onEditColor, onRandomColors, onCascadeColor, onSort,
  onExpandAll, onCollapseAll,
}: CtxMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [subMenu, setSubMenu] = useState<'assign' | 'color' | 'sort' | null>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  if (node.isUnassigned && node.id === '$unassigned$') return null;

  const isClass = node.isClassification && !node.isUnassigned;
  const isAssignment = node.isLeaf && !node.isUnassigned;
  const classId = node.classificationId ?? '';

  const menuStyle: React.CSSProperties = {
    position: 'fixed', left: x, top: y, zIndex: 100,
    background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)',
    borderRadius: 3, padding: '4px 0', minWidth: 220, fontSize: 11,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  };
  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '4px 12px', cursor: 'pointer', color: 'var(--pp-text)',
    background: 'transparent', border: 'none', width: '100%', textAlign: 'left',
  };
  const sepStyle: React.CSSProperties = {
    height: 1, margin: '3px 0', background: 'var(--pp-border)',
  };
  const subStyle: React.CSSProperties = {
    ...menuStyle, position: 'absolute', left: '100%', top: 0, marginLeft: -2,
  };

  return (
    <div ref={ref} style={menuStyle}>
      {isClass && (
        <>
          {/* Neue Kategorie */}
          <button style={itemStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { onAddClassification(classId); onClose(); }}>
            Neue Kategorie hinzufügen
          </button>

          {/* Zuweisen submenu */}
          {unassignedWps.length > 0 && (
            <div style={{ position: 'relative' }}
              onMouseEnter={() => setSubMenu('assign')}
              onMouseLeave={() => setSubMenu(null)}>
              <button style={{ ...itemStyle, justifyContent: 'space-between' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                Zuweisen <ChevronRight size={12} />
              </button>
              {subMenu === 'assign' && (
                <div style={{ ...subStyle, maxHeight: 300, overflowY: 'auto' }}>
                  {unassignedWps.map(key => (
                    <button key={key} style={itemStyle}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => { onAssign(classId, key); onClose(); }}>
                      {wps[key]?.name || key}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={sepStyle} />

          {/* Farbe submenu */}
          <div style={{ position: 'relative' }}
            onMouseEnter={() => setSubMenu('color')}
            onMouseLeave={() => setSubMenu(null)}>
            <button style={{ ...itemStyle, justifyContent: 'space-between' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              Farbe <ChevronRight size={12} />
            </button>
            {subMenu === 'color' && (
              <div style={subStyle}>
                <button style={itemStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => { onEditColor(classId); onClose(); }}>
                  Editieren...
                </button>
                <button style={itemStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => { onRandomColors(classId); onClose(); }}>
                  Farbe zufällig Kategorien zuweisen
                </button>
                <button style={itemStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => { onCascadeColor(classId); onClose(); }}>
                  Farbe an Unterkategorien zuweisen
                </button>
              </div>
            )}
          </div>

          {/* Sortieren submenu */}
          <div style={{ position: 'relative' }}
            onMouseEnter={() => setSubMenu('sort')}
            onMouseLeave={() => setSubMenu(null)}>
            <button style={{ ...itemStyle, justifyContent: 'space-between' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              Sortieren <ChevronRight size={12} />
            </button>
            {subMenu === 'sort' && (
              <div style={subStyle}>
                {([['type-name', 'Typ, Name'], ['type-value', 'Typ, IST-Wert'], ['name', 'Name'], ['value', 'IST-Wert']] as [SortCriterion, string][]).map(([c, label]) => (
                  <button key={c} style={itemStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => { onSort(classId, c); onClose(); }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={sepStyle} />

          {/* Löschen */}
          {node.depth > 0 && (
            <button style={{ ...itemStyle, color: 'var(--pp-red-text)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onClick={() => { onDeleteClassification(classId); onClose(); }}>
              Löschen
            </button>
          )}

          <div style={sepStyle} />

          {/* Expand/Collapse */}
          <button style={itemStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { onExpandAll(); onClose(); }}>
            Alle aufklappen
          </button>
          <button style={itemStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { onCollapseAll(); onClose(); }}>
            Alle einklappen
          </button>
        </>
      )}

      {/* Assignment node: remove */}
      {isAssignment && node.wertpapierKey && (
        <button style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={() => {
            const parentClassId = node.id.split('-')[0];
            onRemoveAssignment(parentClassId, node.wertpapierKey!);
            onClose();
          }}>
          Entfernen
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Inline-edit cell (for name and weight)
   ══════════════════════════════════════════════════════════════════════ */
function InlineEdit({ value, onCommit, type, suffix }: {
  value: string; onCommit: (v: string) => void; type?: 'text' | 'number'; suffix?: string;
}) {
  const [val, setVal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const commit = () => onCommit(val);
  return (
    <span className="inline-flex items-center">
      <input
        ref={ref}
        type={type ?? 'text'}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCommit(value); }}
        className="text-[12px] px-1"
        style={{
          background: 'var(--pp-bg)', color: 'var(--pp-text)',
          border: '1px solid var(--pp-accent)', borderRadius: 2,
          outline: 'none', width: type === 'number' ? 60 : '100%',
        }}
      />
      {suffix && <span className="ml-0.5 text-[11px]" style={{ color: 'var(--pp-text-muted)' }}>{suffix}</span>}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Color picker dialog (simple)
   ══════════════════════════════════════════════════════════════════════ */
function ColorPicker({ color, onSelect, onClose }: { color: string; onSelect: (c: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} className="fixed z-[200] p-3 rounded shadow-lg"
      style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)' }}>
      <input ref={inputRef} type="color" defaultValue={color}
        onChange={e => onSelect(e.target.value)}
        style={{ width: 60, height: 40, border: 'none', cursor: 'pointer' }} />
      <div className="mt-2 flex gap-1">
        <button className="text-[11px] px-2 py-0.5 rounded"
          style={{ background: 'var(--pp-accent)', color: '#000' }}
          onClick={onClose}>OK</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Filter dropdown — PP FilterNonZero / FilterNotRetired
   ══════════════════════════════════════════════════════════════════════ */
const TAXONOMY_FILTERS = [
  { id: 'nonZero', label: 'Wert nicht Null' },
  { id: 'notRetired', label: 'Nur aktive Konten/Wertpapiere' },
];

/* ══════════════════════════════════════════════════════════════════════
   Recursive tree row — PP DefinitionViewer style
   ══════════════════════════════════════════════════════════════════════ */
function TreeRow({ node, expanded, onToggle, onContextMenu, editingId, onStartEdit, onCommitEdit, editingWeightId, onStartWeightEdit, onCommitWeightEdit }: {
  node: TreeNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCommitEdit: (id: string, value: string) => void;
  editingWeightId: string | null;
  onStartWeightEdit: (id: string) => void;
  onCommitWeightEdit: (id: string, value: string) => void;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.kinder.length > 0;
  const indent = node.depth * 20;
  const isEditing = editingId === node.id;
  const isEditingWeight = editingWeightId === node.id;

  return (
    <>
      <tr className="pp-row"
        onContextMenu={e => onContextMenu(e, node)}
        onDoubleClick={() => {
          if (node.isClassification && !node.isUnassigned) onStartEdit(node.id);
        }}>
        {/* Ebenen */}
        <td style={{ paddingLeft: indent + 4 }}>
          <span className="flex items-center gap-1">
            {hasChildren ? (
              <button type="button" className="text-[9px] w-[16px] h-[16px] flex items-center justify-center flex-shrink-0"
                style={{ color: 'var(--pp-text-muted)' }}
                onClick={() => onToggle(node.id)}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : <span className="w-[16px] flex-shrink-0" />}
            <ColorMarker color={node.farbe} />
            {isEditing ? (
              <InlineEdit value={node.name} onCommit={v => onCommitEdit(node.id, v)} />
            ) : (
              <span className="truncate">{node.name}</span>
            )}
          </span>
        </td>
        {/* Gewichtung */}
        <td className="right mono">
          {node.isLeaf && !node.isUnassigned ? (
            isEditingWeight ? (
              <InlineEdit value={(node.gewichtung / 100).toFixed(2)} type="number" suffix="%"
                onCommit={v => onCommitWeightEdit(node.id, v)} />
            ) : (
              <span onDoubleClick={e => { e.stopPropagation(); onStartWeightEdit(node.id); }}
                className="cursor-pointer" title="Doppelklick zum Bearbeiten">
                {(node.gewichtung / 100).toFixed(2)}
              </span>
            )
          ) : ''}
        </td>
        {/* Farbe */}
        <td>
          {node.isClassification && (
            <span className="inline-block w-full h-[14px] rounded-[1px]" style={{ backgroundColor: node.farbe }} />
          )}
        </td>
        {/* IST-% */}
        <td className="right mono">{node.istProzent.toFixed(2)}</td>
        {/* IST-% am GV */}
        <td className="right mono">{node.istProzentGesamt.toFixed(2)}</td>
        {/* IST-Wert */}
        <td className="right mono">{euro(node.wert)}</td>
      </tr>
      {isOpen && node.kinder.map(child => (
        <TreeRow key={child.id} node={child} expanded={expanded} onToggle={onToggle}
          onContextMenu={onContextMenu}
          editingId={editingId} onStartEdit={onStartEdit} onCommitEdit={onCommitEdit}
          editingWeightId={editingWeightId} onStartWeightEdit={onStartWeightEdit} onCommitWeightEdit={onCommitWeightEdit} />
      ))}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Rebalancing tree row
   ══════════════════════════════════════════════════════════════════════ */
function RebalancingRow({ node, expanded, onToggle }: {
  node: TreeNode; expanded: Set<string>; onToggle: (id: string) => void;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.kinder.length > 0;
  const indent = node.depth * 20;

  return (
    <>
      <tr className="pp-row">
        <td style={{ paddingLeft: indent + 4 }}>
          <span className="flex items-center gap-1">
            {hasChildren ? (
              <button type="button" className="text-[9px] w-[16px] h-[16px] flex items-center justify-center flex-shrink-0"
                style={{ color: 'var(--pp-text-muted)' }}
                onClick={() => onToggle(node.id)}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : <span className="w-[16px] flex-shrink-0" />}
            <ColorMarker color={node.farbe} />
            <span className="truncate">{node.name}</span>
          </span>
        </td>
        <td className="right mono">{node.isLeaf ? (node.gewichtung / 100).toFixed(2) : ''}</td>
        <td className="right mono">{node.istProzent.toFixed(2)}</td>
        <td className="right mono">{node.istProzentGesamt.toFixed(2)}</td>
        <td className="right mono">{euro(node.wert)}</td>
        <td className="right mono" style={{ color: 'var(--pp-text-muted)' }}>—</td>
        <td className="right mono" style={{ color: 'var(--pp-text-muted)' }}>—</td>
      </tr>
      {isOpen && node.kinder.map(child => (
        <RebalancingRow key={child.id} node={child} expanded={expanded} onToggle={onToggle} />
      ))}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   CSV export
   ══════════════════════════════════════════════════════════════════════ */
function exportCSV(tree: TreeNode) {
  const rows: string[] = ['Ebenen;Gewichtung;Farbe;IST-%;IST-% am GV;IST-Wert'];
  function walk(node: TreeNode, prefix: string) {
    rows.push([
      prefix + node.name,
      node.isLeaf ? (node.gewichtung / 100).toFixed(2) : '',
      node.farbe,
      node.istProzent.toFixed(2),
      node.istProzentGesamt.toFixed(2),
      node.wert.toFixed(2),
    ].join(';'));
    for (const k of node.kinder) walk(k, prefix + '  ');
  }
  walk(tree, '');
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `klassifizierung_${tree.name}.csv`;
  a.click();
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */
export default function KlassifizierungView() {
  const { state, updateTaxonomien } = usePortfolio();
  const definitionTableRef = useResizableColumns<HTMLTableElement>('klassifizierung-definition');
  const rebalancingTableRef = useResizableColumns<HTMLTableElement>('klassifizierung-rebalancing');
  const [viewMode, setViewMode] = useState<string>('definition');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
  const [colorPicker, setColorPicker] = useState<{ classId: string; color: string; x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWeightId, setEditingWeightId] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const h = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [filterOpen]);

  const selectedTax = useMemo<Taxonomie | null>(() => {
    return state.taxonomien.find(t =>
      t.name === 'Wertpapierart' || t.id === 'security-type' ||
      t.name === 'Security Type' || t.name.toLowerCase().includes('wertpapierart')
    ) ?? state.taxonomien[0] ?? null;
  }, [state.taxonomien]);

  // PP: TaxonomyModel.addUnassigned() inkludiert ALLE Securities + ALLE Accounts
  const allVehicles = useMemo(() => {
    const vehicles: Record<string, WpInfo> = { ...state.wertpapiere };
    // PP: Taxonomy assignments referenzieren Accounts via Name (unser XML-Parser: isin || name)
    for (const [key, konto] of Object.entries(state.konten)) {
      if (!vehicles[key]) {
        vehicles[key] = {
          bestand: 1,
          marktwert: konto.saldo,
          investiert: konto.saldo,
          name: konto.name,
        };
      }
    }
    return vehicles;
  }, [state.wertpapiere, state.konten]);

  const tree = useMemo(() => {
    if (!selectedTax) return null;
    return buildFullTree(selectedTax, allVehicles);
  }, [selectedTax, allVehicles]);

  const unassignedWpKeys = useMemo(() => {
    if (!tree) return [];
    const unassigned = tree.kinder.find(k => k.id === '$unassigned$');
    if (!unassigned) return [];
    return unassigned.kinder.map(k => k.wertpapierKey!).filter(Boolean);
  }, [tree]);

  const chartData = useMemo(() => {
    if (!tree) return [];
    return tree.kinder
      .filter(k => k.isClassification && k.wert > 0)
      .map(k => ({ name: k.name, value: k.wert, color: k.farbe }))
      .sort((a, b) => b.value - a.value);
  }, [tree]);

  const treemapData = useMemo(() => {
    if (!tree) return [];
    return tree.kinder
      .filter(k => k.wert > 0 && k.isClassification)
      .map(k => ({ name: k.name, size: k.wert, color: k.farbe }));
  }, [tree]);

  /* ── Mutation helpers ── */
  function mutateTaxonomy(fn: (tax: Taxonomie) => void) {
    if (!selectedTax) return;
    const updated = state.taxonomien.map(t => {
      if (t.id !== selectedTax.id) return t;
      const clone = cloneTaxonomie(t);
      fn(clone);
      return clone;
    });
    updateTaxonomien(updated);
  }

  const onToggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const onExpandAll = useCallback(() => {
    if (!tree) return;
    const all = new Set<string>();
    function walk(n: TreeNode) { all.add(n.id); n.kinder.forEach(walk); }
    walk(tree);
    setExpanded(all);
  }, [tree]);

  const onCollapseAll = useCallback(() => setExpanded(new Set()), []);

  const onContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const onAddClassification = useCallback((parentId: string) => {
    const newId = generateId();
    mutateTaxonomy(tax => {
      const parent = findClassification(tax.wurzel, parentId);
      if (!parent) return;
      parent.kinder.push({
        id: newId, name: 'Neue Kategorie', farbe: randomColor(),
        kinder: [], zuweisungen: [],
      });
    });
    setExpanded(prev => new Set([...prev, parentId]));
    setTimeout(() => setEditingId(newId), 50);
  }, [selectedTax, state.taxonomien]);

  const onDeleteClassification = useCallback((id: string) => {
    mutateTaxonomy(tax => {
      const parent = findParent(tax.wurzel, id);
      if (!parent) return;
      parent.kinder = parent.kinder.filter(k => k.id !== id);
    });
  }, [selectedTax, state.taxonomien]);

  const onAssign = useCallback((classId: string, wpKey: string) => {
    mutateTaxonomy(tax => {
      const cls = findClassification(tax.wurzel, classId);
      if (!cls) return;
      cls.zuweisungen.push({ wertpapierKey: wpKey, gewicht: 10000 });
    });
  }, [selectedTax, state.taxonomien]);

  const onRemoveAssignment = useCallback((classId: string, wpKey: string) => {
    mutateTaxonomy(tax => {
      function removeFromNode(node: Klassifizierung): boolean {
        const idx = node.zuweisungen.findIndex(z => z.wertpapierKey === wpKey);
        if (idx >= 0) { node.zuweisungen.splice(idx, 1); return true; }
        for (const child of node.kinder) { if (removeFromNode(child)) return true; }
        return false;
      }
      removeFromNode(tax.wurzel);
    });
  }, [selectedTax, state.taxonomien]);

  const onEditColor = useCallback((classId: string) => {
    if (!selectedTax) return;
    const cls = findClassification(selectedTax.wurzel, classId);
    setColorPicker({ classId, color: cls?.farbe || '#888888', x: 200, y: 200 });
  }, [selectedTax]);

  const onColorSelect = useCallback((color: string) => {
    if (!colorPicker) return;
    mutateTaxonomy(tax => {
      const cls = findClassification(tax.wurzel, colorPicker.classId);
      if (cls) cls.farbe = color;
    });
    setColorPicker(prev => prev ? { ...prev, color } : null);
  }, [colorPicker, selectedTax, state.taxonomien]);

  const onRandomColors = useCallback((classId: string) => {
    mutateTaxonomy(tax => {
      const cls = findClassification(tax.wurzel, classId);
      if (!cls) return;
      cls.kinder.forEach((child, i) => {
        const h = (i / cls.kinder.length) * 360;
        child.farbe = `hsl(${Math.round(h)}, 70%, 55%)`;
      });
    });
  }, [selectedTax, state.taxonomien]);

  const onCascadeColor = useCallback((classId: string) => {
    mutateTaxonomy(tax => {
      const cls = findClassification(tax.wurzel, classId);
      if (!cls) return;
      function cascade(node: Klassifizierung, color: string) {
        node.farbe = color;
        node.kinder.forEach(child => cascade(child, color));
      }
      cls.kinder.forEach(child => cascade(child, cls.farbe));
    });
  }, [selectedTax, state.taxonomien]);

  const onSort = useCallback((classId: string, criterion: SortCriterion) => {
    mutateTaxonomy(tax => {
      const cls = findClassification(tax.wurzel, classId);
      if (!cls) return;
      sortChildren(cls, criterion, state.wertpapiere);
    });
  }, [selectedTax, state.taxonomien, state.wertpapiere]);

  const onCommitEdit = useCallback((id: string, value: string) => {
    setEditingId(null);
    if (!value.trim()) return;
    mutateTaxonomy(tax => {
      const cls = findClassification(tax.wurzel, id);
      if (cls) cls.name = value.trim();
    });
  }, [selectedTax, state.taxonomien]);

  const onCommitWeightEdit = useCallback((id: string, value: string) => {
    setEditingWeightId(null);
    const pct = parseFloat(value.replace(',', '.'));
    if (isNaN(pct)) return;
    const weight = Math.max(0, Math.min(10000, Math.round(pct * 100)));

    mutateTaxonomy(tax => {
      function findAndUpdate(node: Klassifizierung): boolean {
        for (const z of node.zuweisungen) {
          const leafId = `${node.id}-${z.wertpapierKey}`;
          if (leafId === id) { z.gewicht = weight; return true; }
        }
        for (const child of node.kinder) { if (findAndUpdate(child)) return true; }
        return false;
      }
      findAndUpdate(tax.wurzel);
    });
  }, [selectedTax, state.taxonomien]);

  const onFilterToggle = useCallback((id: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const total = tree?.wert ?? 0;
  const isFiltered = activeFilters.size > 0;

  if (!selectedTax) {
    return (
      <div className="flex flex-col h-full">
        <div className="pp-toolbar">
          <span className="pp-toolbar-title">Klassifizierung</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Keine Taxonomie importiert.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── PP-style toolbar ── */}
      <div className="pp-toolbar">
        <span className="pp-toolbar-title">{selectedTax.name}</span>
        <div className="flex items-center ml-auto gap-[1px]">
          {VIEW_MODES.map(vm => {
            const Icon = vm.icon;
            const isActive = viewMode === vm.id;
            return (
              <button key={vm.id} type="button" className="pp-toolbar-btn" title={vm.label}
                style={{ color: isActive ? 'var(--pp-accent)' : undefined, background: isActive ? 'var(--pp-selected-bg)' : undefined }}
                onClick={() => setViewMode(vm.id)}>
                <Icon size={14} />
              </button>
            );
          })}

          <div className="w-[1px] h-[16px] mx-1" style={{ background: 'var(--pp-border)' }} />

          {/* Search */}
          <div className="pp-toolbar-search">
            <Search size={12} style={{ color: 'var(--pp-text-muted)' }} />
            <input type="text" placeholder="Suchen" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Filter */}
          <div className="relative" ref={filterRef}>
            <button type="button" className="pp-toolbar-btn"
              style={{ color: isFiltered ? 'var(--pp-accent)' : undefined }}
              onClick={() => setFilterOpen(!filterOpen)}>
              <Filter size={14} />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-[2px] z-50 py-1 min-w-[220px] shadow-lg"
                style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', borderRadius: 3 }}>
                {TAXONOMY_FILTERS.map(opt => (
                  <button key={opt.id} type="button" className="w-full text-left px-3 py-[3px] text-[11px] flex items-center gap-2"
                    style={{ color: 'var(--pp-text)', background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => onFilterToggle(opt.id)}>
                    <span className="inline-flex items-center justify-center w-[13px] h-[13px] rounded-[2px] flex-shrink-0"
                      style={{ border: `1px solid ${activeFilters.has(opt.id) ? 'var(--pp-accent)' : 'var(--pp-text-muted)'}`, background: activeFilters.has(opt.id) ? 'var(--pp-accent)' : 'transparent' }}>
                      {activeFilters.has(opt.id) && <span className="text-[9px] leading-none" style={{ color: 'var(--pp-bg)' }}>✓</span>}
                    </span>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export */}
          <button type="button" className="pp-toolbar-btn" title="CSV Export"
            onClick={() => tree && exportCSV(tree)}>
            <Download size={14} />
          </button>

          {/* Config (placeholder) */}
          <button type="button" className="pp-toolbar-btn" title="Spalten ein/ausblenden">
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* ── Definition view (tree table) ── */}
      {viewMode === 'definition' && tree && (
        <div className="flex-1 overflow-auto">
          <table className="pp-table" ref={definitionTableRef}>
            <thead>
              <tr>
                <th style={{ minWidth: 300, width: 400 }}>Ebenen</th>
                <th className="right" style={{ width: 80 }}>Gewichtung</th>
                <th style={{ width: 60 }}>Farbe</th>
                <th className="right" style={{ width: 70 }}>IST-%</th>
                <th className="right" style={{ width: 80 }}>IST-% am GV</th>
                <th className="right" style={{ width: 110 }}>IST-Wert</th>
              </tr>
            </thead>
            <tbody>
              <tr className="pp-row" style={{ fontWeight: 600 }}
                onContextMenu={e => onContextMenu(e, tree)}>
                <td style={{ paddingLeft: 4 }}>
                  <span className="flex items-center gap-1">
                    <button type="button" className="text-[9px] w-[16px] h-[16px] flex items-center justify-center flex-shrink-0"
                      style={{ color: 'var(--pp-text-muted)' }}
                      onClick={() => onToggle(tree.id)}>
                      {expanded.has(tree.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    <ColorMarker color={tree.farbe || '#888'} />
                    {tree.name}
                  </span>
                </td>
                <td className="right mono" />
                <td />
                <td className="right mono">100,00</td>
                <td className="right mono">100,00</td>
                <td className="right mono">{euro(total)}</td>
              </tr>
              {expanded.has(tree.id) && tree.kinder.map(child => (
                <TreeRow key={child.id} node={child} expanded={expanded} onToggle={onToggle}
                  onContextMenu={onContextMenu}
                  editingId={editingId} onStartEdit={setEditingId} onCommitEdit={onCommitEdit}
                  editingWeightId={editingWeightId} onStartWeightEdit={setEditingWeightId} onCommitWeightEdit={onCommitWeightEdit} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Rebalancing view ── */}
      {viewMode === 'rebalancing' && tree && (
        <div className="flex-1 overflow-auto">
          <table className="pp-table" ref={rebalancingTableRef}>
            <thead>
              <tr>
                <th style={{ minWidth: 300, width: 400 }}>Ebenen</th>
                <th className="right" style={{ width: 80 }}>Gewichtung</th>
                <th className="right" style={{ width: 70 }}>IST-%</th>
                <th className="right" style={{ width: 80 }}>IST-% am GV</th>
                <th className="right" style={{ width: 110 }}>IST-Wert</th>
                <th className="right" style={{ width: 90 }}>Aufteilung</th>
                <th className="right" style={{ width: 100 }}>Delta</th>
              </tr>
            </thead>
            <tbody>
              <tr className="pp-row" style={{ fontWeight: 600 }}>
                <td style={{ paddingLeft: 4 }}>
                  <span className="flex items-center gap-1">
                    <button type="button" className="text-[9px] w-[16px] h-[16px] flex items-center justify-center flex-shrink-0"
                      style={{ color: 'var(--pp-text-muted)' }} onClick={() => onToggle(tree.id)}>
                      {expanded.has(tree.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    <ColorMarker color={tree.farbe || '#888'} />
                    {tree.name}
                  </span>
                </td>
                <td className="right mono" />
                <td className="right mono">100,00</td>
                <td className="right mono">100,00</td>
                <td className="right mono">{euro(total)}</td>
                <td className="right mono" />
                <td className="right mono" />
              </tr>
              {expanded.has(tree.id) && tree.kinder.map(child => (
                <RebalancingRow key={child.id} node={child} expanded={expanded} onToggle={onToggle} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pie chart ── */}
      {viewMode === 'pie' && (
        <div className="flex-1 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" stroke="var(--pp-bg)" strokeWidth={2}>
                {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                formatter={(v, name) => [euro(v as number), name as string]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Donut chart ── */}
      {viewMode === 'donut' && (
        <div className="flex-1 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" innerRadius="45%" stroke="var(--pp-bg)" strokeWidth={2}>
                {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                formatter={(v, name) => [euro(v as number), name as string]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Treemap ── */}
      {viewMode === 'treemap' && (
        <div className="flex-1 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsTreemap data={treemapData} dataKey="size" nameKey="name" stroke="var(--pp-bg)" strokeWidth={2}
              content={({ x, y, width, height, name, color }: any) => {
                if (width < 4 || height < 4) return null;
                return (
                  <g>
                    <rect x={x} y={y} width={width} height={height} fill={color} stroke="var(--pp-bg)" strokeWidth={2} rx={2} />
                    {width > 50 && height > 20 && (
                      <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={11} fontWeight={600}>{name}</text>
                    )}
                    {width > 60 && height > 35 && (
                      <text x={x + width / 2} y={y + height / 2 + 14} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.7)" fontSize={9}>
                        {euro(treemapData.find(d => d.name === name)?.size ?? 0)}
                      </text>
                    )}
                  </g>
                );
              }} />
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Stacked chart placeholder ── */}
      {(viewMode === 'stacked-pct' || viewMode === 'stacked-val') && (
        <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
          Flächendiagramm — benötigt historische Daten. Wird verfügbar sobald Snapshots vorhanden sind.
        </div>
      )}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} node={ctxMenu.node}
          unassignedWps={unassignedWpKeys} wps={state.wertpapiere}
          onClose={() => setCtxMenu(null)}
          onAddClassification={onAddClassification}
          onDeleteClassification={onDeleteClassification}
          onAssign={onAssign}
          onRemoveAssignment={onRemoveAssignment}
          onEditColor={onEditColor}
          onRandomColors={onRandomColors}
          onCascadeColor={onCascadeColor}
          onSort={onSort}
          onExpandAll={onExpandAll}
          onCollapseAll={onCollapseAll}
        />
      )}

      {/* ── Color picker ── */}
      {colorPicker && (
        <ColorPicker
          color={colorPicker.color}
          onSelect={onColorSelect}
          onClose={() => setColorPicker(null)}
        />
      )}
    </div>
  );
}
