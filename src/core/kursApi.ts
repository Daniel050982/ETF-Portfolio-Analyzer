import type { KursEintrag } from '../types/portfolio';

// Yahoo Finance API über allkeys.shop CORS-Proxy (kostenlos, kein API-Key)
// Alternativ: direkte Yahoo v8 API falls CORS erlaubt (Vite-Proxy)
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

interface YahooChartResult {
  chart: {
    result: Array<{
      meta: { regularMarketPrice: number; currency: string };
      timestamp: number[];
      indicators: {
        adjclose: Array<{ adjclose: number[] }>;
        quote: Array<{ close: number[] }>;
      };
    }>;
    error: { description: string } | null;
  };
}

// ISIN → Yahoo Symbol Mapping (häufige Deutsche ETFs/Aktien)
const ISIN_SYMBOL_MAP: Record<string, string> = {
  'IE00B4L5Y983': 'IWDA.AS',     // iShares Core MSCI World
  'IE00B1XNHC34': 'IBCL.L',     // iShares € Corp Bond
  'IE00BKM4GZ66': 'EIMI.L',     // iShares Core MSCI EM IMI
  'LU0290358497': 'DBXD.DE',    // Xtrackers DAX
  'IE00BJ0KDQ92': 'XDWD.DE',   // Xtrackers MSCI World
  'IE00BZ163G84': 'VWCE.DE',    // Vanguard FTSE All-World
  'LU1681043599': 'AMEW.PA',    // Amundi MSCI World
  'IE00B3RBWM25': 'VWRL.AS',    // Vanguard FTSE All-World Dist
  'IE0031442068': 'IUSA.L',     // iShares S&P 500
  'IE00B5BMR087': 'CSPX.L',     // iShares Core S&P 500
  'DE0005933931': 'EXS1.DE',    // iShares Core DAX
  'LU0274208692': 'DBXN.DE',    // Xtrackers MSCI World
};

function isinToSymbol(isin: string): string | null {
  if (ISIN_SYMBOL_MAP[isin]) return ISIN_SYMBOL_MAP[isin];

  // Heuristik: DE-ISINs → .DE Suffix probieren
  if (isin.startsWith('DE')) return null;
  if (isin.startsWith('IE')) return null;
  if (isin.startsWith('LU')) return null;

  return null;
}

export async function fetchAktuellerKurs(symbol: string): Promise<{ kurs: number; datum: Date; waehrung: string } | null> {
  try {
    const url = `${YAHOO_BASE}${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const resp = await fetch(url);
    if (!resp.ok) return null;

    const data: YahooChartResult = await resp.json();
    if (data.chart.error || !data.chart.result?.length) return null;

    const result = data.chart.result[0];
    return {
      kurs: result.meta.regularMarketPrice,
      datum: new Date(),
      waehrung: result.meta.currency ?? 'EUR',
    };
  } catch {
    return null;
  }
}

export async function fetchKursHistorie(symbol: string, zeitraum: '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max' = '1y'): Promise<KursEintrag[]> {
  try {
    const url = `${YAHOO_BASE}${encodeURIComponent(symbol)}?range=${zeitraum}&interval=1d`;
    const resp = await fetch(url);
    if (!resp.ok) return [];

    const data: YahooChartResult = await resp.json();
    if (data.chart.error || !data.chart.result?.length) return [];

    const result = data.chart.result[0];
    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.adjclose?.[0]?.adjclose
      ?? result.indicators?.quote?.[0]?.close
      ?? [];

    const kurse: KursEintrag[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null && !isNaN(closes[i])) {
        kurse.push({
          datum: new Date(timestamps[i] * 1000),
          kurs: Math.round(closes[i] * 100) / 100,
        });
      }
    }

    return kurse;
  } catch {
    return [];
  }
}

export async function fetchAlleKurse(
  wertpapiere: Record<string, { isin: string; symbol?: string; name: string }>
): Promise<Record<string, { kurs: number; datum: Date }>> {
  const result: Record<string, { kurs: number; datum: Date }> = {};

  const requests: Array<{ key: string; symbol: string }> = [];

  for (const [key, wp] of Object.entries(wertpapiere)) {
    const symbol = wp.symbol || isinToSymbol(wp.isin);
    if (symbol) {
      requests.push({ key, symbol });
    }
  }

  // Parallel, aber max 5 gleichzeitig
  const batchSize = 5;
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async ({ key, symbol }) => {
        const kurs = await fetchAktuellerKurs(symbol);
        if (kurs) result[key] = { kurs: kurs.kurs, datum: kurs.datum };
      })
    );
  }

  return result;
}

export { isinToSymbol };
