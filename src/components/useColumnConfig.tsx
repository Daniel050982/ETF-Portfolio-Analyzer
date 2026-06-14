import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

/* ══════════════════════════════════════════════════════════════════════
   useColumnConfig — verwaltet Spalten-Reihenfolge, -Breiten und Sortierung
   als React-State (NICHT per DOM-Manipulation). Die View rendert Header UND
   Zellen aus DERSELBEN geordneten Spaltenliste → Kopf und Daten bleiben immer
   synchron, egal wie oft umgeordnet wird. Zustand wird persistiert.

   Verwendung in einer View mit dynamisch gerenderten Spalten:
     const COLS = [{ id:'name', label:'Name' }, { id:'kurs', label:'Kurs', align:'right' }, …];
     const cfg = useColumnConfig('depots-vermoegen', COLS);
     // Header:
     <thead><tr>{cfg.orderedColumns.map(c => cfg.renderHeader(c))}</tr></thead>
     // Zeile:
     {cfg.orderedColumns.map(c => <td key={c.id} className={c.align==='right'?'right mono':undefined}>{cell(row, c.id)}</td>)}
     // Sortierte Daten:
     const rows = cfg.sortData(data, (row, colId) => sortValueFor(row, colId));
   ══════════════════════════════════════════════════════════════════════ */

export interface ColumnDef {
  id: string;
  label: string;
  align?: 'left' | 'right';
  width?: number;
  sortable?: boolean; // default true
}

export interface SortCol { id: string; dir: 'asc' | 'desc' }

interface PersistState {
  order: string[];
  widths: Record<string, number>;
  sortCols: SortCol[];        // mehrstufige Sortierung (PP: Strg-Klick)
  // Legacy-Felder (Single-Sort) — nur für Rückwärtskompatibilität beim Laden
  sortId?: string | null;
  sortDir?: 'asc' | 'desc';
  hidden: string[];
}

// Geladenen State auf das mehrstufige Sort-Modell normalisieren
function normalizeSortCols(st: Partial<PersistState>): SortCol[] {
  if (Array.isArray(st.sortCols)) return st.sortCols.filter(s => s && s.id);
  if (st.sortId) return [{ id: st.sortId, dir: st.sortDir ?? 'asc' }];
  return [];
}

function load(key: string): Partial<PersistState> {
  try {
    const raw = localStorage.getItem(`pp-colcfg-${key}`);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return {};
}
function save(key: string, st: PersistState) {
  try { localStorage.setItem(`pp-colcfg-${key}`, JSON.stringify(st)); } catch { /* */ }
}

export function useColumnConfig(
  storageKey: string,
  columns: ColumnDef[],
  defaultHidden?: string[],
  /* IDs, die beim Laufzeit-Hinzukommen NICHT versteckt werden sollen (z.B. die
     im "Neu…"-Dialog gewählte Spalte). Ref, damit der Aufrufer sie vor dem
     Anlegen setzen kann. */
  keepVisibleRef?: React.MutableRefObject<Set<string>>,
) {
  const colIds = useMemo(() => columns.map(c => c.id), [columns]);
  const colMap = useMemo(() => new Map(columns.map(c => [c.id, c])), [columns]);

  const initial = useMemo(() => load(storageKey), [storageKey]);

  const [order, setOrder] = useState<string[]>(() => {
    const saved = (initial.order ?? []).filter(id => colMap.has(id));
    const missing = colIds.filter(id => !saved.includes(id));
    return [...saved, ...missing];
  });
  const [widths, setWidths] = useState<Record<string, number>>(() => initial.widths ?? {});
  const [sortCols, setSortCols] = useState<SortCol[]>(() => normalizeSortCols(initial));
  const [hidden, setHidden] = useState<Set<string>>(() =>
    new Set(initial.hidden ?? defaultHidden ?? []));

  // Spalten können sich zur Laufzeit ändern (z.B. neuer Berichtszeitraum →
  // neue periodische Spalten). Neu hinzugekommene IDs an die Reihenfolge
  // anhängen, damit sie überhaupt gerendert werden können; entfallene IDs
  // ausfiltern. Zur Laufzeit neu hinzugekommene Spalten werden standardmäßig
  // VERSTECKT (PP: ein neuer Berichtszeitraum setzt nicht überall einen Haken);
  // der Aufrufer macht gezielt einzelne sichtbar.
  useEffect(() => {
    setOrder(prev => {
      const known = new Set(prev);
      const added = colIds.filter(id => !known.has(id));
      const kept = prev.filter(id => colMap.has(id));
      if (added.length === 0 && kept.length === prev.length) return prev;
      const toHide = added.filter(id => !keepVisibleRef?.current.has(id));
      if (toHide.length > 0) {
        setHidden(prevHidden => {
          const next = new Set(prevHidden);
          for (const id of toHide) next.add(id);
          save(storageKey, { order: [...kept, ...added], widths, sortCols, hidden: [...next] });
          return next;
        });
      }
      // keepVisibleRef NICHT hier leeren: in React StrictMode (Dev) läuft dieser
      // Effekt doppelt; ein vorzeitiges Leeren würde beim zweiten Lauf die
      // gewünschte Spalte doch verstecken. Die IDs bleiben stehen (harmlos, da
      // jede ID nur einmal als "added" auftritt).
      return [...kept, ...added];
    });
  }, [colIds, colMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((patch: Partial<PersistState>) => {
    save(storageKey, {
      order, widths, sortCols, hidden: [...hidden], ...patch,
    });
  }, [storageKey, order, widths, sortCols, hidden]);

  // Sortierung umschalten (Klick auf Header). ctrlKey = mehrstufig (PP):
  // - ohne Strg: nur diese Spalte; erneuter Klick kehrt die Richtung um
  // - mit Strg: Spalte zur Sortierung hinzufügen bzw. ihre Richtung umkehren
  const toggleSort = useCallback((id: string, ctrlKey = false) => {
    setSortCols(prev => {
      const idx = prev.findIndex(s => s.id === id);
      let next: SortCol[];
      if (ctrlKey) {
        if (idx >= 0) {
          next = [...prev];
          next[idx] = { ...next[idx], dir: next[idx].dir === 'asc' ? 'desc' : 'asc' };
        } else {
          next = [...prev, { id, dir: 'asc' }];
        }
      } else if (idx >= 0 && prev.length === 1) {
        next = [{ id, dir: prev[0].dir === 'asc' ? 'desc' : 'asc' }];
      } else {
        next = [{ id, dir: 'asc' }];
      }
      persist({ sortCols: next });
      return next;
    });
  }, [persist]);

  // Spalte umordnen (von Anzeige-Position fromPos auf toPos)
  const moveColumn = useCallback((fromId: string, toPos: number) => {
    setOrder(prev => {
      const visible = prev.filter(id => !hidden.has(id));
      const fromPos = visible.indexOf(fromId);
      if (fromPos < 0) return prev;
      let target = toPos;
      if (fromPos < toPos) target -= 1;
      if (target === fromPos) return prev;
      // Umordnung auf der SICHTBAREN Liste, dann zurück in die volle Reihenfolge mappen
      const newVisible = [...visible];
      const moved = newVisible.splice(fromPos, 1)[0];
      newVisible.splice(target, 0, moved);
      // versteckte Spalten an ihren relativen Stellen belassen: einfache Strategie —
      // volle Reihenfolge = newVisible + versteckte (in alter relativer Reihenfolge)
      const hiddenIds = prev.filter(id => hidden.has(id));
      const next = [...newVisible, ...hiddenIds];
      save(storageKey, { order: next, widths, sortCols, hidden: [...hidden] });
      return next;
    });
  }, [hidden, storageKey, widths, sortCols]);

  const setWidth = useCallback((id: string, w: number) => {
    setWidths(prev => {
      const next = { ...prev, [id]: w };
      save(storageKey, { order, widths: next, sortCols, hidden: [...hidden] });
      return next;
    });
  }, [storageKey, order, sortCols, hidden]);

  const toggleHidden = useCallback((id: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      save(storageKey, { order, widths, sortCols, hidden: [...next] });
      return next;
    });
  }, [storageKey, order, widths, sortCols]);

  const resetColumns = useCallback(() => {
    setOrder([...colIds]);
    setWidths({});
    setSortCols([]);
    setHidden(new Set(defaultHidden ?? []));
    save(storageKey, { order: [...colIds], widths: {}, sortCols: [], hidden: defaultHidden ?? [] });
  }, [colIds, storageKey, defaultHidden]);

  const orderedColumns = useMemo(
    () => order.map(id => colMap.get(id)).filter((c): c is ColumnDef => !!c && !hidden.has(c.id)),
    [order, colMap, hidden]
  );

  // Daten mehrstufig sortieren (PP): nach jeder Sortierspalte der Reihe nach;
  // bei Gleichstand entscheidet die nächste. valueFor liefert einen
  // vergleichbaren Wert (number | string | Date) für (row, colId).
  function sortData<R>(data: R[], valueFor: (row: R, colId: string) => number | string | Date | null | undefined): R[] {
    if (sortCols.length === 0) return data;
    const cmpOne = (a: R, b: R, sc: SortCol): number => {
      const dir = sc.dir === 'asc' ? 1 : -1;
      const va = valueFor(a, sc.id);
      const vb = valueFor(b, sc.id);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      if (va instanceof Date && vb instanceof Date) return (va.getTime() - vb.getTime()) * dir;
      return String(va).localeCompare(String(vb), 'de', { numeric: true }) * dir;
    };
    return [...data].sort((a, b) => {
      for (const sc of sortCols) {
        const r = cmpOne(a, b, sc);
        if (r !== 0) return r;
      }
      return 0;
    });
  }

  return {
    columns,
    colMap,
    orderedColumns,
    widths,
    sortCols,
    hidden,
    toggleSort,
    moveColumn,
    setWidth,
    toggleHidden,
    resetColumns,
    sortData,
  };
}

/* ── Header-Zelle mit Sortierpfeil, Resize-Griff und Drag-Reorder ──
   Wiederverwendbar in jeder View. */
export function ColumnHeader({ col, index, cfg }: {
  col: ColumnDef;
  index: number; // Anzeige-Position
  cfg: ReturnType<typeof useColumnConfig>;
}) {
  const thRef = useRef<HTMLTableCellElement>(null);
  const sortable = col.sortable !== false;

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const th = thRef.current;
    if (!th) return;
    const startW = th.getBoundingClientRect().width;
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 2) moved = true;
      cfg.setWidth(col.id, Math.max(28, Math.round(startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      document.body.style.cursor = ''; document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (moved) { th.dataset.resizing = '1'; setTimeout(() => { delete th.dataset.resizing; }, 0); }
    };
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [cfg, col.id]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).classList.contains('pp-col-resize')) return;
    const th = thRef.current;
    if (!th) return;
    const headerRow = th.parentElement as HTMLTableRowElement;
    const rects = Array.from(headerRow.cells).map(c => c.getBoundingClientRect());
    const startX = e.clientX;
    let dragging = false;
    let marker: HTMLDivElement | null = null;
    let ghost: HTMLDivElement | null = null;

    const insertAt = (x: number) => {
      for (let k = 0; k < rects.length; k++) if (x < rects[k].left + rects[k].width / 2) return k;
      return rects.length;
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragging && Math.abs(ev.clientX - startX) < 5) return;
      if (!dragging) {
        dragging = true;
        document.body.style.cursor = 'grabbing'; document.body.style.userSelect = 'none';
        th.style.opacity = '0.5';
        marker = document.createElement('div');
        marker.style.cssText = `position:fixed;top:${rects[0].top}px;height:${rects[0].height}px;width:2px;background:var(--pp-accent);z-index:9999;pointer-events:none;`;
        document.body.appendChild(marker);
        ghost = document.createElement('div');
        ghost.textContent = col.label;
        ghost.style.cssText = `position:fixed;z-index:9999;pointer-events:none;padding:2px 8px;font-size:11px;background:var(--pp-content-bg);border:1px solid var(--pp-accent);border-radius:3px;color:var(--pp-text);box-shadow:0 2px 8px rgba(0,0,0,.4);`;
        document.body.appendChild(ghost);
      }
      const k = insertAt(ev.clientX);
      const lineX = k < rects.length ? rects[k].left : rects[rects.length - 1].right;
      if (marker) marker.style.left = `${lineX - 1}px`;
      if (ghost) { ghost.style.left = `${ev.clientX + 12}px`; ghost.style.top = `${ev.clientY + 8}px`; }
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = ''; document.body.style.userSelect = '';
      th.style.opacity = '';
      marker?.remove(); ghost?.remove();
      if (!dragging) return;
      th.dataset.reordering = '1'; setTimeout(() => { delete th.dataset.reordering; }, 0);
      cfg.moveColumn(col.id, insertAt(ev.clientX));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [cfg, col.id]);

  return (
    <th
      ref={thRef}
      className={col.align === 'right' ? 'right' : undefined}
      style={{ width: cfg.widths[col.id] ?? col.width, position: 'relative', cursor: 'pointer' }}
      onMouseDown={startDrag}
      onClick={e => {
        const th = thRef.current;
        if (th?.dataset.resizing || th?.dataset.reordering) return;
        if ((e.target as HTMLElement).classList.contains('pp-col-resize')) return;
        if (sortable) cfg.toggleSort(col.id, e.ctrlKey || e.metaKey);
      }}
    >
      <span className="pp-th-label" style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>
        {col.label}
        {(() => {
          const si = cfg.sortCols.findIndex(s => s.id === col.id);
          if (si < 0) return null;
          // gleiche Optik wie PPTable: orangefarbenes Dreieck in normaler
          // Schriftgröße + hochgestellte Sortier-Reihenfolge bei Mehrfachsortierung
          return (
            <span style={{ marginLeft: 3, color: 'var(--pp-accent)' }}>
              {cfg.sortCols[si].dir === 'asc' ? '▲' : '▼'}
              {cfg.sortCols.length > 1 && <sup>{si + 1}</sup>}
            </span>
          );
        })()}
      </span>
      {index < cfg.orderedColumns.length - 1 && (
        <div className="pp-col-resize" onMouseDown={startResize} />
      )}
    </th>
  );
}
