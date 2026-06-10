import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Transaktion, Wertpapier, SteuerJahr } from '../types/portfolio';
import { berechneWertpapiere, berechneSteuerJahre } from '../core/fifo';

interface State {
  transaktionen: Transaktion[];
  wertpapiere: Record<string, Wertpapier>;
  steuerJahre: Record<number, SteuerJahr>;
}

type Action =
  | { type: 'IMPORT'; transaktionen: Transaktion[] }
  | { type: 'CLEAR' }
  | { type: 'LOAD'; state: State };

function recompute(transaktionen: Transaktion[]): State {
  const wertpapiere = berechneWertpapiere(transaktionen);
  const steuerJahre = berechneSteuerJahre(transaktionen);
  return { transaktionen, wertpapiere, steuerJahre };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'IMPORT': {
      const merged = [...state.transaktionen, ...action.transaktionen];
      const unique = merged.filter((tx, i, arr) =>
        arr.findIndex(t =>
          t.datum.getTime() === tx.datum.getTime() &&
          t.isin === tx.isin &&
          t.stueck === tx.stueck &&
          t.betrag === tx.betrag &&
          t.typ === tx.typ
        ) === i
      );
      return recompute(unique);
    }
    case 'CLEAR':
      return recompute([]);
    case 'LOAD':
      return action.state;
    default:
      return state;
  }
}

const STORAGE_KEY = 'etf-portfolio-data';

function loadFromStorage(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return recompute([]);
    const parsed = JSON.parse(raw);
    const transaktionen: Transaktion[] = (parsed.transaktionen ?? []).map((tx: Record<string, unknown>) => ({
      ...tx,
      datum: new Date(tx.datum as string),
    }));
    return recompute(transaktionen);
  } catch {
    return recompute([]);
  }
}

function saveToStorage(state: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      transaktionen: state.transaktionen,
    }));
  } catch {
    // localStorage full or unavailable
  }
}

interface ContextType {
  state: State;
  importTransaktionen: (tx: Transaktion[]) => void;
  clearAll: () => void;
}

const PortfolioContext = createContext<ContextType | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, loadFromStorage);

  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const importTransaktionen = useCallback((tx: Transaktion[]) =>
    dispatch({ type: 'IMPORT', transaktionen: tx }), []);

  const clearAll = useCallback(() => dispatch({ type: 'CLEAR' }), []);

  return (
    <PortfolioContext.Provider value={{ state, importTransaktionen, clearAll }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio muss innerhalb von PortfolioProvider verwendet werden');
  return ctx;
}
