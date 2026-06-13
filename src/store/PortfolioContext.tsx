import { createContext, useContext, useReducer, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Transaktion, Wertpapier, SteuerJahr, Konto, Depot, Sparplan, Taxonomie, Gruppierung, Berichtszeitraum, KursEintrag, Dashboard } from '../types/portfolio';
import { REPORT_PERIODS } from '../components/vermoegenLogic';
import type { PPImportResult } from '../core/xmlParser';
import { berechneWertpapiere, berechneSteuerJahre } from '../core/fifo';
import { supabase } from '../lib/supabase';
import { fetchAlleKurse, fetchLuecken } from '../core/kursApi';
import { fetchECBExchangeRates } from '../core/ecbApi';

interface State {
  transaktionen: Transaktion[];
  wertpapiere: Record<string, Wertpapier>;
  steuerJahre: Record<number, SteuerJahr>;
  konten: Record<string, Konto>;
  depots: Record<string, Depot>;
  sparplaene: Sparplan[];
  taxonomien: Taxonomie[];
  gruppierungen: Gruppierung[];
  berichtszeitraeume: Berichtszeitraum[];
  dashboards: Dashboard[];
  basisWaehrung: string;
}

type Action =
  | { type: 'IMPORT_CSV'; transaktionen: Transaktion[] }
  | { type: 'IMPORT_XML'; result: PPImportResult }
  | { type: 'UPDATE_KURSE'; kurse: Record<string, { kurs: number; datum: Date }> }
  | { type: 'FILL_KURS_HISTORIE'; historien: Record<string, KursEintrag[]> }
  | { type: 'LOAD_ECB_RATES'; rates: Array<{ baseCurrency: string; termCurrency: string; rates: KursEintrag[] }> }
  | { type: 'EDIT_TX'; tx: Transaktion }
  | { type: 'DELETE_TX'; id: string }
  | { type: 'ADD_TX'; txs: Transaktion[] }
  | { type: 'ADD_KONTO'; name: string }
  | { type: 'DELETE_KONTO'; name: string }
  | { type: 'TOGGLE_KONTO_AKTIV'; name: string }
  | { type: 'ADD_DEPOT'; name: string; referenzkontoName: string }
  | { type: 'DELETE_DEPOT'; name: string }
  | { type: 'RENAME_DEPOT'; name: string; neuerName: string }
  | { type: 'SET_DEPOT_REFERENZKONTO'; name: string; referenzkontoName: string }
  | { type: 'TOGGLE_DEPOT_AKTIV'; name: string }
  | { type: 'SET_KONTO_FARBE'; name: string; farbe?: string }
  | { type: 'SET_DEPOT_FARBE'; name: string; farbe?: string }
  | { type: 'UPDATE_TAXONOMIEN'; taxonomien: Taxonomie[] }
  | { type: 'ADD_GRUPPIERUNG'; gruppierung: Gruppierung }
  | { type: 'RENAME_GRUPPIERUNG'; id: string; name: string }
  | { type: 'DELETE_GRUPPIERUNG'; id: string }
  | { type: 'SET_GRUPPIERUNG_NOTIZ'; id: string; notiz: string }
  | { type: 'GRUPPIERUNG_ADD_ELEMENTE'; id: string; kontoNamen: string[]; depotNamen: string[] }
  | { type: 'GRUPPIERUNG_REMOVE_ELEMENT'; id: string; element: { typ: 'konto' | 'depot'; name: string } }
  | { type: 'REORDER_GRUPPIERUNGEN'; ids: string[] }
  | { type: 'ADD_BERICHTSZEITRAUM'; zeitraum: Berichtszeitraum }
  | { type: 'ADD_SPARPLAN'; sparplan: Sparplan }
  | { type: 'UPDATE_SPARPLAN'; id: string; patch: Partial<Sparplan> }
  | { type: 'DELETE_SPARPLAN'; id: string }
  | { type: 'GENERATE_SPARPLAN_TX'; id: string; txs: Transaktion[] }
  | { type: 'UPDATE_WERTPAPIER'; key: string; patch: Partial<Wertpapier> }
  | { type: 'DELETE_WERTPAPIER'; key: string }
  | { type: 'SET_DASHBOARDS'; dashboards: Dashboard[] }
  | { type: 'SET_BASIS_WAEHRUNG'; waehrung: string }
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
  gruppierungen: [],
  berichtszeitraeume: REPORT_PERIODS,
  dashboards: [],
  basisWaehrung: 'EUR',
};

function mergeKursHistorie(a: KursEintrag[], b: KursEintrag[]): KursEintrag[] {
  const dateMap = new Map<string, KursEintrag>();
  for (const k of a) dateMap.set(k.datum.toISOString().slice(0, 10), k);
  for (const k of b) {
    const ds = k.datum.toISOString().slice(0, 10);
    if (!dateMap.has(ds)) dateMap.set(ds, k);
  }
  return [...dateMap.values()].sort((a, b) => a.datum.getTime() - b.datum.getTime());
}

function recompute(state: Partial<State>, transaktionen: Transaktion[]): State {
  const wertpapiere = berechneWertpapiere(transaktionen);

  if (state.wertpapiere) {
    for (const [key, wp] of Object.entries(wertpapiere)) {
      const prev = state.wertpapiere[key];
      if (prev) {
        wp.kursHistorie = mergeKursHistorie(prev.kursHistorie ?? [], wp.kursHistorie ?? []);
        const lastHist = wp.kursHistorie.length ? wp.kursHistorie[wp.kursHistorie.length - 1] : undefined;
        const prevTime = prev.letzterKursDatum?.getTime() ?? 0;
        const histTime = lastHist?.datum.getTime() ?? 0;
        const bestKurs = prevTime >= histTime ? prev.letzterKurs : lastHist?.kurs;
        const bestDatum = prevTime >= histTime ? prev.letzterKursDatum : lastHist?.datum;
        if (bestKurs != null && bestKurs > 0) {
          wp.letzterKurs = bestKurs;
          wp.letzterKursDatum = bestDatum;
          wp.marktwert = wp.bestand * bestKurs;
          wp.unrealisierterGewinn = wp.marktwert - wp.investiert;
          wp.unrealisierterGewinnProzent = wp.investiert > 0 ? (wp.unrealisierterGewinn / wp.investiert) * 100 : 0;
        }
        if (prev.uuid) wp.uuid = prev.uuid;
        if (prev.wkn) wp.wkn = prev.wkn;
        if (prev.symbol) wp.symbol = prev.symbol;
        if (prev.feed) wp.feed = prev.feed;
        if (prev.feedUrl) wp.feedUrl = prev.feedUrl;
        if (prev.coinGeckoId) wp.coinGeckoId = prev.coinGeckoId;
        if (prev.istInaktiv) wp.istInaktiv = prev.istInaktiv;
        if (prev.isExchangeRate) wp.isExchangeRate = prev.isExchangeRate;
        if (prev.targetCurrencyCode) wp.targetCurrencyCode = prev.targetCurrencyCode;
        if (prev.typ) wp.typ = prev.typ;
        if (prev.typFarbe) wp.typFarbe = prev.typFarbe;
        if (prev.notiz) wp.notiz = prev.notiz;
      }
    }
    // PP: Securities ohne Transaktionen (HVPI, ExchangeRates, etc.) behalten
    for (const [key, prev] of Object.entries(state.wertpapiere)) {
      if (!wertpapiere[key]) {
        wertpapiere[key] = prev;
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
    gruppierungen: state.gruppierungen ?? [],
    berichtszeitraeume: state.berichtszeitraeume?.length ? state.berichtszeitraeume : REPORT_PERIODS,
    dashboards: state.dashboards ?? [],
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

// PP AccountListView.updateBalance(): DEPOSIT, INTEREST, DIVIDENDS, TAX_REFUND, SELL, TRANSFER_IN, FEES_REFUND
// addieren; REMOVAL, FEES, INTEREST_CHARGE, TAXES, BUY, TRANSFER_OUT subtrahieren.
export function saldoDelta(tx: Transaktion): number {
  switch (tx.typ) {
    case 'einlage': case 'zinsen': case 'steuererstattung': case 'gebuehrenerstattung': case 'umbuchung_ein':
      return tx.betrag;
    case 'dividende': case 'ausschuettung':
      return tx.betrag - tx.steuern;
    case 'verkauf':
      return tx.betrag - tx.gebuehren - tx.steuern;
    case 'kauf':
      return -(tx.betrag + tx.gebuehren + tx.steuern);
    case 'entnahme': case 'gebuehren': case 'steuern_tx': case 'zinsbelastung': case 'umbuchung_aus':
      return -tx.betrag;
    default:
      return 0;
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'IMPORT_CSV': {
      const merged = dedup([...state.transaktionen, ...action.transaktionen]);
      return recompute(state, merged);
    }
    case 'IMPORT_XML': {
      const { result } = action;

      // --- Transaktionen: XML ist die Wahrheit ---
      // Geänderte TXs aktualisieren, gelöschte entfernen, neue hinzufügen
      const importIdMap = new Map(result.transaktionen.map(tx => [tx.id, tx]));
      const existingIdMap = new Map(state.transaktionen.map(tx => [tx.id, tx]));

      const mergedTx: Transaktion[] = [];
      // Bestehende TXs: aktualisieren wenn im Import vorhanden, behalten wenn nicht (manuell angelegt)
      for (const tx of state.transaktionen) {
        const imported = importIdMap.get(tx.id);
        if (imported) {
          mergedTx.push(imported);
          importIdMap.delete(tx.id);
        } else if (!tx.id.startsWith('xml-')) {
          // Manuell angelegte TXs behalten (haben keine xml- Prefix ID)
          mergedTx.push(tx);
        }
        // xml-TXs die nicht mehr im Import sind → gelöscht in PP → entfernen
      }
      // Neue TXs aus dem Import hinzufügen
      for (const tx of importIdMap.values()) {
        if (!existingIdMap.has(tx.id)) {
          mergedTx.push(tx);
        }
      }

      // --- Wertpapier-Stammdaten: Merge mit Kurshistorie-Zusammenführung ---
      const wpDaten = { ...state.wertpapiere };
      for (const [key, partial] of result.wertpapierDaten) {
        const existing = wpDaten[key];
        if (existing) {
          // Kurshistorie zusammenführen: bestehende (inkl. Yahoo) + neue aus XML
          const existingDates = new Set((existing.kursHistorie ?? []).map(k => k.datum.toISOString().slice(0, 10)));
          const mergedHistorie = [...(existing.kursHistorie ?? [])];
          for (const k of (partial.kursHistorie ?? [])) {
            const ds = k.datum.toISOString().slice(0, 10);
            if (!existingDates.has(ds)) {
              mergedHistorie.push(k);
              existingDates.add(ds);
            }
          }
          mergedHistorie.sort((a, b) => a.datum.getTime() - b.datum.getTime());

          wpDaten[key] = {
            ...existing,
            ...partial,
            kursHistorie: mergedHistorie,
            letzterKurs: existing.letzterKurs ?? partial.letzterKurs,
            letzterKursDatum: existing.letzterKursDatum ?? partial.letzterKursDatum,
          } as Wertpapier;
        } else {
          wpDaten[key] = {
            isin: '', name: '', typ: 'Sonstige' as const, waehrung: 'EUR',
            bestand: 0, durchschnittskurs: 0, investiert: 0,
            fifoPosten: [], transaktionen: [], dividendenGesamt: 0, kursHistorie: [],
            ...partial,
          } as Wertpapier;
        }
      }

      // --- Konten/Depots: XML-Daten übernehmen, Transaktionen mergen ---
      const konten: Record<string, Konto> = {};
      for (const k of result.konten) {
        konten[k.name] = k;
      }

      const depots: Record<string, Depot> = {};
      for (const d of result.depots) {
        depots[d.name] = d;
      }

      // --- Sparpläne: Deduplizieren nach Name+WP ---
      const sparplanKeys = new Set(result.sparplaene.map(s => `${s.name}|${s.wertpapierKey}`));
      const keptSparplaene = state.sparplaene.filter(s => !sparplanKeys.has(`${s.name}|${s.wertpapierKey}`));
      const sparplaene = [...keptSparplaene, ...result.sparplaene];

      const newState = recompute({
        ...state,
        wertpapiere: wpDaten,
        konten,
        depots,
        sparplaene,
        taxonomien: result.taxonomien.length > 0 ? result.taxonomien : state.taxonomien,
        // Gruppierungen aus dem Import übernehmen, falls vorhanden; sonst behalten
        gruppierungen: result.gruppierungen?.length > 0 ? result.gruppierungen : state.gruppierungen,
        berichtszeitraeume: state.berichtszeitraeume?.length ? state.berichtszeitraeume : REPORT_PERIODS,
        basisWaehrung: result.basisWaehrung,
      }, mergedTx);

      return newState;
    }
    case 'UPDATE_KURSE': {
      const wertpapiere = { ...state.wertpapiere };
      for (const [key, info] of Object.entries(action.kurse)) {
        const wp = wertpapiere[key];
        if (wp) {
          // PP: latest wird SEPARAT gespeichert, NICHT in kursHistorie eingefügt.
          // getPricesIncludingLatest() mischt ihn nur temporär für Δ%-Berechnung.
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
    case 'FILL_KURS_HISTORIE': {
      const wertpapiere = { ...state.wertpapiere };
      for (const [key, neueKurse] of Object.entries(action.historien)) {
        const wp = wertpapiere[key];
        if (!wp || neueKurse.length === 0) continue;
        // PP: addPrice() überschreibt existierende Kurse am selben Datum
        const byDate = new Map<string, KursEintrag>();
        for (const k of (wp.kursHistorie ?? [])) {
          byDate.set(k.datum.toISOString().slice(0, 10), k);
        }
        for (const k of neueKurse) {
          byDate.set(k.datum.toISOString().slice(0, 10), k);
        }
        const merged = Array.from(byDate.values()).sort((a, b) => a.datum.getTime() - b.datum.getTime());
        // PP: FILL_KURS_HISTORIE aktualisiert NUR kursHistorie (= prices),
        // NICHT letzterKurs (= latest). latest kommt separat von UPDATE_KURSE.
        wertpapiere[key] = { ...wp, kursHistorie: merged };
      }
      return { ...state, wertpapiere };
    }
    case 'LOAD_ECB_RATES': {
      // PP: ECBExchangeRateProvider liefert ExchangeRate-TimeSeries (EUR→USD etc.)
      const wertpapiere = { ...state.wertpapiere };
      for (const series of action.rates) {
        const key = `ECB/${series.baseCurrency}/${series.termCurrency}`;
        const existing = wertpapiere[key];
        // Merge: bestehende (gecachte) + neue ECB-Kurse
        const byDate = new Map<string, KursEintrag>();
        if (existing?.kursHistorie) {
          for (const k of existing.kursHistorie) byDate.set(k.datum.toISOString().slice(0, 10), k);
        }
        for (const k of series.rates) byDate.set(k.datum.toISOString().slice(0, 10), k);
        const kursHistorie = Array.from(byDate.values()).sort((a, b) => a.datum.getTime() - b.datum.getTime());
        const last = kursHistorie.length > 0 ? kursHistorie[kursHistorie.length - 1] : undefined;
        wertpapiere[key] = {
          ...(existing ?? {
            isin: '', typ: 'Währung' as const, bestand: 0, durchschnittskurs: 0,
            investiert: 0, fifoPosten: [], transaktionen: [], dividendenGesamt: 0,
          }),
          name: `${series.baseCurrency}/${series.termCurrency}`,
          waehrung: series.baseCurrency,
          kursHistorie,
          letzterKurs: last?.kurs,
          letzterKursDatum: last?.datum,
          feed: 'ECB',
          isExchangeRate: true,
          targetCurrencyCode: series.termCurrency,
        };
      }
      return { ...state, wertpapiere };
    }
    case 'EDIT_TX': {
      const old = state.transaktionen.find(tx => tx.id === action.tx.id);
      const txs = state.transaktionen.map(tx => tx.id === action.tx.id ? action.tx : tx);
      // Konten/Depots synchron halten: alte Buchung herausrechnen, neue einrechnen
      const konten = { ...state.konten };
      const depots = { ...state.depots };
      if (old?.kontoName && konten[old.kontoName]) {
        const k = konten[old.kontoName];
        konten[old.kontoName] = { ...k, transaktionen: k.transaktionen.filter(t => t.id !== old.id), saldo: k.saldo - saldoDelta(old) };
      }
      if (old?.depotName && depots[old.depotName]) {
        const d = depots[old.depotName];
        depots[old.depotName] = { ...d, transaktionen: d.transaktionen.filter(t => t.id !== old.id) };
      }
      const neu = action.tx;
      if (neu.kontoName && konten[neu.kontoName]) {
        const k = konten[neu.kontoName];
        konten[neu.kontoName] = { ...k, transaktionen: [...k.transaktionen, neu], saldo: k.saldo + saldoDelta(neu) };
      }
      if (neu.depotName && depots[neu.depotName]) {
        const d = depots[neu.depotName];
        depots[neu.depotName] = { ...d, transaktionen: [...d.transaktionen, neu] };
      }
      return recompute({ ...state, konten, depots }, txs);
    }
    case 'DELETE_TX': {
      const old = state.transaktionen.find(tx => tx.id === action.id);
      const txs = state.transaktionen.filter(tx => tx.id !== action.id);
      const konten = { ...state.konten };
      const depots = { ...state.depots };
      if (old?.kontoName && konten[old.kontoName]) {
        const k = konten[old.kontoName];
        konten[old.kontoName] = { ...k, transaktionen: k.transaktionen.filter(t => t.id !== old.id), saldo: k.saldo - saldoDelta(old) };
      }
      if (old?.depotName && depots[old.depotName]) {
        const d = depots[old.depotName];
        depots[old.depotName] = { ...d, transaktionen: d.transaktionen.filter(t => t.id !== old.id) };
      }
      return recompute({ ...state, konten, depots }, txs);
    }
    case 'ADD_TX': {
      const konten = { ...state.konten };
      const depots = { ...state.depots };
      for (const tx of action.txs) {
        if (tx.kontoName && konten[tx.kontoName]) {
          const k = konten[tx.kontoName];
          konten[tx.kontoName] = { ...k, transaktionen: [...k.transaktionen, tx], saldo: k.saldo + saldoDelta(tx) };
        }
        if (tx.depotName && depots[tx.depotName]) {
          const d = depots[tx.depotName];
          depots[tx.depotName] = { ...d, transaktionen: [...d.transaktionen, tx] };
        }
      }
      return recompute({ ...state, konten, depots }, [...state.transaktionen, ...action.txs]);
    }
    case 'ADD_KONTO': {
      if (state.konten[action.name]) return state;
      const konto: Konto = { name: action.name, waehrung: state.basisWaehrung, saldo: 0, transaktionen: [] };
      return { ...state, konten: { ...state.konten, [action.name]: konto } };
    }
    case 'DELETE_KONTO': {
      // PP: action.setEnabled(account.getTransactions().isEmpty())
      const k = state.konten[action.name];
      if (!k || k.transaktionen.length > 0) return state;
      const { [action.name]: _removedKonto, ...restKonten } = state.konten;
      return { ...state, konten: restKonten };
    }
    case 'TOGGLE_KONTO_AKTIV': {
      const k = state.konten[action.name];
      if (!k) return state;
      return { ...state, konten: { ...state.konten, [action.name]: { ...k, istInaktiv: !k.istInaktiv } } };
    }
    case 'ADD_DEPOT': {
      if (state.depots[action.name]) return state;
      let konten = state.konten;
      // PP PortfolioListView.addNewButton: falls keine Konten existieren, wird
      // ein Konto "Verrechnungskonto" (LabelDefaultReferenceAccountName) angelegt
      if (!konten[action.referenzkontoName]) {
        konten = { ...konten, [action.referenzkontoName]: { name: action.referenzkontoName, waehrung: state.basisWaehrung, saldo: 0, transaktionen: [] } };
      }
      const depot: Depot = { name: action.name, referenzkontoName: action.referenzkontoName, transaktionen: [] };
      return { ...state, konten, depots: { ...state.depots, [action.name]: depot } };
    }
    case 'DELETE_DEPOT': {
      // PP: action.setEnabled(portfolio.getTransactions().isEmpty())
      const d = state.depots[action.name];
      if (!d || d.transaktionen.length > 0) return state;
      const { [action.name]: _removedDepot, ...restDepots } = state.depots;
      return { ...state, depots: restDepots };
    }
    case 'RENAME_DEPOT': {
      const d = state.depots[action.name];
      const neuerName = action.neuerName.trim();
      if (!d || !neuerName || neuerName === action.name) return state;
      if (state.depots[neuerName]) return state; // Name bereits vergeben
      // Depot unter neuem Key ablegen, alten entfernen, Reihenfolge beibehalten
      const depots: Record<string, Depot> = {};
      for (const [k, v] of Object.entries(state.depots)) {
        if (k === action.name) depots[neuerName] = { ...v, name: neuerName };
        else depots[k] = v;
      }
      // depotName in allen Transaktionen aktualisieren (global + im Depot)
      const transaktionen = state.transaktionen.map(tx =>
        tx.depotName === action.name ? { ...tx, depotName: neuerName } : tx);
      depots[neuerName] = {
        ...depots[neuerName],
        transaktionen: depots[neuerName].transaktionen.map(tx =>
          tx.depotName === action.name ? { ...tx, depotName: neuerName } : tx),
      };
      return { ...state, depots, transaktionen };
    }
    case 'SET_DEPOT_REFERENZKONTO': {
      const d = state.depots[action.name];
      if (!d || !state.konten[action.referenzkontoName]) return state;
      return { ...state, depots: { ...state.depots, [action.name]: { ...d, referenzkontoName: action.referenzkontoName } } };
    }
    case 'TOGGLE_DEPOT_AKTIV': {
      const d = state.depots[action.name];
      if (!d) return state;
      return { ...state, depots: { ...state.depots, [action.name]: { ...d, istInaktiv: !d.istInaktiv } } };
    }
    case 'SET_KONTO_FARBE': {
      const k = state.konten[action.name];
      if (!k) return state;
      return { ...state, konten: { ...state.konten, [action.name]: { ...k, farbe: action.farbe } } };
    }
    case 'SET_DEPOT_FARBE': {
      const d = state.depots[action.name];
      if (!d) return state;
      return { ...state, depots: { ...state.depots, [action.name]: { ...d, farbe: action.farbe } } };
    }
    case 'UPDATE_TAXONOMIEN':
      return { ...state, taxonomien: action.taxonomien };
    case 'ADD_GRUPPIERUNG':
      return { ...state, gruppierungen: [...state.gruppierungen, action.gruppierung] };
    case 'RENAME_GRUPPIERUNG': {
      const name = action.name.trim();
      if (!name) return state;
      return { ...state, gruppierungen: state.gruppierungen.map(g => g.id === action.id ? { ...g, name } : g) };
    }
    case 'DELETE_GRUPPIERUNG':
      return { ...state, gruppierungen: state.gruppierungen.filter(g => g.id !== action.id) };
    case 'SET_GRUPPIERUNG_NOTIZ':
      return { ...state, gruppierungen: state.gruppierungen.map(g => g.id === action.id ? { ...g, notiz: action.notiz } : g) };
    case 'GRUPPIERUNG_ADD_ELEMENTE':
      return {
        ...state,
        gruppierungen: state.gruppierungen.map(g => g.id === action.id ? {
          ...g,
          kontoNamen: [...new Set([...g.kontoNamen, ...action.kontoNamen])],
          depotNamen: [...new Set([...g.depotNamen, ...action.depotNamen])],
        } : g),
      };
    case 'GRUPPIERUNG_REMOVE_ELEMENT':
      return {
        ...state,
        gruppierungen: state.gruppierungen.map(g => g.id === action.id ? {
          ...g,
          kontoNamen: action.element.typ === 'konto' ? g.kontoNamen.filter(n => n !== action.element.name) : g.kontoNamen,
          depotNamen: action.element.typ === 'depot' ? g.depotNamen.filter(n => n !== action.element.name) : g.depotNamen,
        } : g),
      };
    case 'REORDER_GRUPPIERUNGEN': {
      const byId = new Map(state.gruppierungen.map(g => [g.id, g]));
      const reordered = action.ids.map(id => byId.get(id)).filter((g): g is Gruppierung => !!g);
      // etwaige nicht in ids enthaltene am Ende anhängen (Robustheit)
      for (const g of state.gruppierungen) if (!action.ids.includes(g.id)) reordered.push(g);
      return { ...state, gruppierungen: reordered };
    }
    case 'ADD_BERICHTSZEITRAUM': {
      if (state.berichtszeitraeume.some(z => z.key === action.zeitraum.key)) return state;
      return { ...state, berichtszeitraeume: [...state.berichtszeitraeume, action.zeitraum] };
    }
    case 'ADD_SPARPLAN':
      return { ...state, sparplaene: [...state.sparplaene, action.sparplan] };
    case 'UPDATE_SPARPLAN':
      return { ...state, sparplaene: state.sparplaene.map(s => s.id === action.id ? { ...s, ...action.patch } : s) };
    case 'DELETE_SPARPLAN':
      return { ...state, sparplaene: state.sparplaene.filter(s => s.id !== action.id) };
    case 'GENERATE_SPARPLAN_TX': {
      // neue Buchungen anhängen (Duplikate per ID vermeiden) und neu berechnen
      const existingIds = new Set(state.transaktionen.map(t => t.id));
      const neu = action.txs.filter(t => !existingIds.has(t.id));
      if (neu.length === 0) return state;
      return recompute(state, [...state.transaktionen, ...neu]);
    }
    case 'UPDATE_WERTPAPIER': {
      const wp = state.wertpapiere[action.key];
      if (!wp) return state;
      return { ...state, wertpapiere: { ...state.wertpapiere, [action.key]: { ...wp, ...action.patch } } };
    }
    case 'DELETE_WERTPAPIER': {
      const wp = state.wertpapiere[action.key];
      if (!wp || wp.transaktionen.length > 0) return state;
      const { [action.key]: _, ...rest } = state.wertpapiere;
      return { ...state, wertpapiere: rest };
    }
    case 'SET_DASHBOARDS':
      return { ...state, dashboards: action.dashboards };
    case 'SET_BASIS_WAEHRUNG':
      return { ...state, basisWaehrung: action.waehrung };
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
  gruppierungen: Gruppierung[];
  berichtszeitraeume: Berichtszeitraum[];
  dashboards: Dashboard[];
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
    if (wp.name) meta.name = wp.name;
    if (wp.waehrung && wp.waehrung !== 'EUR') meta.waehrung = wp.waehrung;
    if (wp.isin) meta.isin = wp.isin;
    if (wp.wkn) meta.wkn = wp.wkn;
    if (wp.symbol) meta.symbol = wp.symbol;
    if (wp.uuid) meta.uuid = wp.uuid;
    if (wp.istInaktiv) meta.istInaktiv = 'true';
    if (wp.isExchangeRate) meta.isExchangeRate = 'true';
    if (wp.targetCurrencyCode) meta.targetCurrencyCode = wp.targetCurrencyCode;
    if (wp.typ) meta.typ = wp.typ;
    if (wp.typFarbe) meta.typFarbe = wp.typFarbe;
    if (wp.feed) meta.feed = wp.feed;
    if (wp.feedUrl) meta.feedUrl = wp.feedUrl;
    if (wp.coinGeckoId) meta.coinGeckoId = wp.coinGeckoId;
    if (wp.notiz) meta.notiz = wp.notiz;
    if (Object.keys(meta).length) wpMeta[key] = meta;
  }

  return {
    transaktionen: state.transaktionen,
    konten: state.konten,
    depots: state.depots,
    sparplaene: state.sparplaene,
    taxonomien: state.taxonomien,
    gruppierungen: state.gruppierungen,
    berichtszeitraeume: state.berichtszeitraeume,
    dashboards: state.dashboards,
    basisWaehrung: state.basisWaehrung,
    kursHistorien,
    wpMeta,
  };
}

function deserializeState(parsed: Record<string, unknown>): State {
  const transaktionen: Transaktion[] = ((parsed.transaktionen ?? []) as Record<string, unknown>[]).map(tx => ({
    ...tx,
    datum: new Date(tx.datum as string),
  })) as Transaktion[];

  const konten: Record<string, Konto> = {};
  if (parsed.konten) {
    for (const [k, v] of Object.entries(parsed.konten as Record<string, Record<string, unknown>>)) {
      const txs = ((v.transaktionen as Record<string, unknown>[]) ?? []).map(tx => ({
        ...tx,
        datum: new Date(tx.datum as string),
      })) as Transaktion[];
      konten[k] = { ...v, transaktionen: txs } as Konto;
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

  const sparplaene: Sparplan[] = ((parsed.sparplaene ?? []) as Record<string, unknown>[]).map((sp, i) => ({
    // Defaults für ältere gespeicherte Sparpläne ohne die neuen Felder
    id: (sp.id as string) || `sp-${i}`,
    planTyp: (sp.planTyp as Sparplan['planTyp']) || (sp.wertpapierKey ? 'kauf' : 'einzahlung'),
    gebuehren: (sp.gebuehren as number) ?? 0,
    steuern: (sp.steuern as number) ?? 0,
    autoGenerate: (sp.autoGenerate as boolean) ?? (sp.aktiv as boolean) ?? true,
    ...sp,
    startDatum: new Date(sp.startDatum as string),
  })) as Sparplan[];

  const wertpapiere = berechneWertpapiere(transaktionen);

  // Securities ohne Transaktionen (HVPI, ExchangeRates etc.) aus wpMeta/kursHistorien wiederherstellen
  const allWpKeys = new Set<string>();
  if (parsed.kursHistorien) for (const key of Object.keys(parsed.kursHistorien as Record<string, unknown>)) allWpKeys.add(key);
  if (parsed.wpMeta) for (const key of Object.keys(parsed.wpMeta as Record<string, unknown>)) allWpKeys.add(key);
  for (const key of allWpKeys) {
    if (!wertpapiere[key]) {
      wertpapiere[key] = {
        isin: key.length === 12 ? key : '', name: key, typ: 'Sonstige',
        waehrung: 'EUR', bestand: 0, durchschnittskurs: 0, investiert: 0,
        fifoPosten: [], transaktionen: [], dividendenGesamt: 0, kursHistorie: [],
      };
    }
  }

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
        if (meta.istInaktiv) wp.istInaktiv = true;
        if (meta.isExchangeRate) wp.isExchangeRate = true;
        if (meta.targetCurrencyCode) wp.targetCurrencyCode = meta.targetCurrencyCode;
        if (meta.typ) wp.typ = meta.typ as Wertpapier['typ'];
        if (meta.typFarbe) wp.typFarbe = meta.typFarbe;
        if (meta.feed) wp.feed = meta.feed;
        if (meta.feedUrl) wp.feedUrl = meta.feedUrl;
        if (meta.coinGeckoId) wp.coinGeckoId = meta.coinGeckoId;
        if (meta.notiz) wp.notiz = meta.notiz;
        if (meta.name) wp.name = meta.name;
        if (meta.isin) wp.isin = meta.isin;
        if (meta.waehrung) wp.waehrung = meta.waehrung;
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
    gruppierungen: parsed.gruppierungen as Gruppierung[] ?? [],
    berichtszeitraeume: (parsed.berichtszeitraeume as Berichtszeitraum[])?.length ? parsed.berichtszeitraeume as Berichtszeitraum[] : REPORT_PERIODS,
    dashboards: parsed.dashboards as Dashboard[] ?? [],
    basisWaehrung: parsed.basisWaehrung as string ?? 'EUR',
  };
}

// ========== Storage: IndexedDB (primary) + localStorage (migration) + Supabase (sync) ==========

const STORAGE_KEY = 'etf-portfolio-data';
const IDB_NAME = 'etf-portfolio-db';
const IDB_STORE = 'state';
const IDB_KEY = 'portfolio';
const SUPABASE_TABLE = 'portfolio_data';
const SUPABASE_ROW_KEY = 'portfolio';

async function clearSupabase(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from(SUPABASE_TABLE).delete().neq('key', '___never___');
  if (error) console.warn('[Supabase] Fehler beim Löschen:', error.message);
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIDB(): Promise<State | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => {
        db.close();
        if (!req.result) { resolve(null); return; }
        try {
          resolve(deserializeState(req.result as Record<string, unknown>));
        } catch { resolve(null); }
      };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch {
    return null;
  }
}

async function saveToIDB(state: State): Promise<boolean> {
  try {
    const db = await openIDB();
    const data = serializeState(state);
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(data, IDB_KEY);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
    });
  } catch {
    return false;
  }
}

async function loadFromSupabase(): Promise<State | null> {
  if (!supabase) { console.warn('[Supabase] Client ist null — kann nicht laden'); return null; }
  try {
    const { data: allRows, error } = await supabase
      .from(SUPABASE_TABLE)
      .select('key, daten');
    if (error) {
      console.error('[Supabase] Laden fehlgeschlagen:', error.message, error.code, error.details);
      return null;
    }
    if (!allRows?.length) { console.warn('[Supabase] Keine Daten in der Tabelle gefunden'); return null; }
    const metaRow = allRows.find(r => r.key === 'meta');
    if (!metaRow?.daten) { console.warn('[Supabase] Meta-Zeile nicht gefunden'); return null; }
    const transaktionen: unknown[] = [];
    const kursHistorien: Record<string, Array<{ datum: string; kurs: number }>> = {};
    for (const row of allRows) {
      if (typeof row.key === 'string' && row.key.startsWith('tx_') && Array.isArray(row.daten)) {
        transaktionen.push(...row.daten);
      }
      if (typeof row.key === 'string' && row.key.startsWith('kurse_') && row.daten) {
        Object.assign(kursHistorien, row.daten);
      }
    }
    const combined = { ...(metaRow.daten as Record<string, unknown>), transaktionen, kursHistorien };
    console.log(`[Supabase] Daten geladen: ${transaktionen.length} Transaktionen, ${Object.keys(kursHistorien).length} Kurshistorien`);
    return deserializeState(combined);
  } catch (e) {
    console.error('[Supabase] Netzwerk-/Verbindungsfehler beim Laden:', e);
    return null;
  }
}

async function saveToSupabase(state: State): Promise<boolean> {
  if (!supabase) { console.warn('[Supabase] Client ist null — Daten werden NICHT in die Cloud gespeichert'); return false; }
  try {
    const full = serializeState(state);
    const { kursHistorien, transaktionen, ...meta } = full;
    const now = new Date().toISOString();
    const upsert = async (key: string, daten: unknown) => {
      const { error } = await supabase.from(SUPABASE_TABLE)
        .upsert({ key, daten, updated_at: now }, { onConflict: 'key' });
      if (error) { console.error(`[Supabase] Chunk "${key}" fehlgeschlagen:`, error.message); return false; }
      return true;
    };

    const slimKonten: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta.konten || {})) {
      const { transaktionen: _t, ...rest } = v as Record<string, unknown>;
      slimKonten[k] = rest;
    }
    const slimDepots: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta.depots || {})) {
      const { transaktionen: _t, ...rest } = v as Record<string, unknown>;
      slimDepots[k] = rest;
    }
    const slimMeta = { ...meta, konten: slimKonten, depots: slimDepots };

    if (!await upsert('meta', slimMeta)) return false;
    console.log('[Supabase] Meta gespeichert (Konten, Depots, Taxonomien, WP-Meta)');

    const TX_CHUNK = 5000;
    const txChunks = Math.ceil(transaktionen.length / TX_CHUNK);
    for (let i = 0; i < transaktionen.length; i += TX_CHUNK) {
      await upsert(`tx_${i}`, transaktionen.slice(i, i + TX_CHUNK));
    }
    console.log(`[Supabase] ${transaktionen.length} Transaktionen in ${txChunks} Chunks gespeichert`);

    const kursKeys = Object.keys(kursHistorien);
    const KURS_CHUNK = 5;
    for (let i = 0; i < kursKeys.length; i += KURS_CHUNK) {
      const chunk: Record<string, Array<{ datum: string; kurs: number }>> = {};
      for (const k of kursKeys.slice(i, i + KURS_CHUNK)) chunk[k] = kursHistorien[k];
      await upsert(`kurse_${i}`, chunk);
    }
    console.log(`[Supabase] ${kursKeys.length} Kurshistorien in ${Math.ceil(kursKeys.length / KURS_CHUNK)} Chunks gespeichert`);

    await upsert(SUPABASE_ROW_KEY, { txChunks, kursChunks: Math.ceil(kursKeys.length / KURS_CHUNK), kursChunkSize: KURS_CHUNK, txChunkSize: TX_CHUNK });
    console.log('[Supabase] Alle Daten erfolgreich gespeichert');
    return true;
  } catch (e) {
    console.error('[Supabase] Netzwerk-/Verbindungsfehler beim Speichern:', e);
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

let lsFullWarned = false;
function saveToLocalStorage(state: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(state)));
  } catch {
    if (!lsFullWarned) { lsFullWarned = true; console.warn('localStorage voll — Daten werden nur in IndexedDB gespeichert.'); }
  }
}

// ========== Context ==========

interface ContextType {
  state: State;
  importTransaktionen: (tx: Transaktion[]) => void;
  importXML: (result: PPImportResult) => void;
  updateKurse: (kurse: Record<string, { kurs: number; datum: Date }>) => void;
  refreshKurse: () => Promise<void>;
  kursRefreshInterval: number;
  setKursRefreshInterval: (minutes: number) => void;
  isRefreshingKurse: boolean;
  lastKursRefresh: Date | null;
  editTransaktion: (tx: Transaktion) => void;
  deleteTransaktion: (id: string) => void;
  addTransaktionen: (txs: Transaktion[]) => void;
  addKonto: () => string;
  deleteKonto: (name: string) => void;
  toggleKontoAktiv: (name: string) => void;
  addDepot: () => string;
  deleteDepot: (name: string) => void;
  renameDepot: (name: string, neuerName: string) => void;
  setDepotReferenzkonto: (name: string, referenzkontoName: string) => void;
  toggleDepotAktiv: (name: string) => void;
  setKontoFarbe: (name: string, farbe?: string) => void;
  setDepotFarbe: (name: string, farbe?: string) => void;
  updateTaxonomien: (taxonomien: Taxonomie[]) => void;
  addGruppierung: (gruppierung: Gruppierung) => void;
  renameGruppierung: (id: string, name: string) => void;
  deleteGruppierung: (id: string) => void;
  setGruppierungNotiz: (id: string, notiz: string) => void;
  gruppierungAddElemente: (id: string, kontoNamen: string[], depotNamen: string[]) => void;
  gruppierungRemoveElement: (id: string, element: { typ: 'konto' | 'depot'; name: string }) => void;
  reorderGruppierungen: (ids: string[]) => void;
  addBerichtszeitraum: (zeitraum: Berichtszeitraum) => void;
  addSparplan: (sparplan: Sparplan) => void;
  updateSparplan: (id: string, patch: Partial<Sparplan>) => void;
  deleteSparplan: (id: string) => void;
  generateSparplanTx: (id: string, txs: Transaktion[]) => void;
  updateWertpapier: (key: string, patch: Partial<Wertpapier>) => void;
  deleteWertpapier: (key: string) => void;
  clearAll: () => void;
  resetAll: () => Promise<void>;
}

const PortfolioContext = createContext<ContextType | null>(null);

const KURS_INTERVAL_KEY = 'pp-kurs-refresh-interval';

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, loadFromLocalStorage);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);
  const skipNextSave = useRef(false);
  const kursFetchDone = useRef(false);
  const lueckenDone = useRef(false);
  const lastWpCount = useRef(0);
  const [isRefreshingKurse, setIsRefreshingKurse] = useState(false);
  const [lastKursRefresh, setLastKursRefresh] = useState<Date | null>(null);
  const [kursRefreshInterval, setKursRefreshIntervalState] = useState(() => {
    try { return parseInt(localStorage.getItem(KURS_INTERVAL_KEY) ?? '0') || 0; } catch { return 0; }
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load: IndexedDB (primary) → Supabase (cloud sync) → localStorage (legacy migration)
  useEffect(() => {
    (async () => {
      try {
        // 1. IndexedDB — primärer lokaler Speicher
        const idbState = await loadFromIDB();
        if (idbState && idbState.transaktionen.length > 0) {
          console.log(`[Laden] IndexedDB: ${idbState.transaktionen.length} Transaktionen, ${Object.keys(idbState.wertpapiere).length} Wertpapiere`);
          skipNextSave.current = true;
          dispatch({ type: 'LOAD', state: idbState });
          initialLoadDone.current = true;
          return;
        }
        console.log('[Laden] IndexedDB leer — versuche Supabase...');

        // 2. Supabase — Cloud-Sync
        const supaState = await loadFromSupabase();
        if (supaState && supaState.transaktionen.length > 0) {
          console.log(`[Laden] Supabase: ${supaState.transaktionen.length} Transaktionen, ${Object.keys(supaState.wertpapiere).length} Wertpapiere`);
          skipNextSave.current = true;
          dispatch({ type: 'LOAD', state: supaState });
          initialLoadDone.current = true;
          return;
        }
        console.log('[Laden] Supabase leer — versuche localStorage...');

        // 3. localStorage — Legacy-Migration (einmalig)
        const lsState = loadFromLocalStorage();
        if (lsState.transaktionen.length > 0) {
          console.log(`[Laden] localStorage: ${lsState.transaktionen.length} Transaktionen`);
          skipNextSave.current = true;
          dispatch({ type: 'LOAD', state: lsState });
          await saveToIDB(lsState);
        } else {
          console.warn('[Laden] KEINE Daten in IndexedDB, Supabase oder localStorage gefunden!');
        }
      } catch (e) {
        console.error('[Laden] Fehler beim Laden:', e);
      } finally {
        initialLoadDone.current = true;
      }
    })();
  }, []);

  // Automatischer Kurs-Fetch: beim Start und wenn neue Wertpapiere dazukommen (z.B. nach Import)
  useEffect(() => {
    const wpKeys = Object.keys(state.wertpapiere);
    if (wpKeys.length === 0) return;

    // Nur fetchen wenn: (a) noch nie gefetcht ODER (b) neue WPs dazugekommen
    if (kursFetchDone.current && wpKeys.length === lastWpCount.current) return;
    kursFetchDone.current = true;
    lastWpCount.current = wpKeys.length;

    const wpMap: Record<string, { isin: string; symbol?: string; name: string; feed?: string; waehrung?: string; coinGeckoId?: string }> = {};
    for (const [key, wp] of Object.entries(state.wertpapiere)) {
      if (wp.bestand > 0 && !wp.isExchangeRate) {
        wpMap[key] = { isin: wp.isin, symbol: wp.symbol, name: wp.name, feed: wp.feed, waehrung: wp.waehrung, coinGeckoId: wp.coinGeckoId };
      }
    }

    if (Object.keys(wpMap).length === 0) return;

    setIsRefreshingKurse(true);
    fetchAlleKurse(wpMap).then(kurse => {
      if (Object.keys(kurse).length > 0) {
        dispatch({ type: 'UPDATE_KURSE', kurse });
      }
      setLastKursRefresh(new Date());
    }).catch(() => {}).finally(() => setIsRefreshingKurse(false));

    // Kurshistorie-Lücken füllen (nur beim ersten Fetch)
    if (!lueckenDone.current) {
      lueckenDone.current = true;
      const lueckenMap: Record<string, { isin: string; symbol?: string; name: string; feed?: string; waehrung?: string; coinGeckoId?: string; letzterHistKursDatum?: Date }> = {};
      for (const [key, wp] of Object.entries(state.wertpapiere)) {
        if (wp.bestand > 0 && !wp.isExchangeRate) {
          const lastHist = wp.kursHistorie?.length ? wp.kursHistorie[wp.kursHistorie.length - 1].datum : undefined;
          lueckenMap[key] = { isin: wp.isin, symbol: wp.symbol, name: wp.name, feed: wp.feed, waehrung: wp.waehrung, coinGeckoId: wp.coinGeckoId, letzterHistKursDatum: lastHist };
        }
      }
      fetchLuecken(lueckenMap).then(historien => {
        if (Object.keys(historien).length > 0) {
          console.log(`[Kurse] Lücken gefüllt für ${Object.keys(historien).length} Wertpapiere`);
          dispatch({ type: 'FILL_KURS_HISTORIE', historien });
        }
      }).catch(() => {});
    }
  }, [state.wertpapiere]);

  // PP: ECBExchangeRateProvider — Wechselkurse von der EZB laden
  // PP lädt alle ECB-Kurse immer, nicht nur verwendete Währungen
  const ecbDone = useRef(false);
  useEffect(() => {
    if (ecbDone.current) return;
    if (Object.keys(state.wertpapiere).length === 0) return;
    ecbDone.current = true;

    fetchECBExchangeRates().then(rates => {
      if (rates.length > 0) {
        console.log(`[ECB] ${rates.length} Wechselkurse geladen: ${rates.map(r => r.termCurrency).join(', ')}`);
        dispatch({ type: 'LOAD_ECB_RATES', rates });
      }
    }).catch(e => console.warn('[ECB] Fehler:', e));
  }, [state.wertpapiere]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    if (state.transaktionen.length === 0) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // IndexedDB = primär (kein 5MB-Limit), localStorage = Fallback, Supabase = Cloud-Sync
      saveToIDB(state);
      saveToLocalStorage(state);
      saveToSupabase(state);
    }, 1500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  const importTransaktionen = useCallback((tx: Transaktion[]) =>
    dispatch({ type: 'IMPORT_CSV', transaktionen: tx }), []);

  const importXML = useCallback((result: PPImportResult) => {
    dispatch({ type: 'IMPORT_XML', result });
    // Nach XML-Import: erneuter Kurs-Fetch erzwingen
    kursFetchDone.current = false;
  }, []);

  const updateKurse = useCallback((kurse: Record<string, { kurs: number; datum: Date }>) =>
    dispatch({ type: 'UPDATE_KURSE', kurse }), []);

  const editTransaktion = useCallback((tx: Transaktion) =>
    dispatch({ type: 'EDIT_TX', tx }), []);

  const deleteTransaktion = useCallback((id: string) =>
    dispatch({ type: 'DELETE_TX', id }), []);

  const addTransaktionen = useCallback((txs: Transaktion[]) =>
    dispatch({ type: 'ADD_TX', txs }), []);

  // PP AccountListView.addNewButton: account.setName(Messages.LabelNoName = "Ohne Namen")
  const addKonto = useCallback(() => {
    let name = 'Ohne Namen';
    let i = 2;
    while (state.konten[name]) name = `Ohne Namen (${i++})`;
    dispatch({ type: 'ADD_KONTO', name });
    return name;
  }, [state.konten]);

  const deleteKonto = useCallback((name: string) =>
    dispatch({ type: 'DELETE_KONTO', name }), []);

  const toggleKontoAktiv = useCallback((name: string) =>
    dispatch({ type: 'TOGGLE_KONTO_AKTIV', name }), []);

  // PP PortfolioListView.addNewButton: portfolio.setName(LabelNoName);
  // referenceAccount = erstes Konto, sonst neues Konto "Verrechnungskonto"
  const addDepot = useCallback(() => {
    let name = 'Ohne Namen';
    let i = 2;
    while (state.depots[name]) name = `Ohne Namen (${i++})`;
    const referenzkontoName = Object.keys(state.konten)[0] ?? 'Verrechnungskonto';
    dispatch({ type: 'ADD_DEPOT', name, referenzkontoName });
    return name;
  }, [state.depots, state.konten]);

  const deleteDepot = useCallback((name: string) =>
    dispatch({ type: 'DELETE_DEPOT', name }), []);

  const renameDepot = useCallback((name: string, neuerName: string) =>
    dispatch({ type: 'RENAME_DEPOT', name, neuerName }), []);

  const setDepotReferenzkonto = useCallback((name: string, referenzkontoName: string) =>
    dispatch({ type: 'SET_DEPOT_REFERENZKONTO', name, referenzkontoName }), []);

  const toggleDepotAktiv = useCallback((name: string) =>
    dispatch({ type: 'TOGGLE_DEPOT_AKTIV', name }), []);

  const setKontoFarbe = useCallback((name: string, farbe?: string) =>
    dispatch({ type: 'SET_KONTO_FARBE', name, farbe }), []);

  const setDepotFarbe = useCallback((name: string, farbe?: string) =>
    dispatch({ type: 'SET_DEPOT_FARBE', name, farbe }), []);

  const updateTaxonomien = useCallback((taxonomien: Taxonomie[]) =>
    dispatch({ type: 'UPDATE_TAXONOMIEN', taxonomien }), []);

  const addGruppierung = useCallback((gruppierung: Gruppierung) =>
    dispatch({ type: 'ADD_GRUPPIERUNG', gruppierung }), []);
  const renameGruppierung = useCallback((id: string, name: string) =>
    dispatch({ type: 'RENAME_GRUPPIERUNG', id, name }), []);
  const deleteGruppierung = useCallback((id: string) =>
    dispatch({ type: 'DELETE_GRUPPIERUNG', id }), []);
  const setGruppierungNotiz = useCallback((id: string, notiz: string) =>
    dispatch({ type: 'SET_GRUPPIERUNG_NOTIZ', id, notiz }), []);
  const gruppierungAddElemente = useCallback((id: string, kontoNamen: string[], depotNamen: string[]) =>
    dispatch({ type: 'GRUPPIERUNG_ADD_ELEMENTE', id, kontoNamen, depotNamen }), []);
  const gruppierungRemoveElement = useCallback((id: string, element: { typ: 'konto' | 'depot'; name: string }) =>
    dispatch({ type: 'GRUPPIERUNG_REMOVE_ELEMENT', id, element }), []);
  const reorderGruppierungen = useCallback((ids: string[]) =>
    dispatch({ type: 'REORDER_GRUPPIERUNGEN', ids }), []);
  const addBerichtszeitraum = useCallback((zeitraum: Berichtszeitraum) =>
    dispatch({ type: 'ADD_BERICHTSZEITRAUM', zeitraum }), []);
  const addSparplan = useCallback((sparplan: Sparplan) =>
    dispatch({ type: 'ADD_SPARPLAN', sparplan }), []);
  const updateSparplan = useCallback((id: string, patch: Partial<Sparplan>) =>
    dispatch({ type: 'UPDATE_SPARPLAN', id, patch }), []);
  const deleteSparplan = useCallback((id: string) =>
    dispatch({ type: 'DELETE_SPARPLAN', id }), []);
  const generateSparplanTx = useCallback((id: string, txs: Transaktion[]) =>
    dispatch({ type: 'GENERATE_SPARPLAN_TX', id, txs }), []);

  const updateWertpapier = useCallback((key: string, patch: Partial<Wertpapier>) =>
    dispatch({ type: 'UPDATE_WERTPAPIER', key, patch }), []);

  const deleteWertpapier = useCallback((key: string) =>
    dispatch({ type: 'DELETE_WERTPAPIER', key }), []);

  const setDashboards = useCallback((dashboards: Dashboard[]) =>
    dispatch({ type: 'SET_DASHBOARDS', dashboards }), []);

  const setBasisWaehrung = useCallback((waehrung: string) =>
    dispatch({ type: 'SET_BASIS_WAEHRUNG', waehrung }), []);

  const clearAll = useCallback(async () => {
    dispatch({ type: 'CLEAR' });
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    try {
      const db = await openIDB();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      await new Promise<void>((resolve) => { tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); resolve(); }; });
    } catch {}
    try { await clearSupabase(); } catch {}
    kursFetchDone.current = false;
    lastWpCount.current = 0;
  }, []);

  const doRefreshKurse = useCallback(async () => {
    const wpMap: Record<string, { isin: string; symbol?: string; name: string; feed?: string; waehrung?: string; coinGeckoId?: string }> = {};
    for (const [key, wp] of Object.entries(state.wertpapiere)) {
      if (wp.bestand > 0 && !wp.isExchangeRate) {
        wpMap[key] = { isin: wp.isin, symbol: wp.symbol, name: wp.name, feed: wp.feed, waehrung: wp.waehrung, coinGeckoId: wp.coinGeckoId };
      }
    }
    if (Object.keys(wpMap).length === 0) return;
    setIsRefreshingKurse(true);
    try {
      const kurse = await fetchAlleKurse(wpMap);
      if (Object.keys(kurse).length > 0) {
        dispatch({ type: 'UPDATE_KURSE', kurse });
      }
      // Auch Kurshistorie der letzten 7 Tage aktualisieren (überschreibt alte gerundete Werte)
      const lueckenMap: Record<string, { isin: string; symbol?: string; name: string; feed?: string; waehrung?: string; coinGeckoId?: string; letzterHistKursDatum?: Date }> = {};
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
      for (const [key, wp] of Object.entries(state.wertpapiere)) {
        if (wp.bestand > 0 && !wp.isExchangeRate) {
          lueckenMap[key] = { isin: wp.isin, symbol: wp.symbol, name: wp.name, feed: wp.feed, waehrung: wp.waehrung, coinGeckoId: wp.coinGeckoId, letzterHistKursDatum: sevenDaysAgo };
        }
      }
      const historien = await fetchLuecken(lueckenMap);
      if (Object.keys(historien).length > 0) {
        dispatch({ type: 'FILL_KURS_HISTORIE', historien });
      }
      setLastKursRefresh(new Date());
    } catch { /* */ }
    setIsRefreshingKurse(false);
  }, [state.wertpapiere]);

  const setKursRefreshInterval = useCallback((minutes: number) => {
    setKursRefreshIntervalState(minutes);
    try { localStorage.setItem(KURS_INTERVAL_KEY, String(minutes)); } catch { /* */ }
  }, []);

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (kursRefreshInterval > 0) {
      intervalRef.current = setInterval(() => { doRefreshKurse(); }, kursRefreshInterval * 60 * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [kursRefreshInterval, doRefreshKurse]);

  const resetAll = useCallback(async () => {
    await clearAll();
  }, [clearAll]);

  return (
    <PortfolioContext.Provider value={{ state, importTransaktionen, importXML, updateKurse, refreshKurse: doRefreshKurse, kursRefreshInterval, setKursRefreshInterval, isRefreshingKurse, lastKursRefresh, editTransaktion, deleteTransaktion, addTransaktionen, addKonto, deleteKonto, toggleKontoAktiv, addDepot, deleteDepot, renameDepot, setDepotReferenzkonto, toggleDepotAktiv, setKontoFarbe, setDepotFarbe, updateTaxonomien, addGruppierung, renameGruppierung, deleteGruppierung, setGruppierungNotiz, gruppierungAddElemente, gruppierungRemoveElement, reorderGruppierungen, addBerichtszeitraum, addSparplan, updateSparplan, deleteSparplan, generateSparplanTx, updateWertpapier, deleteWertpapier, setDashboards, setBasisWaehrung, clearAll, resetAll }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio muss innerhalb von PortfolioProvider verwendet werden');
  return ctx;
}
