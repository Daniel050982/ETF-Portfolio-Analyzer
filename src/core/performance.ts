import type { Transaktion, PortfolioSnapshot, PerformanceDaten, Wertpapier } from '../types/portfolio';

// TTWROR (True Time-Weighted Rate of Return)
// Berechnet die zeitgewichtete Rendite unabhängig von Ein-/Auszahlungen
export function berechneTTWROR(snapshots: PortfolioSnapshot[]): number {
  if (snapshots.length < 2) return 0;

  let ttwror = 1;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    if (prev.marktwert > 0) {
      const periodReturn = curr.marktwert / prev.marktwert;
      ttwror *= periodReturn;
    }
  }

  return (ttwror - 1) * 100;
}

// IRR (Internal Rate of Return) — Newton-Raphson Iteration
// Berechnet den internen Zinsfuß unter Berücksichtigung aller Cashflows
export function berechneIRR(cashflows: { datum: Date; betrag: number }[]): number {
  if (cashflows.length < 2) return 0;

  const sorted = [...cashflows].sort((a, b) => a.datum.getTime() - b.datum.getTime());
  const firstDate = sorted[0].datum.getTime();
  const yearMs = 365.25 * 24 * 60 * 60 * 1000;

  // NPV-Funktion
  const npv = (rate: number): number => {
    let sum = 0;
    for (const cf of sorted) {
      const years = (cf.datum.getTime() - firstDate) / yearMs;
      sum += cf.betrag / Math.pow(1 + rate, years);
    }
    return sum;
  };

  // Ableitung der NPV-Funktion
  const dnpv = (rate: number): number => {
    let sum = 0;
    for (const cf of sorted) {
      const years = (cf.datum.getTime() - firstDate) / yearMs;
      sum -= years * cf.betrag / Math.pow(1 + rate, years + 1);
    }
    return sum;
  };

  // Newton-Raphson
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    const df = dnpv(rate);
    if (Math.abs(df) < 1e-12) break;
    const newRate = rate - f / df;
    if (Math.abs(newRate - rate) < 1e-10) break;
    rate = newRate;
    if (rate < -0.99) rate = -0.99;
    if (rate > 10) rate = 10;
  }

  return rate * 100;
}

// Max Drawdown — maximaler Rückgang vom Höchststand
export function berechneMaxDrawdown(snapshots: PortfolioSnapshot[]): number {
  if (snapshots.length < 2) return 0;

  let maxVal = snapshots[0].marktwert;
  let maxDrawdown = 0;

  for (const snap of snapshots) {
    if (snap.marktwert > maxVal) maxVal = snap.marktwert;
    if (maxVal > 0) {
      const drawdown = (maxVal - snap.marktwert) / maxVal * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

// Volatilität (annualisierte Standardabweichung der täglichen Renditen)
export function berechneVolatilitaet(snapshots: PortfolioSnapshot[]): number {
  if (snapshots.length < 3) return 0;

  const returns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i - 1].marktwert > 0) {
      returns.push(snapshots[i].marktwert / snapshots[i - 1].marktwert - 1);
    }
  }

  if (returns.length < 2) return 0;

  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const dailyVol = Math.sqrt(variance);

  // Annualisieren (√252 Handelstage)
  return dailyVol * Math.sqrt(252) * 100;
}

// Portfolio-Snapshots aus Transaktionen + Kurshistorie berechnen
export function berechneSnapshots(
  transaktionen: Transaktion[],
  wertpapiere: Record<string, Wertpapier>
): PortfolioSnapshot[] {
  const sorted = [...transaktionen]
    .filter(tx => tx.typ === 'kauf' || tx.typ === 'verkauf')
    .sort((a, b) => a.datum.getTime() - b.datum.getTime());

  if (sorted.length === 0) return [];

  // Sammle alle Datumspunkte (Transaktionen + Kurshistorie)
  const dateSet = new Set<string>();
  for (const tx of sorted) {
    dateSet.add(tx.datum.toISOString().slice(0, 10));
  }
  for (const wp of Object.values(wertpapiere)) {
    for (const kurs of wp.kursHistorie) {
      dateSet.add(kurs.datum.toISOString().slice(0, 10));
    }
  }

  const dates = [...dateSet].sort();
  if (dates.length === 0) return [];

  // Kurs-Lookup pro Wertpapier: nächster bekannter Kurs vor/am Datum
  const kursLookup = new Map<string, Map<string, number>>();
  for (const [key, wp] of Object.entries(wertpapiere)) {
    const dateMap = new Map<string, number>();
    for (const kurs of wp.kursHistorie) {
      dateMap.set(kurs.datum.toISOString().slice(0, 10), kurs.kurs);
    }
    kursLookup.set(key, dateMap);
  }

  function getKurs(wpKey: string, dateStr: string): number | undefined {
    const dateMap = kursLookup.get(wpKey);
    if (!dateMap) return undefined;

    const kurs = dateMap.get(dateStr);
    if (kurs !== undefined) return kurs;

    // Finde den letzten bekannten Kurs vor diesem Datum
    let lastKurs: number | undefined;
    for (const [d, k] of dateMap) {
      if (d <= dateStr) lastKurs = k;
      else break;
    }
    return lastKurs;
  }

  // Bestände pro Datum berechnen
  const bestaende: Record<string, number> = {};
  let investiertGesamt = 0;
  let txIdx = 0;

  const snapshots: PortfolioSnapshot[] = [];

  for (const dateStr of dates) {
    // Transaktionen bis zu diesem Datum verarbeiten
    while (txIdx < sorted.length && sorted[txIdx].datum.toISOString().slice(0, 10) <= dateStr) {
      const tx = sorted[txIdx];
      const key = tx.isin || tx.wertpapierName;
      if (!bestaende[key]) bestaende[key] = 0;

      if (tx.typ === 'kauf') {
        bestaende[key] += tx.stueck;
        investiertGesamt += tx.betrag + tx.gebuehren;
      } else if (tx.typ === 'verkauf') {
        bestaende[key] -= tx.stueck;
        investiertGesamt -= tx.betrag;
      }
      txIdx++;
    }

    // Marktwert berechnen
    let marktwert = 0;
    let hasKurse = false;
    for (const [key, stueck] of Object.entries(bestaende)) {
      if (stueck <= 0) continue;
      const kurs = getKurs(key, dateStr);
      if (kurs !== undefined) {
        marktwert += stueck * kurs;
        hasKurse = true;
      } else {
        // Fallback: Einstandspreis verwenden
        const wp = wertpapiere[key];
        if (wp) marktwert += stueck * wp.durchschnittskurs;
      }
    }

    if (!hasKurse && marktwert === 0) marktwert = investiertGesamt;

    const gewinn = marktwert - investiertGesamt;

    snapshots.push({
      datum: new Date(dateStr),
      investiert: Math.round(investiertGesamt * 100) / 100,
      marktwert: Math.round(marktwert * 100) / 100,
      gewinn: Math.round(gewinn * 100) / 100,
      renditeAbs: investiertGesamt > 0 ? Math.round((gewinn / investiertGesamt) * 10000) / 100 : 0,
    });
  }

  return snapshots;
}

export function berechnePerformance(
  transaktionen: Transaktion[],
  wertpapiere: Record<string, Wertpapier>
): PerformanceDaten {
  const snapshots = berechneSnapshots(transaktionen, wertpapiere);

  // Cashflows für IRR: Käufe sind negative Cashflows, Verkäufe + aktueller Marktwert sind positiv
  const cashflows: { datum: Date; betrag: number }[] = [];
  for (const tx of transaktionen) {
    if (tx.typ === 'kauf') {
      cashflows.push({ datum: tx.datum, betrag: -(tx.betrag + tx.gebuehren) });
    } else if (tx.typ === 'verkauf') {
      cashflows.push({ datum: tx.datum, betrag: tx.betrag - tx.gebuehren });
    } else if (tx.typ === 'dividende' || tx.typ === 'ausschuettung') {
      cashflows.push({ datum: tx.datum, betrag: tx.betrag });
    }
  }

  // Aktuellen Portfoliowert als finalen Cashflow
  if (snapshots.length > 0) {
    const last = snapshots[snapshots.length - 1];
    cashflows.push({ datum: last.datum, betrag: last.marktwert });
  }

  return {
    ttwror: Math.round(berechneTTWROR(snapshots) * 100) / 100,
    irr: Math.round(berechneIRR(cashflows) * 100) / 100,
    maxDrawdown: Math.round(berechneMaxDrawdown(snapshots) * 100) / 100,
    volatilitaet: Math.round(berechneVolatilitaet(snapshots) * 100) / 100,
    snapshots,
  };
}
