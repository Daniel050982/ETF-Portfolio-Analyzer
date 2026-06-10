import type { Transaktion, Wertpapier, Konto, Depot, Sparplan, Taxonomie, Klassifizierung, KursEintrag } from '../types/portfolio';

const SHARES_FACTOR = 1_000_000_000;
const PRICE_FACTOR = 100_000_000;
const AMOUNT_FACTOR = 100;

let idCounter = 0;
function nextId(): string {
  return `xml-${++idCounter}-${Date.now()}`;
}

function parseDate(s: string | null | undefined): Date {
  if (!s) return new Date(0);
  return new Date(s);
}

function getText(el: Element, tag: string): string {
  return el.querySelector(`:scope > ${tag}`)?.textContent?.trim() ?? '';
}

function getNumber(el: Element, tag: string): number {
  const t = getText(el, tag);
  return t ? Number(t) : 0;
}

// PP/XStream Reference Resolution: resolves relative XPath-style references.
// XStream references are relative to the element itself (not its parent).
// ".." means "go to parent of current position".
function resolveReference(el: Element, _doc: Document, depth = 0): Element | null {
  if (depth > 30) return null;

  const ref = el.getAttribute('reference');
  if (!ref) return el;

  // Start navigation at the element itself
  let current: Element | null = el;
  const parts = ref.split('/');

  for (const part of parts) {
    if (!current) return null;

    if (part === '..') {
      current = current.parentElement;
      continue;
    }

    const match = part.match(/^([a-zA-Z_][\w-]*)(?:\[(\d+)\])?$/);
    if (!match) return null;

    const tagName = match[1];
    const idx = match[2] ? parseInt(match[2]) - 1 : 0;

    const children = Array.from(current.children).filter(c => c.tagName === tagName);
    current = children[idx] ?? null;

    if (current?.getAttribute('reference')) {
      current = resolveReference(current, _doc, depth + 1);
    }
  }

  return current;
}

function resolveEl(el: Element, doc: Document): Element | null {
  if (el.getAttribute('reference')) {
    return resolveReference(el, doc);
  }
  return el;
}

function getUnitAmount(txEl: Element, unitType: string): number {
  const units = txEl.querySelector(':scope > units');
  if (!units) return 0;
  const unitEls = Array.from(units.querySelectorAll(':scope > unit'));
  for (const u of unitEls) {
    if (u.getAttribute('type') === unitType) {
      const amountEl = u.querySelector(':scope > amount');
      if (amountEl) {
        return Number(amountEl.getAttribute('amount') ?? '0') / AMOUNT_FACTOR;
      }
    }
  }
  return 0;
}

function getSecurityInfo(txEl: Element, doc: Document): { name: string; isin: string; uuid: string } {
  const secEl = txEl.querySelector(':scope > security');
  if (!secEl) return { name: '', isin: '', uuid: '' };
  const resolved = resolveEl(secEl, doc);
  if (!resolved) return { name: '', isin: '', uuid: '' };
  return {
    name: getText(resolved, 'name'),
    isin: getText(resolved, 'isin'),
    uuid: getText(resolved, 'uuid'),
  };
}

function mapAccountTxType(ppType: string): Transaktion['typ'] {
  switch (ppType) {
    case 'DEPOSIT': return 'einlage';
    case 'REMOVAL': return 'entnahme';
    case 'INTEREST': return 'zinsen';
    case 'INTEREST_CHARGE': return 'zinsen';
    case 'DIVIDENDS': return 'dividende';
    case 'FEES': return 'gebuehren';
    case 'FEES_REFUND': return 'gebuehren';
    case 'TAXES': return 'steuern_tx';
    case 'TAX_REFUND': return 'steuererstattung';
    case 'BUY': return 'kauf';
    case 'SELL': return 'verkauf';
    case 'TRANSFER_IN': return 'umbuchung_ein';
    case 'TRANSFER_OUT': return 'umbuchung_aus';
    default: return 'einlage';
  }
}

function mapPortfolioTxType(ppType: string): Transaktion['typ'] {
  switch (ppType) {
    case 'BUY': return 'kauf';
    case 'SELL': return 'verkauf';
    case 'DELIVERY_INBOUND': return 'kauf';
    case 'DELIVERY_OUTBOUND': return 'verkauf';
    case 'TRANSFER_IN': return 'umbuchung_ein';
    case 'TRANSFER_OUT': return 'umbuchung_aus';
    default: return 'kauf';
  }
}

// Find the containing account or portfolio name for a transaction element.
// Walks up the DOM to the nearest account/portfolio ancestor.
// For elements inside crossEntry structures, the parent account/portfolio
// might be a reference or might not have a <name> — resolve and try the
// top-level container lists as fallback.
function findContainerName(
  el: Element,
  doc: Document,
  accountNameCache: Map<Element, string>,
  portfolioNameCache: Map<Element, string>,
): { kontoName?: string; depotName?: string } {
  let current: Element | null = el;
  while (current) {
    const tag = current.tagName;
    if (tag === 'account' || tag === 'portfolio') {
      // Check cache first
      const isAccount = tag === 'account';
      const cache = isAccount ? accountNameCache : portfolioNameCache;
      if (cache.has(current)) {
        return isAccount
          ? { kontoName: cache.get(current)! }
          : { depotName: cache.get(current)! };
      }

      // Try resolving
      const resolved = resolveEl(current, doc) ?? current;
      const name = getText(resolved, 'name');
      if (name) {
        cache.set(current, name);
        return isAccount ? { kontoName: name } : { depotName: name };
      }

      // Fallback: if the element has a reference, follow it and get the name
      if (resolved !== current) {
        const resolvedName = getText(resolved, 'name');
        if (resolvedName) {
          cache.set(current, resolvedName);
          return isAccount ? { kontoName: resolvedName } : { depotName: resolvedName };
        }
      }
    }
    current = current.parentElement;
  }
  return {};
}

function parseSecurities(doc: Document): Map<string, Partial<Wertpapier>> {
  const secEls = Array.from(doc.querySelectorAll('client > securities > security'));
  const map = new Map<string, Partial<Wertpapier>>();

  for (let secEl of secEls) {
    secEl = resolveEl(secEl, doc) ?? secEl;

    const uuid = getText(secEl, 'uuid');
    const isin = getText(secEl, 'isin');
    const key = isin || uuid || getText(secEl, 'name');

    const kursHistorie: KursEintrag[] = [];
    const priceEls = secEl.querySelectorAll(':scope > prices > price');
    for (const p of priceEls) {
      const dateStr = p.getAttribute('t');
      const valueStr = p.getAttribute('v');
      if (dateStr && valueStr) {
        kursHistorie.push({
          datum: new Date(dateStr),
          kurs: Number(valueStr) / PRICE_FACTOR,
        });
      }
    }
    kursHistorie.sort((a, b) => a.datum.getTime() - b.datum.getTime());

    const letzterKurs = kursHistorie.length > 0 ? kursHistorie[kursHistorie.length - 1] : undefined;

    map.set(key, {
      uuid,
      isin,
      wkn: getText(secEl, 'wkn') || undefined,
      symbol: getText(secEl, 'tickerSymbol') || undefined,
      name: getText(secEl, 'name'),
      waehrung: getText(secEl, 'currencyCode') || 'EUR',
      kursHistorie,
      letzterKurs: letzterKurs?.kurs,
      letzterKursDatum: letzterKurs?.datum,
      feed: getText(secEl, 'feed') || undefined,
      feedUrl: getText(secEl, 'feedURL') || undefined,
      istInaktiv: getText(secEl, 'isRetired') === 'true',
    });
  }

  return map;
}

// ========== NEW APPROACH: Global Transaction Collector ==========
// Instead of iterating containers and failing on references,
// we find ALL non-reference transaction elements in the entire document,
// parse each one, and determine container assignment from DOM ancestry.

interface GlobalTxResult {
  transaktionen: Transaktion[];
  kontoTxCount: number;
  depotTxCount: number;
  unassignedCount: number;
  totalElements: number;
  refElements: number;
  parseFailed: number;
}

function collectAllTransactions(doc: Document): GlobalTxResult {
  const txMap = new Map<string, Transaktion>();
  let kontoTxCount = 0;
  let depotTxCount = 0;
  let unassignedCount = 0;
  let refElements = 0;
  let parseFailed = 0;

  // Caches for container name resolution
  const accountNameCache = new Map<Element, string>();
  const portfolioNameCache = new Map<Element, string>();

  // Pre-populate caches from top-level containers
  for (const accEl of doc.querySelectorAll('client > accounts > account')) {
    const resolved = resolveEl(accEl, doc) ?? accEl;
    const name = getText(resolved, 'name');
    if (name) {
      accountNameCache.set(accEl, name);
      if (resolved !== accEl) accountNameCache.set(resolved, name);
    }
  }
  for (const ptfEl of doc.querySelectorAll('client > portfolios > portfolio')) {
    const resolved = resolveEl(ptfEl, doc) ?? ptfEl;
    const name = getText(resolved, 'name');
    if (name) {
      portfolioNameCache.set(ptfEl, name);
      if (resolved !== ptfEl) portfolioNameCache.set(resolved, name);
    }
  }

  const findCN = (el: Element) => findContainerName(el, doc, accountNameCache, portfolioNameCache);

  // Find ALL account-transaction and portfolio-transaction elements in the entire document
  const allAccountTx = Array.from(doc.querySelectorAll('account-transaction'));
  const allPortfolioTx = Array.from(doc.querySelectorAll('portfolio-transaction'));

  const totalElements = allAccountTx.length + allPortfolioTx.length;

  // Process account transactions
  for (const el of allAccountTx) {
    if (el.getAttribute('reference')) {
      refElements++;
      continue;
    }

    const ppType = getText(el, 'type');
    if (!ppType) { parseFailed++; continue; }

    const sec = getSecurityInfo(el, doc);
    const amount = getNumber(el, 'amount') / AMOUNT_FACTOR;
    const shares = getNumber(el, 'shares') / SHARES_FACTOR;
    const fees = getUnitAmount(el, 'FEE');
    const tax = getUnitAmount(el, 'TAX');
    const uuid = getText(el, 'uuid') || nextId();

    if (txMap.has(uuid)) continue;

    const container = findCN(el);

    // Also extract cross-entry info for depot assignment
    const crossEntryEl = el.querySelector(':scope > crossEntry');
    let depotName = container.depotName;
    let kontoName = container.kontoName;
    if (crossEntryEl) {
      // The crossEntry element contains (or references) a portfolio-transaction.
      // From that we can find the portfolio name.
      const ptfTxEl = crossEntryEl.tagName === 'portfolio-transaction'
        ? crossEntryEl
        : crossEntryEl.querySelector(':scope > portfolio-transaction') ?? crossEntryEl;
      const resolved = resolveEl(ptfTxEl, doc);
      if (resolved && !depotName) {
        const ptfContainer = findCN(resolved);
        if (ptfContainer.depotName) depotName = ptfContainer.depotName;
      }
    }

    const tx: Transaktion = {
      id: uuid,
      datum: parseDate(getText(el, 'date')),
      typ: mapAccountTxType(ppType),
      isin: sec.isin,
      wertpapierName: sec.name,
      stueck: shares,
      kurs: shares > 0 ? amount / shares : 0,
      betrag: amount,
      gebuehren: fees,
      steuern: tax,
      waehrung: getText(el, 'currencyCode') || 'EUR',
      notiz: getText(el, 'note') || undefined,
      quelle: getText(el, 'source') || undefined,
      kontoName,
      depotName,
    };

    txMap.set(uuid, tx);
    if (kontoName) kontoTxCount++;
    else if (depotName) depotTxCount++;
    else unassignedCount++;
  }

  // Process portfolio transactions
  for (const el of allPortfolioTx) {
    if (el.getAttribute('reference')) {
      refElements++;
      continue;
    }

    const ppType = getText(el, 'type');
    if (!ppType) { parseFailed++; continue; }

    const sec = getSecurityInfo(el, doc);
    const amount = getNumber(el, 'amount') / AMOUNT_FACTOR;
    const shares = getNumber(el, 'shares') / SHARES_FACTOR;
    const fees = getUnitAmount(el, 'FEE');
    const tax = getUnitAmount(el, 'TAX');
    const uuid = getText(el, 'uuid') || nextId();

    if (txMap.has(uuid)) {
      const existing = txMap.get(uuid)!;
      const container = findCN(el);
      if (!existing.depotName && container.depotName) {
        existing.depotName = container.depotName;
      }
      if (!existing.kontoName && container.kontoName) {
        existing.kontoName = container.kontoName;
      }
      continue;
    }

    const container = findCN(el);

    // Also extract cross-entry info for account assignment
    const crossEntryEl = el.querySelector(':scope > crossEntry');
    let kontoName = container.kontoName;
    let depotName = container.depotName;
    if (crossEntryEl) {
      const accTxEl = crossEntryEl.tagName === 'account-transaction'
        ? crossEntryEl
        : crossEntryEl.querySelector(':scope > account-transaction') ??
          crossEntryEl.querySelector(':scope > accountTransaction') ??
          crossEntryEl;
      const resolved = resolveEl(accTxEl, doc);
      if (resolved && !kontoName) {
        const accContainer = findCN(resolved);
        if (accContainer.kontoName) kontoName = accContainer.kontoName;
      }
    }

    const tx: Transaktion = {
      id: uuid,
      datum: parseDate(getText(el, 'date')),
      typ: mapPortfolioTxType(ppType),
      isin: sec.isin,
      wertpapierName: sec.name,
      stueck: shares,
      kurs: shares > 0 ? amount / shares : 0,
      betrag: amount,
      gebuehren: fees,
      steuern: tax,
      waehrung: getText(el, 'currencyCode') || 'EUR',
      notiz: getText(el, 'note') || undefined,
      quelle: getText(el, 'source') || undefined,
      kontoName,
      depotName,
    };

    txMap.set(uuid, tx);
    if (depotName) depotTxCount++;
    else if (kontoName) kontoTxCount++;
    else unassignedCount++;
  }

  return {
    transaktionen: [...txMap.values()],
    kontoTxCount,
    depotTxCount,
    unassignedCount,
    totalElements,
    refElements,
    parseFailed,
  };
}

// ========== Container Parsing (for Konto/Depot objects, not TX) ==========

function parseAccounts(doc: Document, allTx: Transaktion[]): Konto[] {
  const accountEls = Array.from(doc.querySelectorAll('client > accounts > account'));
  const konten: Konto[] = [];
  const seen = new Set<string>();

  for (const rawEl of accountEls) {
    const accEl = resolveEl(rawEl, doc) ?? rawEl;
    const name = getText(accEl, 'name') || 'Konto';
    if (seen.has(name)) continue;
    seen.add(name);

    const kontoTx = allTx.filter(tx => tx.kontoName === name);

    let saldo = 0;
    for (const tx of kontoTx) {
      if (['einlage', 'zinsen', 'dividende', 'ausschuettung', 'verkauf', 'steuererstattung', 'umbuchung_ein'].includes(tx.typ)) {
        saldo += tx.betrag;
      } else if (['entnahme', 'kauf', 'gebuehren', 'steuern_tx', 'umbuchung_aus'].includes(tx.typ)) {
        saldo -= tx.betrag;
      }
    }

    konten.push({
      uuid: getText(accEl, 'uuid') || undefined,
      name,
      waehrung: getText(accEl, 'currencyCode') || 'EUR',
      notiz: getText(accEl, 'note') || undefined,
      saldo,
      transaktionen: kontoTx,
      istInaktiv: getText(accEl, 'isRetired') === 'true',
    });
  }

  return konten;
}

function parsePortfolios(doc: Document, allTx: Transaktion[]): Depot[] {
  const ptfEls = Array.from(doc.querySelectorAll('client > portfolios > portfolio'));
  const depots: Depot[] = [];
  const seen = new Set<string>();

  for (const rawEl of ptfEls) {
    const ptfEl = resolveEl(rawEl, doc) ?? rawEl;
    const name = getText(ptfEl, 'name') || 'Depot';
    if (seen.has(name)) continue;
    seen.add(name);

    const depotTx = allTx.filter(tx => tx.depotName === name);

    const refAccEl = ptfEl.querySelector(':scope > referenceAccount');
    let refKontoName: string | undefined;
    if (refAccEl) {
      const resolved = resolveEl(refAccEl, doc);
      if (resolved) refKontoName = getText(resolved, 'name');
    }

    depots.push({
      uuid: getText(ptfEl, 'uuid') || undefined,
      name,
      referenzkontoName: refKontoName,
      notiz: getText(ptfEl, 'note') || undefined,
      transaktionen: depotTx,
      istInaktiv: getText(ptfEl, 'isRetired') === 'true',
    });
  }

  return depots;
}

// ========== Sparplan-Transaktionen generieren ==========

interface SparplanGenResult {
  sparplaene: Sparplan[];
  generatedTx: Transaktion[];
  debug: SparplanDebugEntry[];
}

interface SparplanDebugEntry {
  name: string;
  wpKey: string;
  depotName: string;
  kontoName: string;
  intervall: number;
  betrag: number;
  startDatum: string;
  generatedCount: number;
  skippedDup: number;
  hasStoredTx: boolean;
  storedTxCount: number;
  secRef: string;
  secResolved: boolean;
  ptfRef: string;
  accRef: string;
  kursCount: number;
}

function parsePlansAndGenerate(
  doc: Document,
  wertpapierDaten: Map<string, Partial<Wertpapier>>,
  existingTx: Transaktion[],
): SparplanGenResult {
  const planEls = doc.querySelectorAll('client > plans > investment-plan');
  const sparplaene: Sparplan[] = [];
  const generatedTx: Transaktion[] = [];
  const debug: SparplanDebugEntry[] = [];

  // Build a UUID→security lookup from the securities list for fallback
  const secByUuid = new Map<string, Element>();
  for (const s of doc.querySelectorAll('client > securities > security')) {
    const resolved = resolveEl(s, doc) ?? s;
    const uuid = getText(resolved, 'uuid');
    if (uuid) secByUuid.set(uuid, resolved);
  }

  for (const planEl of planEls) {
    const secEl = planEl.querySelector(':scope > security');
    let wpKey = '';
    let wpName = '';
    let wpIsin = '';
    let secRef = '';
    let secResolved = false;
    if (secEl) {
      secRef = secEl.getAttribute('reference') || '(inline)';
      const resolved = resolveEl(secEl, doc);
      if (resolved) {
        secResolved = true;
        wpIsin = getText(resolved, 'isin');
        wpName = getText(resolved, 'name');
        wpKey = wpIsin || wpName;
      } else {
        // Fallback: try to find security by class attribute or UUID inside the element
        const classAttr = secEl.getAttribute('class');
        if (classAttr) {
          // XStream sometimes uses class="..." for type hints
        }
        // Try extracting UUID from the reference path and looking up
        const refPath = secEl.getAttribute('reference') || '';
        const secMatch = refPath.match(/security\[(\d+)\]/);
        if (secMatch) {
          const idx = parseInt(secMatch[1]) - 1;
          const allSecs = Array.from(doc.querySelectorAll('client > securities > security'));
          if (idx >= 0 && idx < allSecs.length) {
            const fallbackSec = resolveEl(allSecs[idx], doc) ?? allSecs[idx];
            wpIsin = getText(fallbackSec, 'isin');
            wpName = getText(fallbackSec, 'name');
            wpKey = wpIsin || wpName;
            secResolved = true;
          }
        }
      }
    }

    const ptfEl = planEl.querySelector(':scope > portfolio');
    let depotName = '';
    let ptfRef = '';
    if (ptfEl) {
      ptfRef = ptfEl.getAttribute('reference') || '(inline)';
      const resolved = resolveEl(ptfEl, doc);
      if (resolved) depotName = getText(resolved, 'name');
    }

    const accEl = planEl.querySelector(':scope > account');
    let kontoName = '';
    let accRef = '';
    if (accEl) {
      accRef = accEl.getAttribute('reference') || '(inline)';
      const resolved = resolveEl(accEl, doc);
      if (resolved) kontoName = getText(resolved, 'name');
    }

    const planName = getText(planEl, 'name');
    const intervall = getNumber(planEl, 'interval') || 1;
    const betrag = getNumber(planEl, 'amount') / AMOUNT_FACTOR;
    const startDatum = parseDate(getText(planEl, 'start'));
    const autoGenerate = getText(planEl, 'autoGenerate') !== 'false';

    sparplaene.push({
      name: planName,
      wertpapierKey: wpKey,
      depotName,
      kontoName,
      intervall,
      betrag,
      startDatum,
      aktiv: autoGenerate,
    });

    // Check for stored transactions inside the plan
    const planTxWrapper = planEl.querySelector(':scope > transactions');
    let storedTxCount = 0;

    if (planTxWrapper) {
      for (const childEl of Array.from(planTxWrapper.children)) {
        if (childEl.getAttribute('reference')) continue;
        const ppType = getText(childEl, 'type');
        if (!ppType) continue;
        storedTxCount++;
      }
    }

    // PP stores Sparplan transactions as normal account/portfolio-transactions in the XML.
    // We only generate if no matching transactions exist for this plan's schedule.
    // Dedup: match by ISIN + date (±2 days) + similar amount.
    let generatedCount = 0;
    let skippedDup = 0;
    const wpData = wertpapierDaten.get(wpKey);

    // Build a lookup set of existing TX for this ISIN: "YYYY-MM-DD" → betrag
    const existingForIsin = new Map<number, number>();
    const TWO_DAYS = 2 * 86400000;
    for (const tx of existingTx) {
      if (tx.isin === wpIsin && tx.typ === 'kauf') {
        existingForIsin.set(tx.datum.getTime(), tx.betrag);
      }
    }

    function isDuplicate(date: Date, amount: number): boolean {
      const ts = date.getTime();
      for (const [existTs, existAmt] of existingForIsin) {
        if (Math.abs(existTs - ts) <= TWO_DAYS && Math.abs(existAmt - amount) < amount * 0.1) {
          return true;
        }
      }
      return false;
    }

    if (autoGenerate && wpKey && betrag > 0 && startDatum.getTime() > 0) {
      // Build sorted price array for binary search (timestamp-based, no timezone issues)
      const sortedPrices: { ts: number; kurs: number }[] = [];
      if (wpData?.kursHistorie) {
        for (const k of wpData.kursHistorie) {
          sortedPrices.push({ ts: k.datum.getTime(), kurs: k.kurs });
        }
        sortedPrices.sort((a, b) => a.ts - b.ts);
      }

      // Find nearest price within ±10 days using binary search
      function findNearestPrice(targetTs: number): number | null {
        if (sortedPrices.length === 0) return null;
        const TEN_DAYS = 10 * 86400000;

        let lo = 0, hi = sortedPrices.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (sortedPrices[mid].ts < targetTs) lo = mid + 1;
          else hi = mid;
        }

        let best: number | null = null;
        let bestDist = TEN_DAYS + 1;
        for (const idx of [lo - 1, lo, lo + 1]) {
          if (idx < 0 || idx >= sortedPrices.length) continue;
          const dist = Math.abs(sortedPrices[idx].ts - targetTs);
          if (dist < bestDist) {
            bestDist = dist;
            best = sortedPrices[idx].kurs;
          }
        }
        return best;
      }

      const today = new Date();
      const current = new Date(startDatum);

      const dayOfMonth = current.getDate();

      while (current <= today) {
        const kurs = findNearestPrice(current.getTime());
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;

        if (kurs && kurs > 0) {
          if (isDuplicate(current, betrag)) {
            skippedDup++;
          } else {
            const stueck = betrag / kurs;
            const txId = `sparplan-${planName}-${dateStr}`;
            generatedTx.push({
              id: txId,
              datum: new Date(current),
              typ: 'kauf',
              isin: wpIsin,
              wertpapierName: wpName,
              stueck,
              kurs,
              betrag,
              gebuehren: 0,
              steuern: 0,
              waehrung: wpData?.waehrung || 'EUR',
              notiz: `Sparplan: ${planName}`,
              quelle: 'sparplan',
              kontoName,
              depotName,
            });
            generatedCount++;
          }
        }

        // Step to next interval
        current.setMonth(current.getMonth() + intervall);
        // Restore day-of-month (setMonth can overflow e.g. Jan 31 → Mar 3)
        const maxDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
        current.setDate(Math.min(dayOfMonth, maxDay));
      }
    }

    debug.push({
      name: planName,
      wpKey,
      depotName,
      kontoName,
      intervall,
      betrag,
      startDatum: startDatum.toISOString().slice(0, 10),
      generatedCount,
      skippedDup,
      hasStoredTx: storedTxCount > 0,
      storedTxCount,
      secRef,
      secResolved,
      ptfRef,
      accRef,
      kursCount: wpData?.kursHistorie?.length ?? 0,
    });
  }

  return { sparplaene, generatedTx, debug };
}

// ========== Taxonomien ==========

function parseTaxonomies(doc: Document): Taxonomie[] {
  const taxEls = doc.querySelectorAll('client > taxonomies > taxonomy');
  const result: Taxonomie[] = [];

  for (const taxEl of taxEls) {
    const rootEl = taxEl.querySelector(':scope > root');
    if (!rootEl) continue;

    result.push({
      id: getText(taxEl, 'id'),
      name: getText(taxEl, 'name'),
      wurzel: parseClassification(rootEl, doc),
    });
  }

  return result;
}

function parseClassification(el: Element, doc: Document): Klassifizierung {
  const kinderEl = el.querySelector(':scope > children');
  const kinder: Klassifizierung[] = [];
  if (kinderEl) {
    for (const childEl of Array.from(kinderEl.querySelectorAll(':scope > classification'))) {
      kinder.push(parseClassification(childEl, doc));
    }
  }

  const zuweisungen: { wertpapierKey: string; gewicht: number }[] = [];
  const assignEls = el.querySelectorAll(':scope > assignments > assignment');
  for (const a of assignEls) {
    const weight = getNumber(a, 'weight');
    const ivEl = a.querySelector(':scope > investmentVehicle');
    if (ivEl) {
      const resolved = resolveEl(ivEl, doc);
      if (resolved) {
        const isin = getText(resolved, 'isin');
        const name = getText(resolved, 'name');
        if (isin || name) zuweisungen.push({ wertpapierKey: isin || name, gewicht: weight });
      }
    }
  }

  return {
    id: getText(el, 'id'),
    name: getText(el, 'name'),
    farbe: getText(el, 'color') || '#888888',
    kinder,
    zuweisungen,
  };
}

// ========== Debug Types ==========

export interface ImportDebugLog {
  globalCollector: {
    totalElements: number;
    refElements: number;
    parseFailed: number;
    uniqueTx: number;
    kontoTxCount: number;
    depotTxCount: number;
    unassignedCount: number;
  };
  sparplaene: SparplanDebugEntry[];
  sparplanTxGenerated: number;
  finalTotal: number;
  kontenCount: number;
  depotsCount: number;
  xmlStructure: string;
}

export interface PPImportResult {
  transaktionen: Transaktion[];
  wertpapierDaten: Map<string, Partial<Wertpapier>>;
  konten: Konto[];
  depots: Depot[];
  sparplaene: Sparplan[];
  taxonomien: Taxonomie[];
  basisWaehrung: string;
  debug?: ImportDebugLog;
}

// ========== Main Entry ==========

export function parsePortfolioPerformanceXML(xmlText: string): PPImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`XML-Parsing fehlgeschlagen: ${parseError.textContent}`);
  }

  const clientEl = doc.querySelector('client');
  if (!clientEl) {
    throw new Error('Kein <client>-Element gefunden. Ist das eine Portfolio Performance Datei?');
  }

  const basisWaehrung = getText(clientEl, 'baseCurrency') || 'EUR';

  // XML structure analysis
  const clientChildren = Array.from(clientEl.children).map(c => `<${c.tagName}>(${c.children.length})`);
  const xmlStructure = `client children: ${clientChildren.join(', ')}`;

  // Step 1: Parse securities (needed for Sparplan price lookup)
  const wertpapierDaten = parseSecurities(doc);

  // Step 2: Global collector — find ALL transactions in the entire document
  const globalResult = collectAllTransactions(doc);

  // Step 3: Generate Sparplan transactions (only fills gaps not already in the XML)
  const { sparplaene, generatedTx, debug: sparplanDebug } = parsePlansAndGenerate(doc, wertpapierDaten, globalResult.transaktionen);

  // Step 4: Merge all transactions
  const allTx = [...globalResult.transaktionen, ...generatedTx];

  // UUID dedup (in case of overlap)
  const txMap = new Map<string, Transaktion>();
  for (const tx of allTx) {
    if (!txMap.has(tx.id)) {
      txMap.set(tx.id, tx);
    } else {
      const existing = txMap.get(tx.id)!;
      if (!existing.kontoName && tx.kontoName) existing.kontoName = tx.kontoName;
      if (!existing.depotName && tx.depotName) existing.depotName = tx.depotName;
    }
  }

  const finalTx = [...txMap.values()].sort((a, b) => a.datum.getTime() - b.datum.getTime());

  // Step 5: Build container objects using the merged transactions
  const konten = parseAccounts(doc, finalTx);
  const depots = parsePortfolios(doc, finalTx);
  const taxonomien = parseTaxonomies(doc);

  const debug: ImportDebugLog = {
    globalCollector: {
      totalElements: globalResult.totalElements,
      refElements: globalResult.refElements,
      parseFailed: globalResult.parseFailed,
      uniqueTx: globalResult.transaktionen.length,
      kontoTxCount: globalResult.kontoTxCount,
      depotTxCount: globalResult.depotTxCount,
      unassignedCount: globalResult.unassignedCount,
    },
    sparplaene: sparplanDebug,
    sparplanTxGenerated: generatedTx.length,
    finalTotal: finalTx.length,
    kontenCount: konten.length,
    depotsCount: depots.length,
    xmlStructure,
  };

  return {
    transaktionen: finalTx,
    wertpapierDaten,
    konten,
    depots,
    sparplaene,
    taxonomien,
    basisWaehrung,
    debug,
  };
}
