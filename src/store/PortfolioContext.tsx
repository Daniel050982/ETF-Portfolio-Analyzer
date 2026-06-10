import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Transaktion, Wertpapier, SteuerJahr, Konto, Depot, Sparplan, Taxonomie } from '../types/portfolio';
import type { PPImportResult } from '../core/xmlParser';
import { berechneWertpapiere, berechneSteuerJahre } from '../core/fifo';
import { supabase } from '../lib/supabase';

interface State {
  transaktionen: Transaktion[];
  wertpapiere: Record<string, Wertpapier>;
  steuerJahre: Record<number, SteuerJahr>;
  konten: Record<string, Konto>;
  depots: Record<string, Depot>;
  sparplaene: Sparplan[];
  taxonomien: Taxonomie[];
  basisWaehrung: string;
}

type Action =
  | { type: 'IMPORT_CSV'; transaktionen: Transaktion[] }
  | { type: 'IMPORT_XML'; result: PPImportResult }
  | { type: 'UPDATE_KURSE'; kurse: Record<string, { kurs: number; datum: Date }> }
  | { type: 'EDIT_TX'; tx: Transaktion }
  | { type: 'DELETE_TX'; id: string }
  | { type: 'CLEAR' }
  | { type: 'LOAD'; state: State };

const EMPTY: State = {
  transaktionen: [],
  wertpapiere: {},
  steuerJahre: {},
  konten: {},
  depots: {},
  sparplaene: [],
  taxonomien: [],
  basisWaehrung: 'EUR',
};

function recompute(state: Partial<State>, transaktionen: Transaktion[]): State {
  const wertpapiere = berechneWertpapiere(transaktionen);

  if (state.wertpapiere) {
    for (const [key, wp] of Object.entries(wertpapiere)) {
      const prev = state.wertpapiere[key];
      if (prev) {
        if (prev.kursHistorie?.length) wp.kursHistorie = prev.kursHistorie;
        if (prev.letzterKurs) {
          wp.letzterKurs = prev.letzterKurs;
          wp.letzterKursDatum = prev.letzterKursDatum;
          wp.marktwert = wp.bestand * prev.letzterKurs;
          wp.unrealisierterGewinn = wp.marktwert - wp.investiert;
          wp.unrealisierterGewinnProzent = wp.investiert > 0 ? (wp.unrealisierterGewinn / wp.investiert) * 100 : 0;
        }
        if (prev.uuid) wp.uuid = prev.uuid;
        if (prev.wkn) wp.wkn = prev.wkn;
        if (prev.symbol) wp.symbol = prev.symbol;
        if (prev.feed) wp.feed = prev.feed;
        if (prev.feedUrl) wp.feedUrl = prev.feedUrl;
      }
    }
  }

  const steuerJahre = berechneSteuerJahre(transaktionen);

  return {
    transaktionen,
    wertpapiere,
    steuerJahre,
    konten: state.konten ?? {},
    depots: state.depots ?? {},
    sparplaene: state.sparplaene ?? [],
    taxonomien: state.taxonomien ?? [],
    basisWaehrung: state.basisWaehrung ?? 'EUR',
  };
}

function dedup(txs: Transaktion[]): Transaktion[] {
  return txs.filter((tx, i, arr) =>
    arr.findIndex(t =>
      t.datum.getTime() === tx.datum.getTime() &&
      t.isin === tx.isin &&
      t.stueck === tx.stueck &&
      Math.abs(t.betrag - tx.betrag) < 0.01 &&
      t.typ === tx.typ
    ) === i
  );
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'IMPORT_CSV': {
      const merged = dedup([...state.transaktionen, ...action.transaktionen]);
      return recompute(state, merged);
    }
    case 'IMPORT_XML': {
      const { result } = action;
      const existingIds = new Set(state.transaktionen.map(tx => tx.id));
      const newTx = result.transaktionen.filter(tx => !existingIds.has(tx.id));
      const merged = [...state.transaktionen, ...newTx];

      const wpDaten = { ...state.wertpapiere };
      for (const [key, partial] of result.wertpapierDaten) {
        wpDaten[key] = {
          ...(wpDaten[key] ?? {
            isin: '', name: '', typ: 'Sonstige' as const, waehrung: 'EUR',
            bestand: 0, durchschnittskurs: 0, investiert: 0,
            fifoPosten: [], transaktionen: [], dividendenGesamt: 0, kursHistorie: [],
          }),
          ...partial,
        } as Wertpapier;
      }

      const konten: Record<string, Konto> = { ...state.konten };
      for (const k of result.konten) {
        konten[k.name] = k;
      }

      const depots: Record<string, Depot> = { ...state.depots };
      for (const d of result.depots) {
        depots[d.name] = d;
      }

      const newState = recompute({
        ...state,
        wertpapiere: wpDaten,
        konten,
        depots,
        sparplaene: [...state.sparplaene, ...result.sparplaene],
        taxonomien: result.taxonomien.length > 0 ? result.taxonomien : state.taxonomien,
        basisWaehrung: result.basisWaehrung,
      }, merged);

      return newState;
    }
    case 'UPDATE_KURSE': {
      const wertpapiere = { ...state.wertpapiere };
      for (const [key, info] of Object.entries(action.kurse)) {
        const wp = wertpapiere[key];
        if (wp) {
          wertpapiere[key] = {
            ...wp,
            letzterKurs: info.kurs,
            letzterKursDatum: info.datum,
            marktwert: wp.bestand * info.kurs,
            unrealisierterGewinn: wp.bestand * info.kurs - wp.investiert,
            unrealisierterGewinnProzent: wp.investiert > 0 ? ((wp.bestand * info.kurs - wp.investiert) / wp.investiert) * 100 : 0,
          };
        }
      }
      return { ...state, wertpapiere };
    }
    case 'EDIT_TX': {
      const txs = state.transaktionen.map(tx => tx.id === action.tx.id ? action.tx : tx);
      return recompute(state, txs);
    }
    case 'DELETE_TX': {
      const txs = state.transaktionen.filter(tx => tx.id !== action.id);
      return recompute(state, txs);
    }
    case 'CLEAR':
      return { ...EMPTY };
    case 'LOAD':
      return action.state;
    default:
      return state;
  }
}

// ========== Serialization helpers ==========

interface SerializedData {
  transaktionen: Transaktion[];
  konten: Record<string, Konto>;
  depots: Record<string, Depot>;
  sparplaene: Sparplan[];
  taxonomien: Taxonomie[];
  basisWaehrung: string;
  kursHistorien: Record<string, Array<{ datum: string; kurs: number }>>;
  wpMeta: Record<string, Record<string, string>>;
}

function serializeState(state: State): SerializedData {
  const kursHistorien: Record<string, Array<{ datum: string; kurs: number }>> = {};
  const wpMeta: Record<string, Record<string, string>> = {};
  for (const [key, wp] of Object.entries(state.wertpapiere)) {
    if (wp.kursHistorie?.length) {
      kursHistorien[key] = wp.kursHistorie.map(h => ({ datum: h.datum.toISOString(), kurs: h.kurs }));
    }
    const meta: Record<string, string> = {};
    if (wp.wkn) meta.wkn = wp.wkn;
    if (wp.symbol) meta.symbol = wp.symbol;
    if (wp.uuid) meta.uuid = wp.uuid;
    if (Object.keys(meta).length) wpMeta[key] = meta;
  }

  return {
    transaktionen: state.transaktionen,
    konten: state.konten,
    depots: state.depots,
    sparplaene: state.sparplaene,
    taxonomien: state.taxonomien,
    basisWaehrung: state.basisWaehrung,
    kursHistorien,
    wpMeta,
  };
}

function deserializeState(parsed: Record<string, unknown>): State {
  const transaktionen: Transaktion[] = (parsed.transaktionen as Transaktion[] ?? []).map((tx: Record<string, unknown>) => ({
    ...tx,
    datum: new Date(tx.datum as string),
  })) as Transaktion[];

  const konten: Record<string, Konto> = {};
  if (parsed.konten) {
    for (const [k, v] of Object.entries(parsed.konten as Record<string, Record<string, unknown>>)) {
      konten[k] = {
        ...v,
        transaktionen: ((v.transaktionen as Record<string, unknown>[]) ?? []).map(tx => ({
          ...tx,
          datum: new Date(tx.datum as string),
        })),
      } as Konto;
    }
  }

  const depots: Record<string, Depot> = {};
  if (parsed.depots) {
    for (const [k, v] of Object.entries(parsed.depots as Record<string, Record<string, unknown>>)) {
      depots[k] = {
        ...v,
        transaktionen: ((v.transaktionen as Record<string, unknown>[]) ?? []).map(tx => ({
          ...tx,
          datum: new Date(tx.datum as string),
        })),
      } as Depot;
    }
  }

  const sparplaene: Sparplan[] = (parsed.sparplaene as Sparplan[] ?? []).map((sp: Record<string, unknown>) => ({
    ...sp,
    startDatum: new Date(sp.startDatum as string),
  })) as Sparplan[];

  const wertpapiere = berechneWertpapiere(transaktionen);

  if (parsed.kursHistorien) {
    for (const [key, historie] of Object.entries(parsed.kursHistorien as Record<string, Array<{ datum: string; kurs: number }>>)) {
      const wp = wertpapiere[key];
      if (wp) {
        wp.kursHistorie = historie.map(h => ({ datum: new Date(h.datum), kurs: h.kurs }));
        if (wp.kursHistorie.length > 0) {
          const last = wp.kursHistorie[wp.kursHistorie.length - 1];
          wp.letzterKurs = last.kurs;
          wp.letzterKursDatum = last.datum;
          wp.marktwert = wp.bestand * last.kurs;
          wp.unrealisierterGewinn = wp.marktwert - wp.investiert;
          wp.unrealisierterGewinnProzent = wp.investiert > 0 ? (wp.unrealisierterGewinn / wp.investiert) * 100 : 0;
        }
      }
    }
  }

  if (parsed.wpMeta) {
    for (const [key, meta] of Object.entries(parsed.wpMeta as Record<string, Record<string, string>>)) {
      const wp = wertpapiere[key];
      if (wp) {
        if (meta.wkn) wp.wkn = meta.wkn;
        if (meta.symbol) wp.symbol = meta.symbol;
        if (meta.uuid) wp.uuid = meta.uuid;
      }
    }
  }

  const steuerJahre = berechneSteuerJahre(transaktionen);

  return {
    transaktionen,
    wertpapiere,
    steuerJahre,
    konten,
    depots,
    sparplaene,
    taxonomien: parsed.taxonomien as Taxonomie[] ?? [],
    basisWaehrung: parsed.basisWaehrung as string ?? 'EUR',
  };
}

// ========== Storage: Supabase (primary) + localStorage (fallback) ==========

const STORAGE_KEY = 'etf-portfolio-data';
const SUPABASE_TABLE = 'portfolio_data';
const SUPABASE_ROW_KEY = 'portfolio';

async function loadFromSupabase(): Promise<State | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select('daten')
      .eq('key', SUPABASE_ROW_KEY)
      .single();
    if (error || !data?.daten) return null;
    return deserializeState(data.daten as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function saveToSupabase(state: State): Promise<boolean> {
  if (!supabase) return false;
  try {
    const daten = serializeState(state);
    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .upsert({ key: SUPABASE_ROW_KEY, daten, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    return !error;
  } catch {
    return false;
  }
}

function loadFromLocalStorage(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return deserializeState(parsed);
  } catch {
    return { ...EMPTY };
  }
}

function saveToLocalStorage(state: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(state)));
  } catch {
    // localStorage full or unavailable
  }
}

// ========== Context ==========

interface ContextType {
  state: State;
  importTransaktionen: (tx: Transaktion[]) => void;
  importXML: (result: PPImportResult) => void;
  updateKurse: (kurse: Record<string, { kurs: number; datum: Date }>) => void;
  editTransaktion: (tx: Transaktion) => void;
  deleteTransaktion: (id: string) => void;
  clearAll: () => void;
}

const PortfolioContext = createContext<ContextType | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, loadFromLocalStorage);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  // On mount: try to load from Supabase (async), fall back to localStorage (sync, already done above)
  useEffect(() => {
    loadFromSupabase().then(supaState => {
      if (supaState && supaState.transaktionen.length > 0) {
        dispatch({ type: 'LOAD', state: supaState });
      }
      initialLoadDone.current = true;
    });
  }, []);

  // Debounced save to both Supabase and localStorage
  useEffect(() => {
    if (!initialLoadDone.current) {
      saveToLocalStorage(state);
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToLocalStorage(state);
      saveToSupabase(state);
    }, 1500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  const importTransaktionen = useCallback((tx: Transaktion[]) =>
    dispatch({ type: 'IMPORT_CSV', transaktionen: tx }), []);

  const importXML = useCallback((result: PPImportResult) =>
    dispatch({ type: 'IMPORT_XML', result }), []);

  const updateKurse = useCallback((kurse: Record<string, { kurs: number; datum: Date }>) =>
    dispatch({ type: 'UPDATE_KURSE', kurse }), []);

  const editTransaktion = useCallback((tx: Transaktion) =>
    dispatch({ type: 'EDIT_TX', tx }), []);

  const deleteTransaktion = useCallback((id: string) =>
    dispatch({ type: 'DELETE_TX', id }), []);

  const clearAll = useCallback(() => dispatch({ type: 'CLEAR' }), []);

  return (
    <PortfolioContext.Provider value={{ state, importTransaktionen, importXML, updateKurse, editTransaktion, deleteTransaktion, clearAll }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio muss innerhalb von PortfolioProvider verwendet werden');
  return ctx;
}
