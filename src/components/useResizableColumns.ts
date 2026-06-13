import { useRef, useLayoutEffect, useState } from 'react';

/* ══════════════════════════════════════════════════════════════════════
   useTableColumns — rüstet einer rohen <table className="pp-table"> die
   Spalten-Interaktionen der PPTable nach (Breite ziehen, Sortieren per
   Header-Klick, Spalten per Drag&Drop umordnen), OHNE die View umzuschreiben.

   React rendert die Tabelle bei jedem Render in ORIGINAL-Reihenfolge. Der
   Effect (ohne dep-array, läuft nach JEDEM Render) liest die DOM-Knoten stets
   FRISCH und bringt sie in den gewünschten Zustand. Interaktionen lösen über
   einen Tick-Bump einen erneuten Effect-Lauf aus. Zustand (Reihenfolge,
   Sortierung, Breiten) wird unter storageKey persistiert.

   Verwendung:
     const ref = useTableColumns('bestand');
     <table className="pp-table" ref={ref}> ... </table>
   ══════════════════════════════════════════════════════════════════════ */

/* Spalten werden über ihren Header-LABEL-TEXT identifiziert (stabil über
   React-Re-Renders, im Gegensatz zu DOM-Positionen/Indizes, die nach einer
   DOM-Umordnung mehrdeutig werden). */
interface TableState {
  widths: Record<string, number>;  // label -> px
  sortLabel: string | null;        // label der Sortierspalte
  sortDir: 'asc' | 'desc';
  order: string[] | null;          // gewünschte Anzeige-Reihenfolge als Labels
}

function loadState(storageKey?: string): TableState {
  const base: TableState = { widths: {}, sortLabel: null, sortDir: 'asc', order: null };
  if (!storageKey) return base;
  try {
    const raw = localStorage.getItem(`pp-tablestate-${storageKey}`);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch { /* */ }
  return base;
}

function saveState(storageKey: string | undefined, st: TableState) {
  if (!storageKey) return;
  try { localStorage.setItem(`pp-tablestate-${storageKey}`, JSON.stringify(st)); } catch { /* */ }
}

function isFixedRow(tr: HTMLTableRowElement): boolean {
  return tr.classList.contains('pp-sum')
    || tr.classList.contains('pp-group')
    || tr.getAttribute('aria-hidden') === 'true';
}

function cellValue(td: HTMLTableCellElement | undefined): { num: number | null; text: string } {
  const text = (td?.textContent ?? '').trim();
  if (!text) return { num: null, text: '' };
  const dm = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dm) return { num: new Date(+dm[3], +dm[2] - 1, +dm[1]).getTime(), text };
  if (/^-?[\d.]+(,\d+)?\s*[€%]?$/.test(text)) {
    const n = parseFloat(text.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    if (!isNaN(n)) return { num: n, text };
  }
  return { num: null, text };
}

export function useTableColumns<T extends HTMLTableElement = HTMLTableElement>(storageKey?: string) {
  const tableRef = useRef<T>(null);
  const stRef = useRef<TableState>(loadState(storageKey));
  // Original-Label-Reihenfolge (DOM-Index der BODY-Zellen) — einmal erfasst, stabil.
  const origLabelsRef = useRef<string[] | null>(null);
  const [, bump] = useState(0); // erzwingt einen erneuten Effect-Lauf nach Interaktion

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const st = stRef.current;

    const headerRow = (table.tHead?.rows[0] ?? table.rows[0]) as HTMLTableRowElement | undefined;
    if (!headerRow) return;
    const ths0 = Array.from(headerRow.cells) as HTMLTableCellElement[];
    const colCount = ths0.length;
    if (colCount === 0) return;

    // Label jedes th in <span class="pp-th-label"> kapseln (stabiler Identifikator)
    ths0.forEach(th => {
      th.style.cursor = 'pointer';
      if (th.querySelector(':scope > span.pp-th-label')) return;
      const span = document.createElement('span');
      span.className = 'pp-th-label';
      const moveNodes: ChildNode[] = [];
      th.childNodes.forEach(ch => {
        if (ch instanceof HTMLElement && (ch.classList.contains('pp-col-resize') || ch.classList.contains('pp-sort-ind'))) return;
        moveNodes.push(ch);
      });
      moveNodes.forEach(n => span.appendChild(n));
      th.insertBefore(span, th.firstChild);
    });

    // Label-Text eines th (ohne Sortierpfeil)
    const labelOf = (th: HTMLTableCellElement): string => {
      const span = th.querySelector(':scope > span.pp-th-label');
      const clone = span?.cloneNode(true) as HTMLElement | undefined;
      clone?.querySelector('.pp-sort-ind')?.remove();
      return (clone?.textContent ?? th.textContent ?? '').trim();
    };

    const labelToTh = new Map<string, HTMLTableCellElement>();
    ths0.forEach(th => labelToTh.set(labelOf(th), th));
    const currentLabels = ths0.map(labelOf);

    // ORIGINAL-Label-Reihenfolge: einmalig erfassen (DOM ist beim ersten Lauf in
    // React-/Original-Reihenfolge). Die BODY-Zellen stehen IMMER in dieser
    // Original-Reihenfolge im DOM (React rendert sie so), daher ist sie der
    // verlässliche Bezug für die Body-Spalten-Indizes.
    if (!origLabelsRef.current || origLabelsRef.current.length !== colCount
        || !origLabelsRef.current.every(l => labelToTh.has(l))) {
      // erfassen: aktuelle DOM-Reihenfolge der HEADER ist beim ersten Lauf original;
      // bei späteren Läufen kann sie umgeordnet sein → dann NICHT überschreiben.
      if (!origLabelsRef.current || !origLabelsRef.current.every(l => labelToTh.has(l))) {
        origLabelsRef.current = [...currentLabels];
      }
    }
    const origLabels = origLabelsRef.current;
    const origIdxOfLabel = new Map<string, number>();
    origLabels.forEach((l, i) => origIdxOfLabel.set(l, i));

    // st.order säubern: nur bekannte Labels, fehlende (in Original-Reihenfolge) anhängen
    if (!st.order) st.order = [...origLabels];
    st.order = st.order.filter(l => labelToTh.has(l));
    for (const l of origLabels) if (!st.order.includes(l)) st.order.push(l);

    // ---- 1) Reihenfolge anwenden: Header + Body-Zellen nach st.order ----
    const orderedThs = st.order.map(l => labelToTh.get(l)!).filter(Boolean);
    const targetOrigOrder = st.order.map(l => origIdxOfLabel.get(l)!); // Anzeige k → Original-Index

    const isIdentity = st.order.every((l, i) => l === origLabels[i]);
    if (!isIdentity) {
      orderedThs.forEach(th => headerRow.appendChild(th));
      for (const row of Array.from(table.tBodies[0]?.rows ?? [])) {
        const cells = Array.from(row.cells);
        if (cells.length !== colCount) continue;
        targetOrigOrder.forEach(orig => { const c = cells[orig]; if (c) row.appendChild(c); });
      }
    }

    // ---- 2) Breiten (per Label) ----
    for (const [label, w] of Object.entries(st.widths)) {
      const th = labelToTh.get(label);
      if (th) th.style.width = `${w}px`;
    }

    // ---- 3) Sortierung (per Label) ----
    ths0.forEach(th => th.querySelector(':scope > span.pp-th-label > .pp-sort-ind')?.remove());
    if (st.sortLabel) {
      const dispIdx = st.order.indexOf(st.sortLabel);
      const tbody = table.tBodies[0];
      if (dispIdx >= 0 && tbody) {
        const rows = Array.from(tbody.rows) as HTMLTableRowElement[];
        let i = 0;
        while (i < rows.length) {
          if (isFixedRow(rows[i]) || rows[i].cells.length !== colCount) { i++; continue; }
          let j = i;
          while (j < rows.length && !isFixedRow(rows[j]) && rows[j].cells.length === colCount) j++;
          const block = rows.slice(i, j).sort((ra, rb) => {
            const va = cellValue(ra.cells[dispIdx]);
            const vb = cellValue(rb.cells[dispIdx]);
            const r = (va.num != null && vb.num != null)
              ? va.num - vb.num
              : va.text.localeCompare(vb.text, 'de', { numeric: true });
            return st.sortDir === 'asc' ? r : -r;
          });
          block.forEach(row => tbody.insertBefore(row, rows[j] ?? null));
          i = j;
        }
        const sortTh = labelToTh.get(st.sortLabel);
        const labelEl = sortTh?.querySelector(':scope > span.pp-th-label');
        if (labelEl) {
          const ind = document.createElement('span');
          ind.className = 'pp-sort-ind';
          ind.textContent = st.sortDir === 'asc' ? '▲' : '▼';
          // gleiche Optik wie PPTable/useColumnConfig: oranges Dreieck in
          // normaler Schriftgröße (kein font-size:8) mit kleinem Abstand
          ind.style.cssText = 'color:var(--pp-accent);margin-left:3px;';
          labelEl.appendChild(ind);
        }
      }
    }

    // ---- Handler + Griffe ----
    const dispThs = Array.from(headerRow.cells) as HTMLTableCellElement[];
    const cleanups: Array<() => void> = [];
    let resizing = false;
    let suppressClick = false;

    dispThs.forEach((th, dispIdx) => {
      const myLabel = labelOf(th);
      th.removeAttribute('draggable');

      // a) Sortieren
      const onClick = (e: MouseEvent) => {
        if ((e.target as HTMLElement)?.classList?.contains('pp-col-resize')) return;
        if (resizing) { resizing = false; return; }
        if (suppressClick) { suppressClick = false; return; }
        if (st.sortLabel === myLabel) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
        else { st.sortLabel = myLabel; st.sortDir = 'asc'; }
        saveState(storageKey, st);
        bump(n => n + 1);
      };
      th.addEventListener('click', onClick);
      cleanups.push(() => th.removeEventListener('click', onClick));

      // (Spalten-Umordnung in diesem Legacy-Hook deaktiviert — die verbliebenen
      //  Nutzer sind Key-Value-/Baum-Tabellen, für die Reorder nicht sinnvoll ist.
      //  Datentabellen nutzen den robusten useColumnConfig-Hook.)

      // c) Breite ziehen (nicht letzte Anzeige-Spalte)
      th.querySelector(':scope > .pp-col-resize')?.remove();
      if (dispIdx < dispThs.length - 1) {
        th.style.position = th.style.position || 'relative';
        const handle = document.createElement('div');
        handle.className = 'pp-col-resize';
        const onDown = (e: MouseEvent) => {
          e.preventDefault(); e.stopPropagation();
          const startX = e.clientX;
          const startW = th.getBoundingClientRect().width;
          let movedFlag = false;
          const onMove = (ev: MouseEvent) => {
            if (Math.abs(ev.clientX - startX) > 2) movedFlag = true;
            th.style.width = `${Math.max(28, startW + (ev.clientX - startX))}px`;
          };
          const onUp = () => {
            if (movedFlag) {
              st.widths = { ...st.widths, [myLabel]: Math.round(th.getBoundingClientRect().width) };
              saveState(storageKey, st);
              resizing = true;
            }
            document.body.style.cursor = ''; document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        };
        handle.addEventListener('mousedown', onDown);
        th.appendChild(handle);
        cleanups.push(() => { handle.removeEventListener('mousedown', onDown); handle.remove(); });
      }
    });

    return () => { cleanups.forEach(fn => fn()); };
  });

  return tableRef;
}

// Rückwärtskompatibler Alias
export const useResizableColumns = useTableColumns;
