/* useConfigStore — benannte Spalten-Konfigurationen (PP ConfigurationStore).
   Hält mehrere benannte Snapshots der Spalten-Sichtbarkeit/-Reihenfolge/-Breite/
   -Sortierung in localStorage und erlaubt Umschalten/Neu/Duplizieren/Umbenennen/
   Löschen. Die "aktive" Konfiguration wird beim Umschalten in den Storage-Key
   der zugehörigen useColumnConfig geschrieben, sodass die Tabelle ihr folgt.

   PP: jede Konfiguration ist ein DropDown in der viewToolBar; die erste heißt
   "Standard". Der Titel der View zeigt den aktiven Konfigurationsnamen. */
import { useState, useCallback } from 'react';

export interface ColumnSnapshot {
  order: string[];
  widths: Record<string, number>;
  sortCols: { id: string; dir: 'asc' | 'desc' }[];
  hidden: string[];
}

export interface StoredConfig {
  id: string;
  name: string;
  snapshot: ColumnSnapshot;
}

interface ConfigStoreState {
  configs: StoredConfig[];
  activeId: string;
}

const STANDARD_NAME = 'Standard';

function metaKey(storageKey: string) { return `${storageKey}__configs`; }

function loadState(storageKey: string): ConfigStoreState {
  try {
    const raw = localStorage.getItem(metaKey(storageKey));
    if (raw) {
      const parsed = JSON.parse(raw) as ConfigStoreState;
      if (parsed.configs?.length) return parsed;
    }
  } catch { /* */ }
  const standard: StoredConfig = { id: 'standard', name: STANDARD_NAME, snapshot: emptySnapshot() };
  return { configs: [standard], activeId: 'standard' };
}

function emptySnapshot(): ColumnSnapshot { return { order: [], widths: {}, sortCols: [], hidden: [] }; }

function saveState(storageKey: string, state: ConfigStoreState) {
  try { localStorage.setItem(metaKey(storageKey), JSON.stringify(state)); } catch { /* */ }
}

/* Schreibt einen Snapshot in den Storage-Key der useColumnConfig, sodass deren
   load() ihn beim nächsten Mount übernimmt. Wir schreiben das gleiche Format,
   das useColumnConfig persistiert. */
function applySnapshotToColumns(columnsStorageKey: string, snap: ColumnSnapshot) {
  try {
    localStorage.setItem(columnsStorageKey, JSON.stringify({
      order: snap.order, widths: snap.widths, sortCols: snap.sortCols, hidden: snap.hidden,
    }));
  } catch { /* */ }
}

/* Liest den aktuellen Zustand aus dem useColumnConfig-Storage-Key. */
function readCurrentSnapshot(columnsStorageKey: string): ColumnSnapshot {
  try {
    const raw = localStorage.getItem(columnsStorageKey);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        order: p.order ?? [], widths: p.widths ?? {},
        sortCols: p.sortCols ?? [], hidden: p.hidden ?? [],
      };
    }
  } catch { /* */ }
  return emptySnapshot();
}

let idCounter = 0;
function newId(): string { idCounter += 1; return `cfg-${Date.now().toString(36)}-${idCounter}`; }

export function useConfigStore(storageKey: string, columnsStorageKey: string, onActivated: () => void) {
  const [state, setState] = useState<ConfigStoreState>(() => loadState(storageKey));

  const commit = useCallback((next: ConfigStoreState) => {
    setState(next);
    saveState(storageKey, next);
  }, [storageKey]);

  const active = state.configs.find(c => c.id === state.activeId) ?? state.configs[0];

  /* Aktuellen Tabellenzustand in die aktive Konfiguration zurückschreiben. */
  const captureActive = useCallback(() => {
    const snap = readCurrentSnapshot(columnsStorageKey);
    const next = { ...state, configs: state.configs.map(c => c.id === state.activeId ? { ...c, snapshot: snap } : c) };
    commit(next);
  }, [state, columnsStorageKey, commit]);

  const activate = useCallback((id: string) => {
    // aktuellen Zustand sichern, dann Ziel anwenden
    const snapCurrent = readCurrentSnapshot(columnsStorageKey);
    const target = state.configs.find(c => c.id === id);
    if (!target) return;
    const configs = state.configs.map(c => c.id === state.activeId ? { ...c, snapshot: snapCurrent } : c);
    applySnapshotToColumns(columnsStorageKey, target.snapshot);
    commit({ configs, activeId: id });
    onActivated();
  }, [state, columnsStorageKey, commit, onActivated]);

  const createNew = useCallback((templateId: string | null) => {
    const name = window.prompt('Name der neuen Ansicht', templateId
      ? `${state.configs.find(c => c.id === templateId)?.name ?? ''} (Kopie)` : 'Neue Ansicht');
    if (name == null || !name.trim()) return;
    const baseSnap = templateId
      ? (state.configs.find(c => c.id === templateId)?.snapshot ?? readCurrentSnapshot(columnsStorageKey))
      : readCurrentSnapshot(columnsStorageKey);
    const cfg: StoredConfig = { id: newId(), name: name.trim(), snapshot: { ...baseSnap } };
    applySnapshotToColumns(columnsStorageKey, cfg.snapshot);
    commit({ configs: [...state.configs, cfg], activeId: cfg.id });
    onActivated();
  }, [state, columnsStorageKey, commit, onActivated]);

  const rename = useCallback((id: string) => {
    const cfg = state.configs.find(c => c.id === id);
    if (!cfg) return;
    const name = window.prompt('Ansicht umbenennen', cfg.name);
    if (name == null || !name.trim()) return;
    commit({ ...state, configs: state.configs.map(c => c.id === id ? { ...c, name: name.trim() } : c) });
  }, [state, commit]);

  const remove = useCallback((id: string) => {
    // PP ConfigurationStore.delete: löscht die Ansicht; war es die letzte, wird
    // automatisch eine neue "Standard"-Ansicht angelegt.
    let remaining = state.configs.filter(c => c.id !== id);
    if (remaining.length === 0) remaining = [{ id: 'standard', name: STANDARD_NAME, snapshot: emptySnapshot() }];
    const wasActive = state.activeId === id;
    const activeId = wasActive ? remaining[0].id : state.activeId;
    if (wasActive) applySnapshotToColumns(columnsStorageKey, remaining[0].snapshot);
    commit({ configs: remaining, activeId });
    if (wasActive) onActivated();
  }, [state, columnsStorageKey, commit, onActivated]);

  const bringToFront = useCallback((id: string) => {
    const idx = state.configs.findIndex(c => c.id === id);
    if (idx <= 0) return;
    const reordered = [state.configs[idx], ...state.configs.filter(c => c.id !== id)];
    commit({ ...state, configs: reordered });
  }, [state, commit]);

  return {
    configs: state.configs,
    active,
    activeId: state.activeId,
    activeName: active?.name ?? STANDARD_NAME,
    activate, createNew, rename, remove, bringToFront, captureActive,
  };
}
