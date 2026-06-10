import Papa from 'papaparse';
import type { Transaktion } from '../types/portfolio';

interface PPRow {
  Datum: string;
  Typ: string;
  Wertpapiername: string;
  ISIN: string;
  'Stück': string;
  Kurs: string;
  Wert: string;
  'Gebühren': string;
  Steuern: string;
  'Währung': string;
  Notiz: string;
  [key: string]: string;
}

function parseDatum(s: string): Date {
  // PP exports: "2024-01-15" or "15.01.2024" or "2024-01-15T10:30:00"
  if (s.includes('.')) {
    const [d, m, y] = s.split('.');
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(s);
}

function parseNumber(s: string | undefined): number {
  if (!s || s.trim() === '') return 0;
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

function mapTyp(raw: string): Transaktion['typ'] {
  const t = raw.toLowerCase().trim();
  if (t.includes('kauf') || t === 'buy' || t === 'delivery (inbound)' || t === 'einlieferung') return 'kauf';
  if (t.includes('verkauf') || t === 'sell' || t === 'delivery (outbound)' || t === 'auslieferung') return 'verkauf';
  if (t.includes('divid') || t === 'dividend') return 'dividende';
  if (t.includes('aussch') || t === 'distribution') return 'ausschuettung';
  return 'kauf';
}

let idCounter = 0;

export function parsePortfolioPerformanceCSV(csvText: string): Transaktion[] {
  const result = Papa.parse<PPRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    delimiter: ';',
  });

  if (result.errors.length > 0) {
    const fatalErrors = result.errors.filter(e => e.type === 'FieldMismatch' ? false : true);
    if (fatalErrors.length > 0 && result.data.length === 0) {
      throw new Error(`CSV-Parsing fehlgeschlagen: ${fatalErrors[0].message}`);
    }
  }

  const transaktionen: Transaktion[] = [];

  for (const row of result.data) {
    const datum = row['Datum'] || row['Date'];
    const typ = row['Typ'] || row['Type'];
    const name = row['Wertpapiername'] || row['Security Name'] || row['Wertpapier'];
    const isin = row['ISIN'] || '';
    const stueck = row['Stück'] || row['Shares'] || row['Anzahl'];
    const kurs = row['Kurs'] || row['Quote'] || row['Preis'];
    const wert = row['Wert'] || row['Value'] || row['Betrag'];
    const gebuehren = row['Gebühren'] || row['Fees'] || row['Kosten'];
    const steuern = row['Steuern'] || row['Taxes'];
    const waehrung = row['Währung'] || row['Currency'] || 'EUR';
    const notiz = row['Notiz'] || row['Note'] || '';

    if (!datum || !typ || !name) continue;

    transaktionen.push({
      id: `tx-${++idCounter}-${Date.now()}`,
      datum: parseDatum(datum),
      typ: mapTyp(typ),
      isin: isin.trim(),
      wertpapierName: name.trim(),
      stueck: Math.abs(parseNumber(stueck)),
      kurs: parseNumber(kurs),
      betrag: Math.abs(parseNumber(wert)),
      gebuehren: Math.abs(parseNumber(gebuehren)),
      steuern: Math.abs(parseNumber(steuern)),
      waehrung: waehrung.trim() || 'EUR',
      notiz: notiz.trim() || undefined,
    });
  }

  return transaktionen.sort((a, b) => a.datum.getTime() - b.datum.getTime());
}
