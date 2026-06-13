import { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react';
import { CheckBox } from './HierarchyMenu';

/* PP: Column.Options<E> — Defines parameterized options for a column (e.g. ReportingPeriod, SMA periods) */
export interface PPColumnOptions {
  items: { id: string; label: string }[];
  canCreateNew: boolean;
  onCreateNew?: () => void;
}

export interface PPColumn<T> {
  id: string;
  label: string;
  width: number;
  minWidth?: number;
  align?: 'left' | 'right';
  group?: string;
  options?: PPColumnOptions;
  render: (row: T, index: number) => React.ReactNode;
  sortFn?: (a: T, b: T) => number;
  editable?: boolean;
  editType?: 'text' | 'checkbox' | 'select';
  // für editType 'select': Auswahlliste (value/label)
  selectOptions?: { value: string; label: string }[];
  getValue?: (row: T) => string | boolean;
  onEdit?: (row: T, newValue: string | boolean) => void;
}

/* Memoisierte Tabellenzeile: rendert nur neu, wenn sich row, Spalten-Layout,
   Selektion oder Editier-Status DIESER Zeile ändern — nicht bei jedem Parent-
   Render (z.B. Toolbar-Dropdown öffnen). Kritisch für große Umsatz-Tabellen. */
const TableRow = memo(function TableRow<T>({
  row, idx, rowKeyValue, isSelected, orderedCols, editingColId, editValue,
  onSelectRow, onRowContextMenu, onStartEdit, onEditChange, onCommitEdit, onCancelEdit, onCheckboxEdit,
}: {
  row: T; idx: number; rowKeyValue: string; isSelected: boolean;
  orderedCols: PPColumn<T>[];
  editingColId: string | null;
  editValue: string;
  onSelectRow: (key: string, isSelected: boolean) => void;
  onRowContextMenu?: (e: React.MouseEvent, row: T) => void;
  onStartEdit: (rowKey: string, colId: string, initial: string) => void;
  onEditChange: (v: string) => void;
  onCommitEdit: (col: PPColumn<T>, row: T, value: string) => void;
  onCancelEdit: () => void;
  onCheckboxEdit: (col: PPColumn<T>, row: T) => void;
}) {
  return (
    <tr
      className={`pp-row${isSelected ? ' selected' : ''}`}
      onClick={() => onSelectRow(rowKeyValue, isSelected)}
      onContextMenu={onRowContextMenu ? (e) => { e.preventDefault(); onSelectRow(rowKeyValue, false); onRowContextMenu(e, row); } : undefined}
    >
      {orderedCols.map(col => {
        const isEditing = editingColId === col.id;
        const canEdit = col.editable && col.onEdit;

        if (isEditing && col.editType === 'text') {
          return (
            <td key={col.id} className={`${col.align === 'right' ? 'right ' : ''}mono`}>
              <input
                type="text" autoFocus value={editValue}
                onChange={e => onEditChange(e.target.value)}
                onBlur={() => onCommitEdit(col, row, editValue)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onCommitEdit(col, row, editValue);
                  if (e.key === 'Escape') onCancelEdit();
                }}
                className="w-full bg-transparent border-none outline-none"
                style={{ color: 'var(--pp-text)', fontSize: 11, padding: 0, margin: 0, boxShadow: '0 0 0 1px var(--pp-accent)' }}
              />
            </td>
          );
        }

        if (isEditing && col.editType === 'select') {
          return (
            <td key={col.id} className={col.align === 'right' ? 'right' : undefined}>
              <select autoFocus value={editValue}
                onChange={e => onCommitEdit(col, row, e.target.value)}
                onBlur={() => onCancelEdit()}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => { if (e.key === 'Escape') onCancelEdit(); }}
                style={{ width: '100%', fontSize: 11, background: 'var(--pp-content-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-accent)', borderRadius: 2 }}>
                {(col.selectOptions ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </td>
          );
        }

        return (
          <td
            key={col.id}
            className={`${col.align === 'right' ? 'right ' : ''}mono`}
            onDoubleClick={canEdit && col.editType !== 'checkbox' ? () => {
              const v = col.getValue?.(row);
              onStartEdit(rowKeyValue, col.id, typeof v === 'string' ? v : '');
            } : undefined}
            onClick={canEdit && col.editType === 'checkbox' ? (e) => { e.stopPropagation(); onCheckboxEdit(col, row); } : undefined}
            style={{ cursor: canEdit ? 'pointer' : undefined }}
          >
            {col.render(row, idx)}
          </td>
        );
      })}
    </tr>
  );
}) as <T>(props: {
  row: T; idx: number; rowKeyValue: string; isSelected: boolean;
  orderedCols: PPColumn<T>[]; editingColId: string | null; editValue: string;
  onSelectRow: (key: string, isSelected: boolean) => void;
  onRowContextMenu?: (e: React.MouseEvent, row: T) => void;
  onStartEdit: (rowKey: string, colId: string, initial: string) => void;
  onEditChange: (v: string) => void;
  onCommitEdit: (col: PPColumn<T>, row: T, value: string) => void;
  onCancelEdit: () => void;
  onCheckboxEdit: (col: PPColumn<T>, row: T) => void;
}) => React.ReactElement;

interface PPTableProps<T> {
  columns: PPColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  summaryRow?: (columns: PPColumn<T>[]) => React.ReactNode;
  groupRow?: (columns: PPColumn<T>[]) => React.ReactNode;
  storageKey?: string;
  hiddenByDefault?: Set<string>;
  onRowContextMenu?: (e: React.MouseEvent, row: T) => void;
  columnMenuPos?: { x: number; y: number } | null;
  onColumnMenuClose?: () => void;
  onResetColumns?: () => void;
  // Zusätzliche Menüeinträge direkt unter den Spalten-Gruppen (Zusatzfeature
  // Farb-Anpassung). onClose schließt das gesamte Spaltenmenü.
  menuExtra?: (onClose: () => void) => React.ReactNode;
}

interface ColumnState {
  id: string;
  width: number;
}

function loadColumnState(storageKey: string, defaults: ColumnState[]): ColumnState[] {
  try {
    const raw = localStorage.getItem(`pp-cols-${storageKey}`);
    if (!raw) return defaults;
    const saved: ColumnState[] = JSON.parse(raw);
    const savedMap = new Map(saved.map(c => [c.id, c]));
    return defaults.map(d => {
      const s = savedMap.get(d.id);
      return s ? { ...d, width: s.width } : d;
    });
  } catch { return defaults; }
}

function saveColumnState(storageKey: string, cols: ColumnState[]) {
  try {
    localStorage.setItem(`pp-cols-${storageKey}`, JSON.stringify(cols));
  } catch { /* */ }
}

function loadColumnOrder(storageKey: string, ids: string[]): string[] {
  try {
    const raw = localStorage.getItem(`pp-col-order-${storageKey}`);
    if (!raw) return ids;
    const saved: string[] = JSON.parse(raw);
    const set = new Set(ids);
    const ordered = saved.filter(id => set.has(id));
    const missing = ids.filter(id => !ordered.includes(id));
    return [...ordered, ...missing];
  } catch { return ids; }
}

function saveColumnOrder(storageKey: string, order: string[]) {
  try {
    localStorage.setItem(`pp-col-order-${storageKey}`, JSON.stringify(order));
  } catch { /* */ }
}

function loadHiddenColumns(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(`pp-col-hidden-${storageKey}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}

function saveHiddenColumns(storageKey: string, hidden: Set<string>) {
  try {
    localStorage.setItem(`pp-col-hidden-${storageKey}`, JSON.stringify([...hidden]));
  } catch { /* */ }
}

/* PP: ShowHideColumnHelper.menuAboutToShow — grouped column menu with submenus */
function ColumnMenu<T>({ x, y, columns, hiddenCols, toggleColumn, onReset, onClose, menuExtra }: {
  x: number; y: number;
  columns: PPColumn<T>[];
  hiddenCols: Set<string>;
  toggleColumn: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
  menuExtra?: (onClose: () => void) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openOptionSub, setOpenOptionSub] = useState<string | null>(null);
  const [subSide, setSubSide] = useState<'right' | 'left'>('right');

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setSubSide(rect.right + 250 > window.innerWidth ? 'left' : 'right');
  }, [x]);

  const labeled = columns.filter(c => c.label);

  const allOptionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of columns) {
      if (c.options) {
        for (const opt of c.options.items) ids.add(opt.id);
      }
    }
    return ids;
  }, [columns]);

  const ungrouped = labeled.filter(c => !c.group && !allOptionIds.has(c.id));

  const groupOrder: string[] = [];
  const groups: Record<string, PPColumn<T>[]> = {};
  for (const col of labeled) {
    if (!col.group) continue;
    if (!groups[col.group]) {
      groups[col.group] = [];
      groupOrder.push(col.group);
    }
    groups[col.group].push(col);
  }

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '3px 12px', cursor: 'pointer',
    color: 'var(--pp-text)', background: 'transparent',
    border: 'none', width: '100%', textAlign: 'left', fontSize: 11,
  };

  const checkItem = (col: PPColumn<T>) => (
    <button
      key={col.id}
      className="flex items-center gap-2 px-3 py-[2px] cursor-pointer"
      style={{ color: 'var(--pp-text)', fontSize: 11, background: 'transparent', border: 'none', width: '100%', textAlign: 'left' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={() => toggleColumn(col.id)}
    >
      <CheckBox checked={!hiddenCols.has(col.id)} />
      {col.label}
    </button>
  );

  const optionCheckItem = (optId: string, label: string) => (
    <button
      key={optId}
      className="flex items-center gap-2 px-3 py-[2px] cursor-pointer"
      style={{ color: 'var(--pp-text)', fontSize: 11, background: 'transparent', border: 'none', width: '100%', textAlign: 'left' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={() => toggleColumn(optId)}
    >
      <CheckBox checked={!hiddenCols.has(optId)} />
      {label}
    </button>
  );

  const subMenuStyle: React.CSSProperties = {
    ...(subSide === 'right' ? { left: '100%' } : { right: '100%' }),
    top: 0,
    background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)',
    minWidth: 220, whiteSpace: 'nowrap',
  };

  const groupHasOptions = (cols: PPColumn<T>[]) => cols.some(c => c.options);

  const addAllGroup = (groupName: string) => {
    const cols = groups[groupName];
    for (const col of cols) {
      if (col.options) {
        for (const opt of col.options.items) {
          if (hiddenCols.has(opt.id)) toggleColumn(opt.id);
        }
      } else {
        if (hiddenCols.has(col.id)) toggleColumn(col.id);
      }
    }
  };

  const removeAllGroup = (groupName: string) => {
    const cols = groups[groupName];
    for (const col of cols) {
      if (col.options) {
        for (const opt of col.options.items) {
          if (!hiddenCols.has(opt.id)) toggleColumn(opt.id);
        }
      } else {
        if (!hiddenCols.has(col.id)) toggleColumn(col.id);
      }
    }
  };

  const clampedX = Math.min(x, window.innerWidth - 260);
  const clampedY = Math.min(y, window.innerHeight - 400);

  const renderGroupSubmenu = (groupName: string, cols: PPColumn<T>[]) => {
    const hasOpts = groupHasOptions(cols);

    if (hasOpts) {
      const optionIds = new Set<string>();
      for (const c of cols) {
        if (c.options) {
          for (const opt of c.options.items) optionIds.add(opt.id);
        }
      }
      const filtered = cols.filter(c => !optionIds.has(c.id));

      return (
        <>
          {filtered.map(col => {
            if (!col.options) {
              return checkItem(col);
            }
            return (
              <div key={col.id} className="relative"
                onMouseEnter={() => setOpenOptionSub(col.id)}
                onMouseLeave={() => setOpenOptionSub(null)}>
                <div className="flex items-center justify-between px-3 py-[2px] cursor-pointer"
                  style={{ color: 'var(--pp-text)', fontSize: 11,
                    background: openOptionSub === col.id ? 'var(--pp-selected-bg)' : 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
                  onMouseLeave={e => { if (openOptionSub !== col.id) e.currentTarget.style.background = 'transparent'; }}>
                  <span>{col.label}</span>
                  <span style={{ fontSize: 8, marginLeft: 12, color: 'var(--pp-text-muted)' }}>▶</span>
                </div>
                {openOptionSub === col.id && (
                  <div className="absolute z-[70] py-1 rounded shadow-lg text-[11px]"
                    style={subMenuStyle}>
                    {col.options.items.map(opt => optionCheckItem(opt.id, opt.label))}
                    {col.options.canCreateNew && (
                      <>
                        <div style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />
                        <button
                          style={itemStyle}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          onClick={() => col.options?.onCreateNew?.()}>
                          Neu...
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {/* PP: addMenuAddGroup — Alle hinzufügen / Alle entfernen */}
          <div style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />
          <button style={itemStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => addAllGroup(groupName)}>
            Alle hinzufügen
          </button>
          <button style={itemStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => removeAllGroup(groupName)}>
            Alle entfernen
          </button>
        </>
      );
    }

    return (
      <>
        {cols.map(col => checkItem(col))}
        {/* PP: addMenuAddGroup */}
        <div style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />
        <button style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={() => addAllGroup(groupName)}>
          Alle hinzufügen
        </button>
        <button style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={() => removeAllGroup(groupName)}>
          Alle entfernen
        </button>
      </>
    );
  };

  return (
    <div ref={ref} className="fixed z-50 rounded shadow-lg text-[11px]"
      style={{
        left: clampedX, top: clampedY,
        background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)',
        minWidth: 240,
      }}
      onClick={e => e.stopPropagation()}>

      <div style={{ maxHeight: 500, overflowY: 'auto', padding: '4px 0' }}>
        {/* PP: ungrouped columns — simple ones as checkmarks, option-based as submenus */}
        {ungrouped.map(col => {
          if (!col.options) return checkItem(col);
          return null;
        })}
      </div>

      {/* PP: option-based columns (hasOptions) — direct submenu triggers on main menu level */}
      {ungrouped.filter(c => c.options).map(col => (
        <div key={col.id} className="relative"
          onMouseEnter={() => { setOpenGroup(col.id); setOpenOptionSub(null); }}
          onMouseLeave={() => { setOpenGroup(null); }}>
          <div className="flex items-center justify-between px-3 py-[2px] cursor-pointer"
            style={{ color: 'var(--pp-text)', fontSize: 11,
              background: openGroup === col.id ? 'var(--pp-selected-bg)' : 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
            onMouseLeave={e => { if (openGroup !== col.id) e.currentTarget.style.background = 'transparent'; }}>
            <span>{col.label}</span>
            <span style={{ fontSize: 8, marginLeft: 12, color: 'var(--pp-text-muted)' }}>▶</span>
          </div>
          {openGroup === col.id && (
            <div className="absolute z-[60] py-1 rounded shadow-lg text-[11px]"
              style={{
                ...(subSide === 'right' ? { left: '100%' } : { right: '100%' }),
                top: 0,
                background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)',
                minWidth: 220, whiteSpace: 'nowrap',
              }}>
              {col.options!.items.map(opt => optionCheckItem(opt.id, opt.label))}
              {col.options!.canCreateNew && (
                <>
                  <div style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />
                  <button
                    style={itemStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => col.options?.onCreateNew?.()}>
                    Neu...
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      {/* PP: grouped columns as submenus with > arrow — outside scroll container */}
      {groupOrder.map(groupName => {
        const cols = groups[groupName];
        return (
          <div key={groupName} className="relative"
            onMouseEnter={() => { setOpenGroup(groupName); setOpenOptionSub(null); }}
            onMouseLeave={() => { setOpenGroup(null); setOpenOptionSub(null); }}>
            <div className="flex items-center justify-between px-3 py-[2px] cursor-pointer"
              style={{ color: 'var(--pp-text)', fontSize: 11,
                background: openGroup === groupName ? 'var(--pp-selected-bg)' : 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
              onMouseLeave={e => { if (openGroup !== groupName) e.currentTarget.style.background = 'transparent'; }}>
              <span>{groupName}</span>
              <span style={{ fontSize: 8, marginLeft: 12, color: 'var(--pp-text-muted)' }}>▶</span>
            </div>
            {openGroup === groupName && (
              <div className="absolute z-[60] py-1 rounded shadow-lg text-[11px]"
                style={{
                  ...(subSide === 'right' ? { left: '100%' } : { right: '100%' }),
                  top: 0,
                  background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)',
                  minWidth: 220, whiteSpace: 'nowrap',
                }}>
                {renderGroupSubmenu(groupName, cols)}
              </div>
            )}
          </div>
        );
      })}

      {/* Zusatzfeature-Slot (Farb-Anpassung) — direkt unter den Gruppen (z.B. "Attribute"), kein PP */}
      {menuExtra && menuExtra(onClose)}

      {/* PP: Separator + MenuResetColumns */}
      <div style={{ height: 1, margin: '3px 0', background: 'var(--pp-border)' }} />
      <button
        style={{ ...itemStyle, cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--pp-selected-bg)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onClick={() => { onReset(); onClose(); }}>
        Spalten zurücksetzen
      </button>
    </div>
  );
}

function PPTableInner<T>({ columns, data, rowKey, selectedKey, onSelect, summaryRow, groupRow, storageKey, hiddenByDefault, onRowContextMenu, columnMenuPos, onColumnMenuClose, onResetColumns, menuExtra }: PPTableProps<T>) {
  const defaults = useMemo(() => columns.map(c => ({ id: c.id, width: c.width })), [columns]);
  const defaultOrder = useMemo(() => columns.map(c => c.id), [columns]);

  const [colStates, setColStates] = useState<ColumnState[]>(() =>
    storageKey ? loadColumnState(storageKey, defaults) : defaults
  );
  const [colOrder, setColOrder] = useState<string[]>(() =>
    storageKey ? loadColumnOrder(storageKey, defaultOrder) : defaultOrder
  );
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    if (storageKey) {
      const saved = loadHiddenColumns(storageKey);
      if (saved.size > 0) return saved;
    }
    return hiddenByDefault ?? new Set();
  });
  const [sortCols, setSortCols] = useState<Array<{ id: string; dir: 'asc' | 'desc' }>>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`pp-sort-${storageKey}`);
        if (saved) return JSON.parse(saved);
      } catch { /* */ }
    }
    return [];
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowKey: string; colId: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Virtualisierung: nur sichtbare Zeilen rendern (PP/SWT TableViewer ist ebenfalls virtuell).
  // Ohne dies blockieren große Tabellen (z.B. 45k Buchungen) das DOM mehrere Sekunden.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const ROW_H = 22; // feste Zeilenhöhe der pp-table (siehe index.css)

  const resizingCol = useRef<string | null>(null);
  const wasResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);
  const wasReorderingDrag = useRef(false);

  useEffect(() => {
    if (storageKey) saveColumnState(storageKey, colStates);
  }, [colStates, storageKey]);

  useEffect(() => {
    if (storageKey) {
      try { localStorage.setItem(`pp-sort-${storageKey}`, JSON.stringify(sortCols)); } catch { /* */ }
    }
  }, [sortCols, storageKey]);

  useEffect(() => {
    if (storageKey) saveColumnOrder(storageKey, colOrder);
  }, [colOrder, storageKey]);

  useEffect(() => {
    if (storageKey) saveHiddenColumns(storageKey, hiddenCols);
  }, [hiddenCols, storageKey]);

  useEffect(() => {
    if (columnMenuPos && !contextMenu) {
      setContextMenu(columnMenuPos);
    } else if (!columnMenuPos && contextMenu) {
      setContextMenu(null);
    }
  }, [columnMenuPos]);

  const colMap = useMemo(() => new Map(columns.map(c => [c.id, c])), [columns]);
  const stateMap = useMemo(() => new Map(colStates.map(c => [c.id, c])), [colStates]);

  const orderedCols = useMemo(() =>
    colOrder
      .filter(id => !hiddenCols.has(id))
      .map(id => colMap.get(id))
      .filter((c): c is PPColumn<T> => !!c),
    [colOrder, colMap, hiddenCols]
  );

  const sortedData = useMemo(() => {
    if (sortCols.length === 0) return data;
    const fns = sortCols.map(s => ({ col: colMap.get(s.id), dir: s.dir })).filter(f => f.col?.sortFn);
    if (fns.length === 0) return data;
    return [...data].sort((a, b) => {
      for (const { col, dir } of fns) {
        const r = col!.sortFn!(a, b);
        if (r !== 0) return dir === 'desc' ? -r : r;
      }
      return 0;
    });
  }, [data, sortCols, colMap]);

  // Stabile Callbacks, damit memoisierte Zeilen nicht bei jedem Render neu rendern
  const handleSelectRow = useCallback((key: string, isSelected: boolean) => {
    onSelect?.(isSelected ? null : key);
  }, [onSelect]);
  const handleStartEdit = useCallback((rowKey: string, colId: string, initial: string) => {
    setEditValue(initial);
    setEditingCell({ rowKey, colId });
  }, []);
  const handleCommitEdit = useCallback((col: PPColumn<T>, row: T, value: string) => {
    col.onEdit?.(row, value);
    setEditingCell(null);
  }, []);
  const handleCancelEdit = useCallback(() => setEditingCell(null), []);
  const handleCheckboxEdit = useCallback((col: PPColumn<T>, row: T) => {
    const v = col.getValue?.(row);
    col.onEdit?.(row, !v);
  }, []);

  // Sichtbaren Zeilenbereich berechnen (mit Überhang für ruckelfreies Scrollen).
  // Bei kleinen Tabellen (< Schwelle) wird alles gerendert — kein Overhead.
  const VIRTUAL_THRESHOLD = 80;
  const OVERSCAN = 12;
  const virtualize = sortedData.length > VIRTUAL_THRESHOLD;
  const startIdx = virtualize ? Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN) : 0;
  const endIdx = virtualize
    ? Math.min(sortedData.length, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN)
    : sortedData.length;
  const padTop = startIdx * ROW_H;
  const padBottom = (sortedData.length - endIdx) * ROW_H;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, []);

  // Beim Daten-/Sortierwechsel nach oben scrollen, damit der Bereich konsistent bleibt
  useEffect(() => {
    if (scrollRef.current && virtualize) { scrollRef.current.scrollTop = 0; setScrollTop(0); }
  }, [storageKey, sortCols, virtualize]);

  const getWidth = useCallback((id: string) => stateMap.get(id)?.width ?? 100, [stateMap]);

  const onResizeStart = useCallback((colId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = colId;
    resizeStartX.current = e.clientX;
    resizeStartW.current = getWidth(colId);

    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return;
      const delta = ev.clientX - resizeStartX.current;
      const minW = colMap.get(resizingCol.current)?.minWidth ?? 40;
      const newW = Math.max(minW, resizeStartW.current + delta);
      setColStates(prev => prev.map(c => c.id === resizingCol.current ? { ...c, width: newW } : c));
    };

    const onUp = () => {
      wasResizing.current = true;
      requestAnimationFrame(() => { wasResizing.current = false; });
      resizingCol.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [getWidth, colMap]);

  // Spalten umordnen per Maus (robust, mit Einfüge-Vorschau). Ersetzt das
  // fehleranfällige native HTML5-Drag. Startet erst nach >5px Bewegung, damit
  // ein einfacher Klick weiterhin sortiert.
  const startColumnDrag = useCallback((colId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement)?.classList?.contains('pp-col-resize')) return;
    const startX = e.clientX;
    const thEl = (e.currentTarget as HTMLElement);
    const headerRow = thEl.parentElement as HTMLTableRowElement | null;
    if (!headerRow) return;
    const ths = Array.from(headerRow.cells) as HTMLTableCellElement[];
    const rects = ths.map(c => c.getBoundingClientRect());
    const fromDisp = ths.indexOf(thEl as HTMLTableCellElement);

    let dragging = false;
    let marker: HTMLDivElement | null = null;
    let ghost: HTMLDivElement | null = null;

    const insertIndexAt = (x: number) => {
      for (let k = 0; k < rects.length; k++) {
        if (x < rects[k].left + rects[k].width / 2) return k;
      }
      return rects.length;
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragging && Math.abs(ev.clientX - startX) < 5) return;
      if (!dragging) {
        dragging = true;
        wasReorderingDrag.current = true;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        thEl.style.opacity = '0.5';
        marker = document.createElement('div');
        marker.style.cssText = `position:fixed;top:${rects[0].top}px;height:${rects[0].height}px;width:2px;background:var(--pp-accent);z-index:9999;pointer-events:none;`;
        document.body.appendChild(marker);
        ghost = document.createElement('div');
        ghost.textContent = (thEl.querySelector('span')?.textContent || thEl.textContent || '').trim();
        ghost.style.cssText = `position:fixed;z-index:9999;pointer-events:none;padding:2px 8px;font-size:11px;background:var(--pp-content-bg);border:1px solid var(--pp-accent);border-radius:3px;color:var(--pp-text);box-shadow:0 2px 8px rgba(0,0,0,.4);`;
        document.body.appendChild(ghost);
      }
      const insAt = insertIndexAt(ev.clientX);
      const lineX = insAt < rects.length ? rects[insAt].left : rects[rects.length - 1].right;
      if (marker) marker.style.left = `${lineX - 1}px`;
      if (ghost) { ghost.style.left = `${ev.clientX + 12}px`; ghost.style.top = `${ev.clientY + 8}px`; }
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      thEl.style.opacity = '';
      marker?.remove();
      ghost?.remove();
      if (!dragging) return;
      const insAt = insertIndexAt(ev.clientX);
      let target = insAt;
      if (fromDisp < insAt) target -= 1;
      if (target === fromDisp || fromDisp < 0) return;
      setColOrder(prev => {
        // prev ist die vollständige Spaltenreihenfolge (inkl. versteckter);
        // wir verschieben relativ zu den SICHTBAREN Spalten.
        const visibleIds = ths.map(t => t.dataset.colId).filter(Boolean) as string[];
        const movedId = visibleIds[fromDisp];
        if (!movedId) return prev;
        // Zielspalte (sichtbar) bestimmen, an deren Position eingefügt wird
        const next = prev.filter(id => id !== movedId);
        // Position im next-Array anhand der sichtbaren Zielspalte
        const refVisibleId = visibleIds.filter(id => id !== movedId)[target];
        const insertAt = refVisibleId ? next.indexOf(refVisibleId) : next.length;
        next.splice(insertAt < 0 ? next.length : insertAt, 0, movedId);
        return next;
      });
      // den folgenden click (Sortieren) unterdrücken
      setTimeout(() => { wasReorderingDrag.current = false; }, 0);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [setColOrder]);

  const handleSort = useCallback((colId: string, ctrlKey: boolean) => {
    setSortCols(prev => {
      const idx = prev.findIndex(s => s.id === colId);
      if (ctrlKey) {
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], dir: next[idx].dir === 'asc' ? 'desc' : 'asc' };
          return next;
        }
        return [...prev, { id: colId, dir: 'asc' }];
      }
      if (idx >= 0 && prev.length === 1) {
        return [{ id: colId, dir: prev[0].dir === 'asc' ? 'desc' : 'asc' }];
      }
      return [{ id: colId, dir: 'asc' }];
    });
  }, []);

  const toggleColumn = useCallback((colId: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const totalWidth = orderedCols.reduce((s, c) => s + getWidth(c.id), 0);

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto relative">
      <table className="pp-table" style={{ minWidth: totalWidth }}>
        <colgroup>
          {orderedCols.map(col => (
            <col key={col.id} style={{ width: getWidth(col.id) }} />
          ))}
        </colgroup>
        <thead>
          <tr onContextMenu={handleContextMenu}>
            {orderedCols.map(col => (
              <th
                key={col.id}
                data-col-id={col.id}
                className={col.align === 'right' ? 'right' : ''}
                style={{ width: getWidth(col.id) }}
                onMouseDown={e => startColumnDrag(col.id, e)}
                onClick={e => {
                  if (wasResizing.current) return;
                  if (wasReorderingDrag.current) return;
                  col.sortFn && handleSort(col.id, e.ctrlKey || e.metaKey);
                }}
              >
                <span style={{ cursor: col.sortFn ? 'pointer' : 'default' }}>
                  {col.label}
                  {(() => {
                    const si = sortCols.findIndex(s => s.id === col.id);
                    if (si < 0) return null;
                    return (
                      <span style={{ marginLeft: 3, color: 'var(--pp-accent)' }}>
                        {sortCols[si].dir === 'asc' ? '▲' : '▼'}
                        {sortCols.length > 1 && <sup>{si + 1}</sup>}
                      </span>
                    );
                  })()}
                </span>
                <div className="pp-col-resize" onMouseDown={e => onResizeStart(col.id, e)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summaryRow && summaryRow(orderedCols)}
          {groupRow && groupRow(orderedCols)}
          {/* Spacer für die nicht gerenderten Zeilen oberhalb des Viewports */}
          {padTop > 0 && <tr aria-hidden style={{ height: padTop }}><td colSpan={orderedCols.length} style={{ padding: 0, border: 'none' }} /></tr>}
          {sortedData.slice(startIdx, endIdx).map((row, i) => {
            const idx = startIdx + i;
            const key = rowKey(row, idx);
            return (
              <TableRow
                key={key}
                row={row} idx={idx} rowKeyValue={key}
                isSelected={key === selectedKey}
                orderedCols={orderedCols}
                editingColId={editingCell?.rowKey === key ? editingCell.colId : null}
                editValue={editValue}
                onSelectRow={handleSelectRow}
                onRowContextMenu={onRowContextMenu}
                onStartEdit={handleStartEdit}
                onEditChange={setEditValue}
                onCommitEdit={handleCommitEdit}
                onCancelEdit={handleCancelEdit}
                onCheckboxEdit={handleCheckboxEdit}
              />
            );
          })}
          {/* Spacer für die nicht gerenderten Zeilen unterhalb des Viewports */}
          {padBottom > 0 && <tr aria-hidden style={{ height: padBottom }}><td colSpan={orderedCols.length} style={{ padding: 0, border: 'none' }} /></tr>}
        </tbody>
      </table>

      {contextMenu && (
        <ColumnMenu
          x={contextMenu.x} y={contextMenu.y}
          columns={columns} hiddenCols={hiddenCols}
          toggleColumn={toggleColumn}
          onReset={() => {
            if (onResetColumns) {
              onResetColumns();
            } else {
              setHiddenCols(hiddenByDefault ?? new Set());
              if (storageKey) saveHiddenColumns(storageKey, hiddenByDefault ?? new Set());
            }
          }}
          onClose={() => { setContextMenu(null); onColumnMenuClose?.(); }}
          menuExtra={menuExtra}
        />
      )}
    </div>
  );
}

/* In React.memo gewrappt, damit ein Re-Render des Eltern-Views (z.B. Öffnen
   eines Toolbar-Dropdowns) die ggf. sehr große Tabelle NICHT neu durchrechnet.
   Greift nur, wenn die Props stabil sind (Views nutzen useCallback für rowKey
   und onRowContextMenu sowie memoisierte data-Arrays). */
export const PPTable = memo(PPTableInner) as typeof PPTableInner;
