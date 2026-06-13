import type { Wertpapier, Transaktion } from '../types/portfolio';
import type { ColumnDef } from './useColumnConfig';

/* ══════════════════════════════════════════════════════════════════════
   Vermögensaufstellung — gemeinsame Berechnungs- und Spaltenlogik (PP
   StatementOfAssetsViewer). Wird sowohl vom Depots-Tab als auch vom
   Gruppierte-Konten-Tab genutzt, damit beide exakt dieselbe Tabelle samt
   vollständigem Spaltenmenü zeigen.
   ══════════════════════════════════════════════════════════════════════ */

export const SHARES_ADD = new Set(['kauf', 'umbuchung_ein']);
export const SHARES_SUB = new Set(['verkauf', 'umbuchung_aus']);

export interface DepotPosition {
  wpKey: string;
  name: string;
  isin: string;
  symbol: string;
  wkn: string;
  waehrung: string;
  kursdatum?: Date;
  notiz: string;
  typ: string;
  typFarbe?: string;
  shares: number;
  kurs: number;
  marktwert: number;
  investiert: number;
  investiertFifoNetto: number;
  investiertGldBrutto: number;
  investiertGldNetto: number;
  einstandskurs: number;
  einstandskursFifoBrutto: number;
  einstandskursGldNetto: number;
  einstandskursGldBrutto: number;
  gewinn: number;
  gewinnProzent: number;
  kursgewinnFifo: number;
  kursgewinnFifoPct: number;
  kursgewinnGld: number;
  kursgewinnGldPct: number;
  dividendenSumme: number;
  divRenditeFifo: number;
  divRenditeGld: number;
  delta: number;
  deltaPct: number;
  abstandSma: Record<number, number>;
  abstandAth: Record<string, number>;
  kursspanne: Record<string, { tief: number; hoch: number; pos: number }>;
  izf: number;
  ttwror: number;
  perfByPeriod: Record<string, {
    ttwror: number; ttwrorPa: number; izf: number;
    kursgewinnFifo: number; kursgewinnFifoPct: number;
    kursgewinnGld: number; kursgewinnGldPct: number;
    delta: number; deltaPct: number;
    divSumme: number; divFifo: number; divGld: number;
  }>;
}

/* Interner Zinsfuß (IZF/IRR) — PP IRR.java (Newton-Verfahren über Cashflows). */
export function computeIrr(cashflows: { datum: Date; betrag: number }[]): number {
  if (cashflows.length < 2) return 0;
  const t0 = cashflows[0].datum.getTime();
  const years = cashflows.map(c => (c.datum.getTime() - t0) / (365 * 86400000));
  const amounts = cashflows.map(c => c.betrag);
  const npv = (r: number) => amounts.reduce((s, a, i) => s + a / Math.pow(1 + r, years[i]), 0);
  const dnpv = (r: number) => amounts.reduce((s, a, i) => s - (years[i] * a) / Math.pow(1 + r, years[i] + 1), 0);
  const hasPos = amounts.some(a => a > 0), hasNeg = amounts.some(a => a < 0);
  if (!hasPos || !hasNeg) return 0;
  let r = 0.05;
  for (let i = 0; i < 50; i++) {
    const f = npv(r);
    const df = dnpv(r);
    if (Math.abs(df) < 1e-10) break;
    const next = r - f / df;
    if (!isFinite(next)) break;
    if (Math.abs(next - r) < 1e-7) { r = next; break; }
    r = Math.max(-0.99, next);
  }
  return isFinite(r) ? r * 100 : 0;
}

/* TTWROR (zeitgewichtete Rendite) — PP PerformanceIndex. */
export function computeTtwror(txs: Transaktion[], wp: Wertpapier | undefined): number {
  if (!wp || !wp.kursHistorie || wp.kursHistorie.length < 2) return 0;
  const sorted = [...txs].sort((a, b) => a.datum.getTime() - b.datum.getTime());
  if (sorted.length === 0) return 0;
  const startDatum = sorted[0].datum;
  const hist = wp.kursHistorie.filter(h => h.datum >= startDatum);
  if (hist.length < 2) return 0;
  let acc = 1;
  for (let i = 1; i < hist.length; i++) {
    const prev = hist[i - 1].kurs, cur = hist[i].kurs;
    if (prev > 0) acc *= cur / prev;
  }
  return (acc - 1) * 100;
}

/* SMA-Perioden (Tage) — PP DistanceFromMovingAverageColumn */
export const SMA_PERIODS = [5, 20, 30, 38, 50, 90, 100, 200];

export interface ReportPeriod { key: string; label: string; days: number | null }
export const REPORT_PERIODS: ReportPeriod[] = [
  { key: 'all', label: 'Gesamter Zeitraum', days: null },
  { key: 'ytd', label: 'Aktuelles Jahr (YTD)', days: null },
  { key: '30', label: '30 Tage', days: 30 },
  { key: '90', label: '90 Tage', days: 90 },
  { key: '365', label: '1 Jahr', days: 365 },
  { key: '1095', label: '3 Jahre', days: 1095 },
];

export interface PeriodMetric {
  id: string;
  menuLabel: string;
  optionLabel: (periodLabel: string) => string;
  field: keyof DepotPosition['perfByPeriod'][string];
  fmt: 'eur' | 'pct';
}
export const PERF_METRICS: PeriodMetric[] = [
  { id: 'ttwror',        menuLabel: 'TTWROR',                 optionLabel: p => `TTWROR ${p}`,        field: 'ttwror',          fmt: 'pct' },
  { id: 'ttwrorPa',      menuLabel: 'TTWROR p.a.',            optionLabel: p => `TTWROR p.a. ${p}`,   field: 'ttwrorPa',        fmt: 'pct' },
  { id: 'izf',           menuLabel: 'Interner Zinsfuß',       optionLabel: p => `IZF ${p}`,           field: 'izf',             fmt: 'pct' },
  { id: 'kursgewinnFifo',    menuLabel: 'Kursgewinn (FIFO, aktueller Bestand)',     optionLabel: p => `Kursgewinn (FIFO) ${p}`,   field: 'kursgewinnFifo',    fmt: 'eur' },
  { id: 'kursgewinnFifoPct', menuLabel: 'Kursgewinn % (FIFO, aktueller Bestand)',   optionLabel: p => `Kursgewinn % (FIFO) ${p}`, field: 'kursgewinnFifoPct', fmt: 'pct' },
  { id: 'kursgewinnGld',     menuLabel: 'Kursgewinn (GLD, aktueller Bestand)',      optionLabel: p => `Kursgewinn (GLD) ${p}`,    field: 'kursgewinnGld',     fmt: 'eur' },
  { id: 'kursgewinnGldPct',  menuLabel: 'Kursgewinn % (GLD, aktueller Bestand)',    optionLabel: p => `Kursgewinn (GLD) % ${p}`,  field: 'kursgewinnGldPct',  fmt: 'pct' },
  { id: 'delta',         menuLabel: 'Absolute Performance',   optionLabel: p => `Abs.Perf. ${p}`,     field: 'delta',           fmt: 'eur' },
  { id: 'deltaPct',      menuLabel: 'Absolute Performance %',  optionLabel: p => `Abs.Perf. % ${p}`,   field: 'deltaPct',        fmt: 'pct' },
];
export const DIV_METRICS: PeriodMetric[] = [
  { id: 'divSumme', menuLabel: 'Summe Dividenden', optionLabel: p => `∑Div ${p}`,       field: 'divSumme', fmt: 'eur' },
  { id: 'divFifo',  menuLabel: 'Div%',             optionLabel: p => `Div% ${p}`,       field: 'divFifo',  fmt: 'pct' },
  { id: 'divGld',   menuLabel: 'Div% (GLD)',       optionLabel: p => `Div% (GLD) ${p}`, field: 'divGld',   fmt: 'pct' },
];

/* Kurshistorie-Kennzahlen (SMA/ATH/Kursspanne). */
export function computeKursKennzahlen(wp: Wertpapier | undefined, periods: ReportPeriod[]): {
  abstandSma: Record<number, number>;
  abstandAth: Record<string, number>;
  kursspanne: Record<string, { tief: number; hoch: number; pos: number }>;
} {
  const abstandSma: Record<number, number> = {};
  const abstandAth: Record<string, number> = {};
  const kursspanne: Record<string, { tief: number; hoch: number; pos: number }> = {};
  if (!wp) return { abstandSma, abstandAth, kursspanne };
  const hist = wp.kursHistorie ?? [];
  const last = wp.letzterKurs ?? hist.at(-1)?.kurs ?? 0;
  if (last <= 0 || hist.length === 0) return { abstandSma, abstandAth, kursspanne };

  for (const N of SMA_PERIODS) {
    if (hist.length < N) continue;
    const window = hist.slice(-N);
    const sma = window.reduce((s, h) => s + h.kurs, 0) / window.length;
    abstandSma[N] = sma > 0 ? (last / sma - 1) * 100 : 0;
  }

  const now = Date.now();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  for (const per of periods) {
    let cutoff: number;
    if (per.key === 'all') cutoff = -Infinity;
    else if (per.key === 'ytd') cutoff = yearStart;
    else cutoff = now - (per.days ?? 0) * 86400000;
    const range = hist.filter(h => h.datum.getTime() >= cutoff);
    if (range.length === 0) continue;
    let tief = last, hoch = last;
    for (const h of range) { if (h.kurs < tief) tief = h.kurs; if (h.kurs > hoch) hoch = h.kurs; }
    abstandAth[per.key] = hoch > 0 ? ((last - hoch) / hoch) * 100 : 0;
    kursspanne[per.key] = { tief, hoch, pos: hoch > tief ? (last - tief) / (hoch - tief) : 0.5 };
  }

  return { abstandSma, abstandAth, kursspanne };
}

/* Positionen EINES oder MEHRERER Depots berechnen. depotNamen = Liste der
   einbezogenen Depots (Depots-Tab: ein Depot; Gruppierte Konten: mehrere).
   refKontoForDepot: Depotname → Referenzkonto (für die Dividenden-Eingrenzung). */
export function computeDepotPositions(
  depotNamen: string[],
  transaktionen: Transaktion[],
  wertpapiere: Record<string, Wertpapier>,
  periods: ReportPeriod[],
  refKontoForDepot: (depotName: string) => string | undefined = () => undefined,
): DepotPosition[] {
  const depotSet = new Set(depotNamen);
  const depotTxs = transaktionen.filter(tx =>
    depotSet.has(tx.depotName ?? '') && (SHARES_ADD.has(tx.typ) || SHARES_SUB.has(tx.typ))
  );

  // Referenzkonten aller einbezogenen Depots (für Dividenden-Eingrenzung).
  const refKonten = new Set<string>();
  for (const d of depotNamen) { const r = refKontoForDepot(d); if (r) refKonten.add(r); }

  // Dividenden: BRUTTO (Anzeige) + NETTO-Cashflows (Delta/IZF). Eingegrenzt auf
  // die Referenzkonten der einbezogenen Depots (PP collectSecurityRelevantTx).
  const divByKey = new Map<string, number>();
  const divTxByKey = new Map<string, { datum: Date; netto: number; brutto: number }[]>();
  for (const tx of transaktionen) {
    if (tx.typ !== 'dividende' && tx.typ !== 'ausschuettung') continue;
    if (refKonten.size > 0 && tx.kontoName && !refKonten.has(tx.kontoName)) continue;
    const key = tx.isin || tx.wertpapierName;
    if (!key) continue;
    const brutto = tx.betrag + (tx.steuern ?? 0) + (tx.gebuehren ?? 0);
    divByKey.set(key, (divByKey.get(key) ?? 0) + brutto);
    if (!divTxByKey.has(key)) divTxByKey.set(key, []);
    divTxByKey.get(key)!.push({ datum: tx.datum, netto: tx.betrag, brutto });
  }

  const grouped = new Map<string, Transaktion[]>();
  for (const tx of depotTxs) {
    const key = tx.isin || tx.wertpapierName;
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(tx);
  }

  const positions: DepotPosition[] = [];

  for (const [wpKey, txs] of grouped) {
    let shares = 0;
    const fifo: { stueck: number; brutto: number; netto: number }[] = [];
    let gldBrutto = 0, gldNetto = 0, gldShares = 0;
    let deltaAcc = 0;
    let costBasis = 0;

    const sorted = [...txs].sort((a, b) => a.datum.getTime() - b.datum.getTime());
    for (const tx of sorted) {
      const brutto = tx.betrag + tx.gebuehren + tx.steuern;
      const netto = tx.betrag;
      if (SHARES_ADD.has(tx.typ)) {
        shares += tx.stueck;
        fifo.push({ stueck: tx.stueck, brutto, netto });
        gldBrutto += brutto; gldNetto += netto; gldShares += tx.stueck;
        deltaAcc -= brutto; costBasis += brutto;
      } else if (SHARES_SUB.has(tx.typ)) {
        shares -= tx.stueck;
        deltaAcc += brutto;
        let remaining = tx.stueck;
        while (remaining > 0.0001 && fifo.length > 0) {
          const posten = fifo[0];
          const take = Math.min(remaining, posten.stueck);
          const anteil = take / posten.stueck;
          posten.brutto -= posten.brutto * anteil;
          posten.netto -= posten.netto * anteil;
          posten.stueck -= take;
          remaining -= take;
          if (posten.stueck <= 0.0001) fifo.shift();
        }
        if (gldShares > 0.0001) {
          const rest = Math.max(0, gldShares - tx.stueck);
          const f = rest / gldShares;
          gldBrutto *= f; gldNetto *= f; gldShares = rest;
        }
      }
    }

    if (Math.abs(shares) < 0.0001) continue;

    const wp = wertpapiere[wpKey];
    const kurs = wp?.letzterKurs ?? wp?.kursHistorie?.at(-1)?.kurs ?? 0;
    const marktwert = shares * kurs;

    const investiertFifoBrutto = fifo.reduce((s, p) => s + p.brutto, 0);
    const investiertFifoNetto = fifo.reduce((s, p) => s + p.netto, 0);
    const investiertGldBrutto = gldBrutto;
    const investiertGldNetto = gldNetto;

    const einstandskurs = shares > 0 ? investiertFifoNetto / shares : 0;
    const einstandskursFifoBrutto = shares > 0 ? investiertFifoBrutto / shares : 0;
    const einstandskursGldNetto = shares > 0 ? investiertGldNetto / shares : 0;
    const einstandskursGldBrutto = shares > 0 ? investiertGldBrutto / shares : 0;

    const gewinn = marktwert - investiertFifoBrutto;
    const gewinnProzent = investiertFifoBrutto > 0 ? (gewinn / investiertFifoBrutto) * 100 : 0;
    const kursgewinnFifo = marktwert - investiertFifoBrutto;
    const kursgewinnFifoPct = investiertFifoBrutto > 0 ? (marktwert / investiertFifoBrutto - 1) * 100 : 0;
    const kursgewinnGld = marktwert - investiertGldBrutto;
    const kursgewinnGldPct = investiertGldBrutto > 0 ? (marktwert / investiertGldBrutto - 1) * 100 : 0;

    const dividendenSumme = divByKey.get(wpKey) ?? 0;
    const divRenditeFifo = investiertFifoBrutto > 0 ? (dividendenSumme / investiertFifoBrutto) * 100 : 0;
    const divRenditeGld = investiertGldBrutto > 0 ? (dividendenSumme / investiertGldBrutto) * 100 : 0;
    const dividendenNetto = (divTxByKey.get(wpKey) ?? []).reduce((s, d) => s + d.netto, 0);

    const delta = deltaAcc + marktwert + dividendenNetto;
    const deltaPct = costBasis > 0 ? (delta / costBasis) * 100 : 0;

    const kk = computeKursKennzahlen(wp, periods);

    const stichtag = wp?.letzterKursDatum ?? new Date();
    const allDivTx = divTxByKey.get(wpKey) ?? [];
    const buildCashflows = (cutoff: number): { datum: Date; betrag: number }[] => {
      const cf: { datum: Date; betrag: number }[] = [];
      for (const tx of sorted) {
        if (tx.datum.getTime() < cutoff) continue;
        const brutto = tx.betrag + tx.gebuehren + tx.steuern;
        if (SHARES_ADD.has(tx.typ)) cf.push({ datum: tx.datum, betrag: -brutto });
        else if (SHARES_SUB.has(tx.typ)) cf.push({ datum: tx.datum, betrag: brutto });
      }
      for (const d of allDivTx) if (d.datum.getTime() >= cutoff) cf.push({ datum: d.datum, betrag: d.netto });
      cf.sort((a, b) => a.datum.getTime() - b.datum.getTime());
      cf.push({ datum: stichtag, betrag: marktwert });
      return cf;
    };
    const izf = computeIrr(buildCashflows(-Infinity));
    const ttwror = computeTtwror(sorted, wp);

    const now = Date.now();
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    const perfByPeriod: DepotPosition['perfByPeriod'] = {};
    for (const per of periods) {
      let cutoff: number;
      if (per.key === 'all') cutoff = -Infinity;
      else if (per.key === 'ytd') cutoff = yearStart;
      else cutoff = now - (per.days ?? 0) * 86400000;

      const hist = (wp?.kursHistorie ?? []).filter(h => h.datum.getTime() >= cutoff);
      let ttw = 0;
      if (hist.length >= 2) {
        let acc = 1;
        for (let i = 1; i < hist.length; i++) {
          const prev = hist[i - 1].kurs, cur = hist[i].kurs;
          if (prev > 0) acc *= cur / prev;
        }
        ttw = (acc - 1) * 100;
      } else {
        ttw = per.key === 'all' ? ttwror : 0;
      }
      const spanMs = per.key === 'all'
        ? (hist.length >= 2 ? hist[hist.length - 1].datum.getTime() - hist[0].datum.getTime() : 0)
        : now - cutoff;
      const years = spanMs > 0 ? spanMs / (365 * 86400000) : 0;
      const ttwPa = years > 0 ? (Math.pow(1 + ttw / 100, 1 / years) - 1) * 100 : ttw;

      const izfPer = computeIrr(buildCashflows(cutoff));

      let dAcc = 0, dCost = 0, divWinNetto = 0, divWinBrutto = 0;
      for (const tx of sorted) {
        if (tx.datum.getTime() < cutoff) continue;
        const brutto = tx.betrag + tx.gebuehren + tx.steuern;
        if (SHARES_ADD.has(tx.typ)) { dAcc -= brutto; dCost += brutto; }
        else if (SHARES_SUB.has(tx.typ)) dAcc += brutto;
      }
      for (const d of allDivTx) if (d.datum.getTime() >= cutoff) { divWinNetto += d.netto; divWinBrutto += d.brutto; }
      const deltaPer = per.key === 'all' ? delta : dAcc + marktwert + divWinNetto;
      const deltaPctPer = per.key === 'all' ? deltaPct : (dCost > 0 ? (deltaPer / dCost) * 100 : 0);

      const divSum = per.key === 'all' ? dividendenSumme : divWinBrutto;
      const divF = investiertFifoBrutto > 0 ? (divSum / investiertFifoBrutto) * 100 : 0;
      const divG = investiertGldBrutto > 0 ? (divSum / investiertGldBrutto) * 100 : 0;

      perfByPeriod[per.key] = {
        ttwror: ttw, ttwrorPa: ttwPa, izf: izfPer,
        kursgewinnFifo, kursgewinnFifoPct, kursgewinnGld, kursgewinnGldPct,
        delta: deltaPer, deltaPct: deltaPctPer,
        divSumme: divSum, divFifo: divF, divGld: divG,
      };
    }

    positions.push({
      wpKey, name: wp?.name ?? wpKey,
      isin: wp?.isin ?? '',
      symbol: wp?.symbol ?? '',
      wkn: wp?.wkn ?? '',
      waehrung: wp?.waehrung ?? 'EUR',
      kursdatum: wp?.letzterKursDatum,
      notiz: wp?.notiz ?? '',
      typ: wp?.typ ?? 'Sonstige', typFarbe: wp?.typFarbe,
      shares, kurs, marktwert,
      investiert: investiertFifoBrutto,
      investiertFifoNetto, investiertGldBrutto, investiertGldNetto,
      einstandskurs, einstandskursFifoBrutto, einstandskursGldNetto, einstandskursGldBrutto,
      gewinn, gewinnProzent,
      kursgewinnFifo, kursgewinnFifoPct, kursgewinnGld, kursgewinnGldPct,
      dividendenSumme, divRenditeFifo, divRenditeGld,
      delta, deltaPct,
      abstandSma: kk.abstandSma, abstandAth: kk.abstandAth, kursspanne: kk.kursspanne,
      izf, ttwror, perfByPeriod,
    });
  }

  return positions.sort((a, b) => a.name.localeCompare(b.name));
}

/* Vollständige Spaltenliste der Vermögensaufstellung (PP StatementOfAssetsViewer). */
export function buildVermoegenColumns(periods: ReportPeriod[], taxonomien: { id: string; name: string }[]): ColumnDef[] {
  const periodCols = (metrics: PeriodMetric[]): ColumnDef[] =>
    metrics.flatMap(m => periods.map((per): ColumnDef => ({
      id: `${m.id}_${per.key}`, label: m.optionLabel(per.label), align: 'right',
    })));
  return [
    { id: 'bestand', label: 'Bestand', align: 'right' },
    { id: 'name', label: 'Name' },
    { id: 'symbol', label: 'Symbol' },
    { id: 'isin', label: 'ISIN' },
    { id: 'wkn', label: 'WKN' },
    { id: 'kurs', label: 'Kurs', align: 'right' },
    { id: 'kursdatum', label: 'Kursdatum' },
    { id: 'marktwert', label: 'Marktwert', align: 'right' },
    { id: 'anteil', label: 'Anteil in %', align: 'right' },
    { id: 'einstandskurs', label: 'Einstandskurs (FIFO)', align: 'right' },
    { id: 'einstandskursGld', label: 'Einstandskurs (gleitender Durchschnitt)', align: 'right' },
    { id: 'einstandskursBrutto', label: 'Einstandskurs (Brutto)', align: 'right' },
    { id: 'einstandskursGldBrutto', label: 'Einstandskurs (GLD) (brutto)', align: 'right' },
    { id: 'einstandspreis', label: 'Einstandspreis (FIFO)', align: 'right' },
    { id: 'einstandspreisGld', label: 'Einstandspreis (gleitender Durchschnitt)', align: 'right' },
    { id: 'gewinn', label: 'Gewinn / Verlust', align: 'right' },
    { id: 'notiz', label: 'Notiz' },
    ...periodCols(PERF_METRICS),
    ...periodCols(DIV_METRICS),
    ...taxonomien.map((t): ColumnDef => ({ id: `tax_${t.id}`, label: t.name })),
    { id: 'waehrung', label: 'Währung' },
    { id: 'wechselkurs', label: 'Wechselkurs', align: 'right' },
    { id: 'kursBasis', label: 'Kurs**', align: 'right' },
    { id: 'marktwertBasis', label: 'Marktwert**', align: 'right' },
    { id: 'einstandspreisBasis', label: 'Einstandspreis**', align: 'right' },
    { id: 'einstandskursBasis', label: 'Einstandskurs**', align: 'right' },
    { id: 'gewinnBasis', label: 'Gewinn / Verlust**', align: 'right' },
    ...SMA_PERIODS.map((n): ColumnDef => ({ id: `sma${n}`, label: `Δ zu SMA${n}`, align: 'right' })),
    ...periods.map((p): ColumnDef => ({ id: `ath_${p.key}`, label: `Δ ATH ${p.label} %`, align: 'right' })),
    ...periods.map((p): ColumnDef => ({ id: `kursspanne_${p.key}`, label: `Kursspanne ${p.label}`, align: 'right' })),
  ];
}
export function buildVermoegenHiddenDefault(periods: ReportPeriod[], taxonomien: { id: string }[]): string[] {
  const all = buildVermoegenColumns(periods, taxonomien as { id: string; name: string }[]).map(c => c.id);
  const visible = new Set(['bestand', 'name', 'symbol', 'kurs', 'marktwert', 'anteil', 'notiz']);
  return all.filter(id => !visible.has(id));
}
