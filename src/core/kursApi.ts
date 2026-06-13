import type { KursEintrag } from '../types/portfolio';

// ==================== Yahoo Finance ====================

const ENDPOINTS = [
  '/yahoo-api/v8/finance/chart/',
  '/yahoo-api2/v8/finance/chart/',
];

interface YahooChartResult {
  chart: {
    result: Array<{
      meta: { regularMarketPrice: number; currency: string; previousClose?: number; regularMarketTime?: number };
      timestamp: number[];
      indicators: {
        adjclose: Array<{ adjclose: number[] }>;
        quote: Array<{ close: number[] }>;
      };
    }>;
    error: { description: string } | null;
  };
}

const ISIN_SYMBOL_MAP: Record<string, string> = {
  'IE00B4L5Y983': 'IWDA.AS',
  'IE00BJ0KDQ92': 'XDWD.DE',
  'LU0274208692': 'DBXN.DE',
  'LU1681043599': 'AMEW.PA',
  'IE00BFY0GT14': 'SWRD.L',
  'IE00BK5BQT80': 'VWCE.DE',
  'IE00B3RBWM25': 'VWRL.AS',
  'IE00BZ163G84': 'VWCE.DE',
  'IE0031442068': 'IUSA.L',
  'IE00B5BMR087': 'CSPX.L',
  'IE00BFMXXD54': 'VUAA.DE',
  'IE00BKM4GZ66': 'EIMI.L',
  'IE00BTJRMP35': 'EIMI.AS',
  'IE00B4K48X80': 'IMAE.AS',
  'IE00B945VN12': 'VEUR.AS',
  'DE0005933931': 'EXS1.DE',
  'LU0290358497': 'DBXD.DE',
  'IE00B1XNHC34': 'IBCL.L',
  'LU0290355717': 'DBXB.DE',
  'IE00B53SZB19': 'CNDX.L',
  'IE000BNTLV82': 'EQQQ.DE',
  'IE00B8GKDB10': 'VHYL.AS',
  'IE00B0M63060': 'ISPA.DE',
  'IE00B1FZS350': 'IWDP.AS',
  'IE00B4ND3602': 'ICOM.L',
  'IE00B579F325': 'SGLD.L',
};

function isinToSymbol(isin: string): string | null {
  return ISIN_SYMBOL_MAP[isin] ?? null;
}

async function fetchWithFallback(symbol: string, params: string): Promise<YahooChartResult | null> {
  for (const base of ENDPOINTS) {
    try {
      const url = `${base}${encodeURIComponent(symbol)}?${params}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (text.includes('Too Many Requests') || text.includes('<!DOCTYPE')) continue;
      const data: YahooChartResult = JSON.parse(text);
      if (data.chart.error || !data.chart.result?.length) continue;
      return data;
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchAktuellerKurs(symbol: string): Promise<{ kurs: number; datum: Date; waehrung: string } | null> {
  const data = await fetchWithFallback(symbol, 'range=5d&interval=1d');
  if (!data) return null;

  const result = data.chart.result[0];
  const kurs = result.meta.regularMarketPrice ?? result.meta.previousClose;
  if (!kurs || kurs <= 0) return null;

  const datum = result.meta.regularMarketTime
    ? new Date(result.meta.regularMarketTime * 1000)
    : new Date();

  return {
    kurs,
    datum,
    waehrung: result.meta.currency ?? 'EUR',
  };
}

export async function fetchKursHistorie(symbol: string, zeitraum: '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max' = '1y'): Promise<KursEintrag[]> {
  const data = await fetchWithFallback(symbol, `range=${zeitraum}&interval=1d`);
  if (!data) return [];

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
        kurs: closes[i],
      });
    }
  }

  return kurse;
}

// ==================== CoinGecko (PP: CoinGeckoQuoteFeed.java) ====================

const COINGECKO_ENDPOINT = '/coingecko-api/api/v3';

// Hardcoded Ticker→CoinGecko-ID für die Top-Kryptos
// CoinGecko coins/list hat viele Duplikate (Bridge-Tokens, Scam-Coins etc.)
// die denselben Ticker wie der echte Coin haben. findFirst() liefert dann
// den falschen. PP löst das über COINGECKOCOINID-Property; wir zusätzlich hier.
const TICKER_TO_COINGECKO: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  usdt: 'tether',
  xrp: 'ripple',
  bnb: 'binancecoin',
  sol: 'solana',
  ada: 'cardano',
  doge: 'dogecoin',
  dot: 'polkadot',
  avax: 'avalanche-2',
  matic: 'matic-network',
  pol: 'polygon-ecosystem-token',
  link: 'chainlink',
  uni: 'uniswap',
  shib: 'shiba-inu',
  ltc: 'litecoin',
  atom: 'cosmos',
  xlm: 'stellar',
  near: 'near',
  fil: 'filecoin',
  apt: 'aptos',
  arb: 'arbitrum',
  op: 'optimism',
  inj: 'injective-protocol',
  ethw: 'ethereum-pow-iou',
  bit: 'bitdao',
  algo: 'algorand',
  icp: 'internet-computer',
  ftm: 'fantom',
  sand: 'the-sandbox',
  mana: 'decentraland',
  aave: 'aave',
  crv: 'curve-dao-token',
  mkr: 'maker',
  comp: 'compound-governance-token',
  snx: 'havven',
  ldo: 'lido-dao',
  ape: 'apecoin',
  grt: 'the-graph',
  xtz: 'tezos',
  eos: 'eos',
  theta: 'theta-token',
  hbar: 'hedera-hashgraph',
  egld: 'elrond-erd-2',
  flow: 'flow',
  xmr: 'monero',
  trx: 'tron',
  etc: 'ethereum-classic',
  bch: 'bitcoin-cash',
  sui: 'sui',
  sei: 'sei-network',
  ton: 'the-open-network',
  pepe: 'pepe',
  wif: 'dogwifcoin',
  render: 'render-token',
  fet: 'fetch-ai',
  stx: 'blockstack',
  imx: 'immutable-x',
  vet: 'vechain',
  rune: 'thorchain',
};

// PP: CoinGeckoQuoteFeed.getCoins() — cached coin list for ticker→id mapping
let coinListCache: Array<{ id: string; symbol: string; name: string }> | null = null;

async function getCoinGeckoCoins(): Promise<Array<{ id: string; symbol: string; name: string }>> {
  if (coinListCache) return coinListCache;
  try {
    const resp = await fetch(`${COINGECKO_ENDPOINT}/coins/list`, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    if (!Array.isArray(data)) return [];
    coinListCache = data.map((c: { id: string; symbol: string; name: string }) => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
    }));
    return coinListCache;
  } catch {
    return [];
  }
}

// PP: CoinGeckoQuoteFeed.getCoinGeckoIdForTicker()
async function getCoinGeckoId(tickerSymbol: string): Promise<string | null> {
  const lower = tickerSymbol.toLowerCase();
  // 1. Hardcoded Mapping (sicher, keine Verwechslung)
  if (TICKER_TO_COINGECKO[lower]) return TICKER_TO_COINGECKO[lower];
  // 2. Fallback: CoinGecko coins/list durchsuchen
  const coins = await getCoinGeckoCoins();
  const match = coins.find(c => c.symbol === lower);
  return match?.id ?? null;
}

// PP: CoinGeckoQuoteFeed.getHistoricalQuotes() → /api/v3/coins/{id}/market_chart
async function fetchCoinGeckoHistorie(coinId: string, currency: string, days: number): Promise<KursEintrag[]> {
  // PP: free API max 365 Tage
  const clampedDays = Math.min(days, 365);
  try {
    const url = `${COINGECKO_ENDPOINT}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=${encodeURIComponent(currency)}&days=${clampedDays}&interval=daily`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      console.warn(`[CoinGecko] ${resp.status} for ${coinId}`);
      return [];
    }
    const data = await resp.json();
    if (!data?.prices || !Array.isArray(data.prices)) return [];

    const kurse: KursEintrag[] = [];
    let prevDate = '';
    for (const [timestamp, price] of data.prices as [number, number][]) {
      if (price == null || isNaN(price)) continue;
      const d = new Date(timestamp);
      // PP: CoinGeckoQuoteFeed.fromArray() — Closing prices at 00:00:00 UTC gehören zum Vortag
      const utcH = d.getUTCHours(), utcM = d.getUTCMinutes(), utcS = d.getUTCSeconds();
      let dateForPrice: Date;
      if (utcH === 0 && utcM === 0 && utcS === 0) {
        dateForPrice = new Date(d.getTime() - 86400000);
      } else {
        dateForPrice = d;
      }
      const dateStr = dateForPrice.toISOString().slice(0, 10);
      // PP speichert Krypto-Kurse mit voller Präzision (8 Dezimalstellen)
      if (dateStr === prevDate) {
        kurse[kurse.length - 1] = { datum: dateForPrice, kurs: price };
      } else {
        kurse.push({ datum: dateForPrice, kurs: price });
      }
      prevDate = dateStr;
    }
    return kurse;
  } catch (e) {
    console.warn(`[CoinGecko] Error fetching ${coinId}:`, e);
    return [];
  }
}

// PP: coinGeckoId hat Vorrang (aus SecurityProperty), sonst Ticker→Coins-Liste
async function resolveCoinId(tickerSymbol: string, explicitCoinId?: string): Promise<string | null> {
  if (explicitCoinId) return explicitCoinId;
  return getCoinGeckoId(tickerSymbol);
}

export async function fetchCoinGeckoAktuellerKurs(
  tickerSymbol: string, currency: string, explicitCoinId?: string
): Promise<{ kurs: number; datum: Date; waehrung: string } | null> {
  const coinId = await resolveCoinId(tickerSymbol, explicitCoinId);
  if (!coinId) {
    console.warn(`[CoinGecko] Kein Coin-ID für Ticker "${tickerSymbol}"`);
    return null;
  }
  const kurse = await fetchCoinGeckoHistorie(coinId, currency, 2);
  if (kurse.length === 0) return null;
  const last = kurse[kurse.length - 1];
  return { kurs: last.kurs, datum: last.datum, waehrung: currency };
}

export async function fetchCoinGeckoKursHistorie(
  tickerSymbol: string, currency: string, days: number, explicitCoinId?: string
): Promise<KursEintrag[]> {
  const coinId = await resolveCoinId(tickerSymbol, explicitCoinId);
  if (!coinId) {
    console.warn(`[CoinGecko] Kein Coin-ID für Ticker "${tickerSymbol}"`);
    return [];
  }
  return fetchCoinGeckoHistorie(coinId, currency, days);
}

// ==================== Unified API (feed-aware) ====================

interface WpKursInfo {
  isin: string;
  symbol?: string;
  name: string;
  feed?: string;
  waehrung?: string;
  coinGeckoId?: string;
}

function isCoinGecko(wp: WpKursInfo): boolean {
  return wp.feed === 'COINGECKO';
}

export async function fetchAlleKurse(
  wertpapiere: Record<string, WpKursInfo>
): Promise<Record<string, { kurs: number; datum: Date }>> {
  const result: Record<string, { kurs: number; datum: Date }> = {};

  const yahooRequests: Array<{ key: string; symbol: string }> = [];
  const cgRequests: Array<{ key: string; ticker: string; currency: string; coinGeckoId?: string }> = [];

  for (const [key, wp] of Object.entries(wertpapiere)) {
    if (isCoinGecko(wp)) {
      if (wp.symbol || wp.coinGeckoId) {
        cgRequests.push({ key, ticker: wp.symbol ?? '', currency: wp.waehrung ?? 'EUR', coinGeckoId: wp.coinGeckoId });
      }
    } else {
      const symbol = wp.symbol || isinToSymbol(wp.isin);
      if (symbol) {
        yahooRequests.push({ key, symbol });
      }
    }
  }

  // Yahoo: max 3 parallel
  const batchSize = 3;
  for (let i = 0; i < yahooRequests.length; i += batchSize) {
    const batch = yahooRequests.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async ({ key, symbol }) => {
        const kurs = await fetchAktuellerKurs(symbol);
        if (kurs) result[key] = { kurs: kurs.kurs, datum: kurs.datum };
      })
    );
    if (i + batchSize < yahooRequests.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // CoinGecko: max 2 parallel (PP free: ~9.5 req/min)
  const cgBatchSize = 2;
  for (let i = 0; i < cgRequests.length; i += cgBatchSize) {
    const batch = cgRequests.slice(i, i + cgBatchSize);
    await Promise.allSettled(
      batch.map(async ({ key, ticker, currency, coinGeckoId }) => {
        const kurs = await fetchCoinGeckoAktuellerKurs(ticker, currency.toLowerCase(), coinGeckoId);
        if (kurs) result[key] = { kurs: kurs.kurs, datum: kurs.datum };
      })
    );
    if (i + cgBatchSize < cgRequests.length) {
      await new Promise(r => setTimeout(r, 7000));
    }
  }

  return result;
}

function pickRange(gapDays: number): '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' {
  if (gapDays <= 5) return '5d';
  if (gapDays <= 30) return '1mo';
  if (gapDays <= 90) return '3mo';
  if (gapDays <= 180) return '6mo';
  if (gapDays <= 365) return '1y';
  return '2y';
}

interface WpLueckenInfo extends WpKursInfo {
  letzterHistKursDatum?: Date;
}

export async function fetchLuecken(
  wertpapiere: Record<string, WpLueckenInfo>
): Promise<Record<string, KursEintrag[]>> {
  const result: Record<string, KursEintrag[]> = {};
  const now = Date.now();
  const ONE_DAY = 86400000;

  const yahooRequests: Array<{ key: string; symbol: string; gapDays: number }> = [];
  const cgRequests: Array<{ key: string; ticker: string; currency: string; gapDays: number; coinGeckoId?: string }> = [];

  for (const [key, wp] of Object.entries(wertpapiere)) {
    const lastDate = wp.letzterHistKursDatum?.getTime() ?? 0;
    const gapDays = Math.ceil((now - lastDate) / ONE_DAY);
    if (gapDays < 2) continue;

    if (isCoinGecko(wp)) {
      if (wp.symbol || wp.coinGeckoId) {
        cgRequests.push({ key, ticker: wp.symbol ?? '', currency: wp.waehrung ?? 'EUR', gapDays, coinGeckoId: wp.coinGeckoId });
      }
    } else {
      const symbol = wp.symbol || isinToSymbol(wp.isin);
      if (symbol) {
        yahooRequests.push({ key, symbol, gapDays });
      }
    }
  }

  if (yahooRequests.length === 0 && cgRequests.length === 0) return result;

  // Yahoo
  const batchSize = 3;
  for (let i = 0; i < yahooRequests.length; i += batchSize) {
    const batch = yahooRequests.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async ({ key, symbol, gapDays }) => {
        const range = pickRange(gapDays);
        const kurse = await fetchKursHistorie(symbol, range);
        if (kurse.length > 0) result[key] = kurse;
      })
    );
    if (i + batchSize < yahooRequests.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // CoinGecko
  const cgBatchSize = 2;
  for (let i = 0; i < cgRequests.length; i += cgBatchSize) {
    const batch = cgRequests.slice(i, i + cgBatchSize);
    await Promise.allSettled(
      batch.map(async ({ key, ticker, currency, gapDays, coinGeckoId }) => {
        const days = Math.min(gapDays + 1, 365);
        const kurse = await fetchCoinGeckoKursHistorie(ticker, currency.toLowerCase(), days, coinGeckoId);
        if (kurse.length > 0) result[key] = kurse;
      })
    );
    if (i + cgBatchSize < cgRequests.length) {
      await new Promise(r => setTimeout(r, 7000));
    }
  }

  return result;
}

export { isinToSymbol };
