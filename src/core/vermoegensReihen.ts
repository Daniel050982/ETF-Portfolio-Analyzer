/* Zeitreihen-Datenreihen für das Vermögensaufstellung-Diagramm
   (PP StatementOfAssetsSeriesBuilder + DataSeriesSet.buildStatementOfAssetsDataSeries).

   Liefert für ein gemeinsames Datums-Raster die Werte aller 19 PP-Datenreihen.
   Snapshot-basierte Reihen (Gesamtsumme, investiertes Kapital, Delta) kommen aus
   berechneSnapshots; buchungsbasierte (Einlagen/Entnahmen, Dividenden, Zinsen,
   Zinsbelastung, Erträge, Steuern, Gebühren) werden je Tag aus den Transaktionen
   aggregiert und zusätzlich akkumuliert. */
import type { Transaktion, Wertpapier } from '../types/portfolio';
import { berechneSnapshots } from './performance';

/* IDs der 19 Datenreihen (= PP ClientDataSeries für STATEMENT_OF_ASSETS). */
export type ReihenId =
  | 'TOTALS'
  | 'TRANSFERALS' | 'TRANSFERALS_ACCUMULATED'
  | 'INVESTED_CAPITAL' | 'ABSOLUTE_INVESTED_CAPITAL'
  | 'ABSOLUTE_DELTA' | 'ABSOLUTE_DELTA_ALL_RECORDS'
  | 'TAXES' | 'TAXES_ACCUMULATED'
  | 'DIVIDENDS' | 'DIVIDENDS_ACCUMULATED'
  | 'INTEREST' | 'INTEREST_ACCUMULATED'
  | 'INTEREST_CHARGE' | 'INTEREST_CHARGE_ACCUMULATED'
  | 'EARNINGS' | 'EARNINGS_ACCUMULATED'
  | 'FEES' | 'FEES_ACCUMULATED';

/* Ein Datenpunkt der Zeitreihe: datum (für X-Achse) + alle Reihenwerte. */
export type ReihenPunkt = { datum: string } & Record<ReihenId, number>;

const ISO = (d: Date) => d.toISOString().slice(0, 10);

/* Vorzeichen-Beiträge je Buchungstyp (Konto-Sicht, wie PP).
   Einlagen/Einlieferungen positiv, Entnahmen/Auslieferungen negativ. */
function transferDelta(tx: Transaktion): number {
  if (tx.typ === 'einlage' || tx.typ === 'umbuchung_ein') return tx.betrag;
  if (tx.typ === 'entnahme' || tx.typ === 'umbuchung_aus') return -tx.betrag;
  return 0;
}

/* Berechnet die Zeitreihe aller 19 Datenreihen über das gemeinsame Datums-Raster
   von berechneSnapshots (von der ersten Buchung bis heute). */
export function berechneVermoegensReihen(
  transaktionen: Transaktion[],
  wertpapiere: Record<string, Wertpapier>,
): ReihenPunkt[] {
  const snapshots = berechneSnapshots(transaktionen, wertpapiere);
  if (snapshots.length === 0) return [];

  // Tages-Aggregate der buchungsbasierten Reihen vorbereiten.
  const perDay = new Map<string, {
    transferals: number; taxes: number; dividends: number;
    interest: number; interestCharge: number; fees: number;
  }>();
  const ensure = (d: string) => {
    let e = perDay.get(d);
    if (!e) { e = { transferals: 0, taxes: 0, dividends: 0, interest: 0, interestCharge: 0, fees: 0 }; perDay.set(d, e); }
    return e;
  };
  for (const tx of transaktionen) {
    const d = ISO(tx.datum);
    const e = ensure(d);
    e.transferals += transferDelta(tx);

    // Eigenständige Ertrags-/Aufwands-Buchungen führen ihren Wert in betrag.
    if (tx.typ === 'dividende' || tx.typ === 'ausschuettung') e.dividends += tx.betrag;
    if (tx.typ === 'zinsen') e.interest += tx.betrag;
    if (tx.typ === 'zinsbelastung') e.interestCharge += tx.betrag;
    if (tx.typ === 'steuern_tx') e.taxes += tx.betrag;
    if (tx.typ === 'steuererstattung') e.taxes -= tx.betrag;
    if (tx.typ === 'gebuehren') e.fees += tx.betrag;
    if (tx.typ === 'gebuehrenerstattung') e.fees -= tx.betrag;

    // Bei Kauf/Verkauf (und Dividenden) eingebettete Gebühren/Steuern zählen
    // zusätzlich in die FEES/TAXES-Reihen (PP: feeUnit/taxUnit der Transaktion).
    if (tx.typ === 'kauf' || tx.typ === 'verkauf' || tx.typ === 'dividende' || tx.typ === 'ausschuettung') {
      if (tx.gebuehren) e.fees += tx.gebuehren;
      if (tx.steuern) e.taxes += tx.steuern;
    }
  }

  // Gemeinsames Datums-Raster: Snapshot-Tage ∪ Buchungstage, damit auch
  // Dividenden-/Zins-/Steuer-Tage ohne Kauf/Verkauf einen Punkt erhalten. Für
  // eingefügte Tage wird der zuletzt bekannte Snapshot-Wert fortgeschrieben.
  const snapByDate = new Map(snapshots.map(s => [ISO(s.datum), s] as const));
  const alleDaten = [...new Set([...snapByDate.keys(), ...perDay.keys()])].sort();

  // Akkumulatoren über die Zeitachse.
  let accTransfer = 0, accTax = 0, accDiv = 0, accInt = 0, accIntCharge = 0, accFee = 0;
  const erstesInvestiert = snapshots[0].investiert;
  const erstesDatum = ISO(snapshots[0].datum);
  const NULL_SNAP = { investiert: 0, marktwert: 0, gewinn: 0 };
  let last: { investiert: number; marktwert: number } = snapshots[0]; // fortgeschriebener Snapshot-Wert

  return alleDaten.map(d => {
    const snap = snapByDate.get(d);
    if (snap) last = snap;
    // Buchungstage vor dem ersten Kauf/Verkauf haben noch kein Vermögen.
    const s = !snap && d < erstesDatum ? NULL_SNAP : last;
    const day = perDay.get(d) ?? { transferals: 0, taxes: 0, dividends: 0, interest: 0, interestCharge: 0, fees: 0 };
    accTransfer += day.transferals;
    accTax += day.taxes;
    accDiv += day.dividends;
    accInt += day.interest;
    accIntCharge += day.interestCharge;
    accFee += day.fees;
    const earningsDay = day.dividends + day.interest;
    const accEarnings = accDiv + accInt;

    return {
      datum: d,
      // Snapshot-basiert
      TOTALS: round2(s.marktwert),
      INVESTED_CAPITAL: round2(s.investiert),                 // im Berichtszeitraum
      ABSOLUTE_INVESTED_CAPITAL: round2(s.investiert),        // seit erster Buchung (Tool: identisch)
      ABSOLUTE_DELTA: round2(s.marktwert - s.investiert),     // Delta im Berichtszeitraum
      ABSOLUTE_DELTA_ALL_RECORDS: round2(s.marktwert - erstesInvestiert),
      // buchungsbasiert (Einzel pro Tag + akkumuliert)
      TRANSFERALS: round2(day.transferals),
      TRANSFERALS_ACCUMULATED: round2(accTransfer),
      TAXES: round2(day.taxes),
      TAXES_ACCUMULATED: round2(accTax),
      DIVIDENDS: round2(day.dividends),
      DIVIDENDS_ACCUMULATED: round2(accDiv),
      INTEREST: round2(day.interest),
      INTEREST_ACCUMULATED: round2(accInt),
      INTEREST_CHARGE: round2(day.interestCharge),
      INTEREST_CHARGE_ACCUMULATED: round2(accIntCharge),
      EARNINGS: round2(earningsDay),
      EARNINGS_ACCUMULATED: round2(accEarnings),
      FEES: round2(day.fees),
      FEES_ACCUMULATED: round2(accFee),
    };
  });
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
