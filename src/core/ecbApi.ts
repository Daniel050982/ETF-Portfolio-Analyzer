// PP: ECBExchangeRateProvider + ECBUpdater
// Holt Wechselkurse von der Europäischen Zentralbank (EUR als Basiswährung)

import type { KursEintrag } from '../types/portfolio';

const ECB_BASE = '/ecb-api/stats/eurofxref/';

export interface ECBExchangeRate {
  baseCurrency: string;
  termCurrency: string;
  rates: KursEintrag[];
}

// PP: ECBUpdater.readCubes() — parsed die ECB-XML und extrahiert Wechselkurse
function parseECBXml(xmlText: string): Map<string, KursEintrag[]> {
  const result = new Map<string, KursEintrag[]>();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const ns = 'http://www.ecb.int/vocabulary/2002-08-01/eurofxref';
  const cubes = doc.getElementsByTagNameNS(ns, 'Cube');

  let currentDate: string | null = null;

  for (let i = 0; i < cubes.length; i++) {
    const cube = cubes[i];
    const time = cube.getAttribute('time');
    const currency = cube.getAttribute('currency');
    const rate = cube.getAttribute('rate');

    if (time) {
      currentDate = time;
    } else if (currency && rate && currentDate) {
      if (!result.has(currency)) {
        result.set(currency, []);
      }
      result.get(currency)!.push({
        datum: new Date(currentDate + 'T00:00:00Z'),
        kurs: parseFloat(rate),
      });
    }
  }

  // PP: Kurse chronologisch sortieren (ECB liefert neueste zuerst)
  for (const rates of result.values()) {
    rates.sort((a, b) => a.datum.getTime() - b.datum.getTime());
  }

  return result;
}

// PP: ECBUpdater.update() — entscheidet welchen Feed (daily, 90d, hist) laden
export async function fetchECBExchangeRates(
  currencies?: string[]
): Promise<ECBExchangeRate[]> {
  try {
    const resp = await fetch(ECB_BASE + 'eurofxref-hist-90d.xml', {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      console.warn(`[ECB] HTTP ${resp.status}`);
      return [];
    }
    const xml = await resp.text();
    const allRates = parseECBXml(xml);

    const series: ECBExchangeRate[] = [];
    for (const [currency, rates] of allRates) {
      if (currencies && !currencies.includes(currency)) continue;
      series.push({
        baseCurrency: 'EUR',
        termCurrency: currency,
        rates,
      });
    }

    return series;
  } catch (e) {
    console.warn('[ECB] Fehler beim Laden der Wechselkurse:', e);
    return [];
  }
}
