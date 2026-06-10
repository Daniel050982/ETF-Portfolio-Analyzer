import { useState, useRef, useCallback, useMemo, useEffect } from 'react';

export interface PPColumn<T> {
  id: string;
  label: string;
  width: number;
  minWidth?: number;
  align?: 'left' | 'right';
  render: (row: T, index: number) => React.ReactNode;
  sortFn?: (a: T, b: T) => number;
}

interface PPTableProps<T> {
  columns: PPColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  summaryRow?: (columns: PPColumn<T>[]) => React.ReactNode;
  groupRow?: (columns: PPColumn<T>[]) => React.ReactNode;
  storageKey?: string;
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

export function PPTable<T>({ columns, data, rowKey, selectedKey, onSelect, summaryRow, groupRow, storageKey }: PPTableProps<T>) {
  const defaults = useMemo(() => columns.map(c => ({ id: c.id, width: c.width })), [columns]);
  const defaultOrder = useMemo(() => columns.map(c => c.id), [columns]);

  const [colStates, setColStates] = useState<ColumnState[]>(() =>
    storageKey ? loadColumnState(storageKey, defaults) : defaults
  );
  const [colOrder, setColOrder] = useState<string[]>(() =>
    storageKey ? loadColumnOrder(storageKey, defaultOrder) : defaultOrder
  );
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    storageKey ? loadHiddenColumns(storageKey) : new Set()
  );
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const resizingCol = useRef<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);
  const dragCol = useRef<string | null>(null);
  const dragOverCol = useRef<string | null>(null);

  useEffect(() => {
    if (storageKey) saveColumnState(storageKey, colStates);
  }, [colStates, storageKey]);

  useEffect(() => {
    if (storageKey) saveColumnOrder(storageKey, colOrder);
  }, [colOrder, storageKey]);

  useEffect(() => {
    if (storageKey) saveHiddenColumns(storageKey, hiddenCols);
  }, [hiddenCols, storageKey]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

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
    if (!sortCol) return data;
    const col = colMap.get(sortCol);
    if (!col?.sortFn) return data;
    const sorted = [...data].sort(col.sortFn);
    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [data, sortCol, sortDir, colMap]);

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

  const onDragStart = useCallback((colId: string, e: React.DragEvent) => {
    dragCol.current = colId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colId);
  }, []);

  const onDragOver = useCallback((_colId: string, e: React.DragEvent) => {
    e.preventDefault();
    dragOverCol.current = _colId;
  }, []);

  const onDrop = useCallback((targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = dragCol.current;
    if (!sourceId || sourceId === targetId) return;
    setColOrder(prev => {
      const next = prev.filter(id => id !== sourceId);
      const targetIdx = next.indexOf(targetId);
      next.splice(targetIdx, 0, sourceId);
      return next;
    });
    dragCol.current = null;
    dragOverCol.current = null;
  }, []);

  const handleSort = useCallback((colId: string) => {
    if (sortCol === colId) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(colId);
      setSortDir('asc');
    }
  }, [sortCol]);

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
    <div className="flex-1 overflow-auto relative">
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
                className={col.align === 'right' ? 'right' : ''}
                style={{ position: 'relative', width: getWidth(col.id) }}
                draggable
                onDragStart={e => onDragStart(col.id, e)}
                onDragOver={e => onDragOver(col.id, e)}
                onDrop={e => onDrop(col.id, e)}
                onClick={() => col.sortFn && handleSort(col.id)}
              >
                <span style={{ cursor: col.sortFn ? 'pointer' : 'default' }}>
                  {col.label}
                  {sortCol === col.id && (
                    <span style={{ marginLeft: 3, color: 'var(--pp-accent)' }}>
                      {sortDir === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </span>
                <div className="pp-col-resize" onMouseDown={e => onResizeStart(col.id, e)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summaryRow && summaryRow(orderedCols)}
          {groupRow && groupRow(orderedCols)}
          {sortedData.map((row, idx) => {
            const key = rowKey(row, idx);
            const isSelected = key === selectedKey;
            return (
              <tr
                key={key}
                className={`pp-row${isSelected ? ' selected' : ''}`}
                onClick={() => onSelect?.(isSelected ? null : key)}
              >
                {orderedCols.map(col => (
                  <td key={col.id} className={`${col.align === 'right' ? 'right ' : ''}mono`}>
                    {col.render(row, idx)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {contextMenu && (
        <div
          className="fixed z-50 py-1 rounded shadow-lg text-[11px]"
          style={{
            left: contextMenu.x, top: contextMenu.y,
            background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)',
            minWidth: 160, maxHeight: 300, overflowY: 'auto',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1 font-semibold" style={{ color: 'var(--pp-text-muted)', borderBottom: '1px solid var(--pp-border)' }}>
            Spalten ein/ausblenden
          </div>
          {columns.filter(c => c.label).map(col => (
            <label
              key={col.id}
              className="flex items-center gap-2 px-3 py-[3px] cursor-pointer hover:opacity-80"
              style={{ color: 'var(--pp-text)' }}
            >
              <input
                type="checkbox"
                checked={!hiddenCols.has(col.id)}
                onChange={() => toggleColumn(col.id)}
                style={{ accentColor: 'var(--pp-accent)' }}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
