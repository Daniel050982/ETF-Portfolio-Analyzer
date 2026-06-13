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

// Annualisierte TTWROR (PP: geometrische Annualisierung über die Periodenlänge)
// (1 + ttwror)^(365/Tage) - 1
export function berechneTTWRORAnnualized(snapshots: PortfolioSnapshot[]): number {
  if (snapshots.length < 2) return 0;
  const ttwror = berechneTTWROR(snapshots) / 100; // als Faktor
  const tage = (snapshots[snapshots.length - 1].datum.getTime() - snapshots[0].datum.getTime()) / (1000 * 60 * 60 * 24);
  if (tage <= 0) return 0;
  return (Math.pow(1 + ttwror, 365 / tage) - 1) * 100;
}

// Semivolatilität / Downside Deviation (PP: nur negative Tagesrenditen,
// annualisiert mit √252). PP berechnet Abweichung gegenüber 0.
export function berechneSemivolatilitaet(snapshots: PortfolioSnapshot[]): number {
  if (snapshots.length < 3) return 0;
  const negativeReturns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i - 1].marktwert > 0) {
      const r = snapshots[i].marktwert / snapshots[i - 1].marktwert - 1;
      if (r < 0) negativeReturns.push(r);
    }
  }
  if (negativeReturns.length < 2) return 0;
  // PP: Summe der quadrierten negativen Returns / Anzahl ALLER Returns
  const allCount = snapshots.length - 1;
  const sumSq = negativeReturns.reduce((s, r) => s + r * r, 0);
  const dailySemiVol = Math.sqrt(sumSq / allCount);
  return dailySemiVol * Math.sqrt(252) * 100;
}

export interface DrawdownSerie {
  datum: Date;
  drawdown: number; // negativ oder 0, in Prozent
}

// Drawdown-Zeitreihe (PP Drawdown.getMaxDrawdownSerie): für jeden Tag der
// prozentuale Rückgang vom bisherigen Höchststand.
export function berechneDrawdownSerie(snapshots: PortfolioSnapshot[]): DrawdownSerie[] {
  if (snapshots.length === 0) return [];
  let peak = snapshots[0].marktwert;
  return snapshots.map(s => {
    if (s.marktwert > peak) peak = s.marktwert;
    const dd = peak > 0 ? (s.marktwert - peak) / peak * 100 : 0;
    return { datum: s.datum, drawdown: Math.round(dd * 100) / 100 };
  });
}

export interface DrawdownDauer {
  maxDrawdownDauerTage: number;     // längster Zeitraum zwischen zwei Höchstständen
  maxDrawdownStart: Date | null;
  maxDrawdownEnde: Date | null;
  bisPeriodenende: boolean;
  laengsteRecoveryTage: number;     // längste Zeit zwischen Tief und Hoch
}

// Max Drawdown Duration (PP Drawdown): längste Zeitspanne zwischen zwei
// aufeinanderfolgenden Höchstständen (Vermögenshöchststand → nächster
// Höchststand). Recovery Time = längste Zeit von einem Tief bis zum nächsten Hoch.
export function berechneDrawdownDauer(snapshots: PortfolioSnapshot[]): DrawdownDauer {
  const leer: DrawdownDauer = {
    maxDrawdownDauerTage: 0, maxDrawdownStart: null, maxDrawdownEnde: null,
    bisPeriodenende: false, laengsteRecoveryTage: 0,
  };
  if (snapshots.length < 2) return leer;

  const tage = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));

  let peak = snapshots[0].marktwert;
  let peakDatum = snapshots[0].datum;
  let maxDauer = 0;
  let maxStart: Date | null = null;
  let maxEnde: Date | null = null;
  let bisEnde = false;

  // Recovery: vom letzten Tief (innerhalb eines Drawdowns) bis zum Erreichen eines neuen Hochs
  let troughDatum = snapshots[0].datum;
  let troughWert = snapshots[0].marktwert;
  let maxRecovery = 0;

  for (let i = 1; i < snapshots.length; i++) {
    const s = snapshots[i];
    if (s.marktwert >= peak) {
      // Neuer Höchststand → Dauer seit letztem Höchststand abschließen
      const dauer = tage(peakDatum, s.datum);
      if (dauer > maxDauer) {
        maxDauer = dauer; maxStart = peakDatum; maxEnde = s.datum; bisEnde = false;
      }
      // Recovery vom Tief bis hierhin
      const rec = tage(troughDatum, s.datum);
      if (rec > maxRecovery) maxRecovery = rec;
      peak = s.marktwert; peakDatum = s.datum;
      troughWert = s.marktwert; troughDatum = s.datum;
    } else if (s.marktwert < troughWert) {
      troughWert = s.marktwert; troughDatum = s.datum;
    }
  }

  // Offener Drawdown bis Periodenende
  const last = snapshots[snapshots.length - 1];
  const offen = tage(peakDatum, last.datum);
  if (offen > maxDauer) {
    maxDauer = offen; maxStart = peakDatum; maxEnde = last.datum; bisEnde = true;
  }

  return {
    maxDrawdownDauerTage: maxDauer, maxDrawdownStart: maxStart,
    maxDrawdownEnde: maxEnde, bisPeriodenende: bisEnde, laengsteRecoveryTage: maxRecovery,
  };
}

export interface SnapshotKategorie {
  typ: 'anfangswert' | 'einlieferungen' | 'gewinne' | 'erträge' | 'gebuehren' | 'steuern' | 'waehrung' | 'endwert';
  label: string;
  betrag: number;
  vorzeichen: '+' | '-' | '=';
}

// ClientPerformanceSnapshot-artige Aufschlüsselung (PP PerformanceCalculationWidget):
// Anfangswert + Einlieferungen/Entnahmen + Kapitalgewinne + Erträge - Gebühren
// - Steuern = Endwert. Berechnet aus Transaktionen + Snapshots im Intervall.
export function berechneSnapshotKategorien(
  transaktionen: Transaktion[],
  wertpapiere: Record<string, Wertpapier>,
  von?: Date,
  bis?: Date,
): SnapshotKategorie[] {
  const snapshots = berechneSnapshots(transaktionen, wertpapiere);
  if (snapshots.length === 0) {
    return [
      { typ: 'anfangswert', label: 'Anfangswert', betrag: 0, vorzeichen: '=' },
      { typ: 'endwert', label: 'Endwert', betrag: 0, vorzeichen: '=' },
    ];
  }

  const startTime = von ? von.getTime() : snapshots[0].datum.getTime();
  const endTime = bis ? bis.getTime() : snapshots[snapshots.length - 1].datum.getTime();

  const imIntervall = snapshots.filter(s => s.datum.getTime() >= startTime && s.datum.getTime() <= endTime);
  const anfang = imIntervall.length ? imIntervall[0].marktwert : 0;
  const ende = imIntervall.length ? imIntervall[imIntervall.length - 1].marktwert : 0;

  let einlieferungen = 0, ertraege = 0, gebuehren = 0, steuern = 0;
  for (const tx of transaktionen) {
    const t = tx.datum.getTime();
    if (t < startTime || t > endTime) continue;
    if (tx.typ === 'kauf') einlieferungen += tx.betrag + tx.gebuehren;
    else if (tx.typ === 'verkauf') einlieferungen -= tx.betrag;
    else if (tx.typ === 'dividende' || tx.typ === 'ausschuettung' || tx.typ === 'zinsen') ertraege += tx.betrag;
    if (tx.gebuehren) gebuehren += tx.gebuehren;
    if (tx.steuern) steuern += tx.steuern;
  }

  // Kapitalgewinne = Endwert - Anfangswert - Einlieferungen + Erträge-Abfluss-neutral
  const gewinne = ende - anfang - einlieferungen;

  return [
    { typ: 'anfangswert', label: 'Anfangswert', betrag: anfang, vorzeichen: '=' },
    { typ: 'einlieferungen', label: 'Einlieferungen / Entnahmen', betrag: einlieferungen, vorzeichen: einlieferungen >= 0 ? '+' : '-' },
    { typ: 'gewinne', label: 'Realisierte + unrealisierte Kursgewinne', betrag: gewinne, vorzeichen: gewinne >= 0 ? '+' : '-' },
    { typ: 'erträge', label: 'Erträge (Dividenden, Zinsen)', betrag: ertraege, vorzeichen: '+' },
    { typ: 'gebuehren', label: 'Gebühren', betrag: gebuehren, vorzeichen: '-' },
    { typ: 'steuern', label: 'Steuern', betrag: steuern, vorzeichen: '-' },
    { typ: 'endwert', label: 'Endwert', betrag: ende, vorzeichen: '=' },
  ];
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
