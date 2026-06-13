import { useState } from 'react';
import type { Transaktion, Konto, Depot, Wertpapier } from '../types/portfolio';

/* ══════════════════════════════════════════════════════════════════════
   PP Transaktions-Dialoge — 1:1 nach Source:
   - AccountTransactionDialog.java  (Einlage, Entnahme, Steuern, Steuerrück-
     erstattung, Gebühren, Gebührenerstattung, Zinsen, Zinsbelastung, Dividende)
   - AccountTransferDialog.java     (Umbuchung Konto → Konto)
   - SecurityTransactionDialog.java (Kauf, Verkauf, Einlieferung, Auslieferung)
   - SecurityTransferDialog.java    (Wertpapierumbuchung Depot → Depot)
   Labels aus messages_de.properties / labels_de.properties.
   ══════════════════════════════════════════════════════════════════════ */

export type AccountTxTyp =
  | 'einlage' | 'entnahme' | 'steuern_tx' | 'steuererstattung'
  | 'gebuehren' | 'gebuehrenerstattung' | 'zinsen' | 'zinsbelastung' | 'dividende';

export type SecurityTxTyp = 'kauf' | 'verkauf' | 'einlieferung' | 'auslieferung';

// labels_de.properties (account.*) — Dialog-Titel = AccountTransaction.Type.toString()
const ACCOUNT_TX_TITLES: Record<AccountTxTyp, string> = {
  einlage: 'Einlage',
  entnahme: 'Entnahme',
  steuern_tx: 'Steuern',
  steuererstattung: 'Steuerrückerstattung',
  gebuehren: 'Gebühren',
  gebuehrenerstattung: 'Gebührenerstattung',
  zinsen: 'Zinsen',
  zinsbelastung: 'Zinsbelastung',
  dividende: 'Dividende',
};

// labels_de.properties (portfolio.*) — Dialog-Titel = PortfolioTransaction.Type.toString()
const SECURITY_TX_TITLES: Record<SecurityTxTyp, string> = {
  kauf: 'Kauf',
  verkauf: 'Verkauf',
  einlieferung: 'Einlieferung',
  auslieferung: 'Auslieferung',
};

// PP AccountListView.updateBalance(): DEPOSIT, INTEREST, DIVIDENDS, TAX_REFUND,
// SELL, TRANSFER_IN, FEES_REFUND = Gutschrift; Rest = Belastung
const CREDIT_TYPES = new Set<AccountTxTyp>(['einlage', 'zinsen', 'steuererstattung', 'gebuehrenerstattung', 'dividende']);

// PP AccountTransactionModel: Wertpapier-Combo für DIVIDENDS (Pflicht) sowie
// TAXES, TAX_REFUND, FEES, FEES_REFUND (optional, erster Eintrag EMPTY_SECURITY "-----")
const OPTIONAL_SECURITY_TYPES = new Set<AccountTxTyp>(['steuern_tx', 'steuererstattung', 'gebuehren', 'gebuehrenerstattung']);

function dateToInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayInput(): string {
  return dateToInput(new Date());
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}-${Math.floor(performance.now() * 1000)}`;
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--pp-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)',
  padding: '4px 8px', fontSize: 12, borderRadius: 2, width: '100%',
};
const LABEL_STYLE: React.CSSProperties = { color: 'var(--pp-text-muted)', whiteSpace: 'nowrap' };

function DialogShell({ title, error, onOk, onClose, okDisabled, children }: {
  title: string; error?: string | null; onOk: () => void; onClose: () => void; okDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-[480px] rounded shadow-lg" style={{ background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)' }} onClick={e => e.stopPropagation()}>
        <div className="px-4 py-2 text-[12px] font-semibold" style={{ background: 'var(--pp-header-bg)', borderBottom: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}>
          {title}
        </div>
        {error && (
          <div className="px-4 py-1 text-[11px]" style={{ color: 'var(--pp-red-text)' }}>{error}</div>
        )}
        <div className="p-4 grid gap-2 text-[11px]" style={{ gridTemplateColumns: 'max-content 1fr' }}>
          {children}
        </div>
        <div className="flex justify-end gap-2 px-4 py-2" style={{ borderTop: '1px solid var(--pp-border)' }}>
          <button type="button" onClick={onClose} className="px-3 py-1 text-[11px] rounded" style={{ background: 'var(--pp-bg)', color: 'var(--pp-text-muted)', border: '1px solid var(--pp-border)' }}>
            Abbrechen
          </button>
          <button type="button" onClick={onOk} disabled={okDisabled} className="px-4 py-1 text-[11px] rounded" style={{ background: 'var(--pp-accent)', color: '#000', fontWeight: 600, opacity: okDisabled ? 0.5 : 1 }}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span style={{ ...LABEL_STYLE, alignSelf: 'center' }}>{label}</span>
      <span>{children}</span>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   AccountTransactionDialog — PP AccountTransactionDialog.java
   Felder: [Wertpapier] | Konto | Datum | [Stück, Dividende pro Stück] |
   Betrag (Bruttowert/Gutschrift/Belastung) | [Steuern] | [Gesamtbetrag] | Notiz
   ══════════════════════════════════════════════════════════════════════ */
export function AccountTransactionDialog({ typ, konten, wertpapiere, preselectedKonto, initial, mode = 'new', onSave, onClose }: {
  typ: AccountTxTyp;
  konten: Record<string, Konto>;
  wertpapiere: Record<string, Wertpapier>;
  preselectedKonto?: string;
  initial?: Transaktion;
  mode?: 'new' | 'edit';
  onSave: (txs: Transaktion[]) => void;
  onClose: () => void;
}) {
  const isDividende = typ === 'dividende';
  const showSecurity = isDividende || OPTIONAL_SECURITY_TYPES.has(typ);
  const kontoNames = Object.keys(konten);
  const wpKeys = Object.keys(wertpapiere).filter(k => !wertpapiere[k].isExchangeRate);
  const initialWpKey = initial
    ? wpKeys.find(k => (initial.isin && wertpapiere[k].isin === initial.isin) || wertpapiere[k].name === initial.wertpapierName) ?? ''
    : undefined;

  const [kontoName, setKontoName] = useState(initial?.kontoName ?? preselectedKonto ?? kontoNames[0] ?? '');
  // PP: EMPTY_SECURITY ("-----") ist erster Eintrag bei optionalem Wertpapier
  const [wpKey, setWpKey] = useState(initialWpKey ?? (isDividende ? (wpKeys[0] ?? '') : ''));
  const [datum, setDatum] = useState(initial ? dateToInput(initial.datum) : todayInput());
  const [stueckVal, setStueckVal] = useState(initial && initial.stueck > 0 ? String(initial.stueck).replace('.', ',') : '');
  const [betrag, setBetrag] = useState(initial ? initial.betrag.toFixed(2).replace('.', ',') : '');
  const [steuern, setSteuern] = useState(initial && initial.steuern > 0 ? initial.steuern.toFixed(2).replace('.', ',') : '');
  const [notiz, setNotiz] = useState(initial?.notiz ?? '');

  // PP getTotalLabel(): supportsTaxUnits → ColumnGrossValue, sonst Credit/Debit-Note
  const betragLabel = isDividende ? 'Bruttowert' : (CREDIT_TYPES.has(typ) ? 'Gutschrift' : 'Belastung');

  const betragNum = parseFloat(betrag.replace(',', '.')) || 0;
  const steuernNum = parseFloat(steuern.replace(',', '.')) || 0;
  const total = betragNum - steuernNum;

  // PP Validierung: MsgMissingAccount / MsgMissingSecurity
  const error = !kontoName ? 'Konto fehlt'
    : (isDividende && !wpKey) ? 'Wertpapier fehlt'
    : null;

  const handleOk = () => {
    if (error || betragNum <= 0) return;
    const wp = wpKey ? wertpapiere[wpKey] : undefined;
    onSave([{
      id: mode === 'edit' && initial ? initial.id : newId(),
      datum: new Date(datum),
      typ,
      isin: wp?.isin ?? '',
      wertpapierName: wp?.name ?? '',
      stueck: isDividende ? (parseFloat(stueckVal.replace(',', '.')) || 0) : 0,
      kurs: 0,
      betrag: betragNum,
      gebuehren: 0,
      steuern: isDividende ? steuernNum : 0,
      waehrung: konten[kontoName]?.waehrung ?? 'EUR',
      notiz: notiz || undefined,
      quelle: 'manuell',
      kontoName,
    }]);
    onClose();
  };

  return (
    <DialogShell title={ACCOUNT_TX_TITLES[typ]} error={error} onOk={handleOk} onClose={onClose} okDisabled={!!error || betragNum <= 0}>
      {showSecurity && (
        <Row label="Wertpapier">
          <select value={wpKey} onChange={e => setWpKey(e.target.value)} style={INPUT_STYLE}>
            {!isDividende && <option value="">-----</option>}
            {wpKeys.map(k => <option key={k} value={k}>{wertpapiere[k].name}</option>)}
          </select>
        </Row>
      )}
      <Row label="Konto">
        <select value={kontoName} onChange={e => setKontoName(e.target.value)} style={INPUT_STYLE}>
          {kontoNames.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </Row>
      <Row label="Datum">
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={INPUT_STYLE} />
      </Row>
      {isDividende && (
        <>
          <Row label="Stück">
            <input type="text" inputMode="decimal" value={stueckVal} onChange={e => setStueckVal(e.target.value)} style={INPUT_STYLE} />
          </Row>
          {/* PP LabelDividendPerShare — berechnet aus Bruttowert / Stück */}
          <Row label="Dividende pro Stück">
            <input type="text" readOnly style={{ ...INPUT_STYLE, opacity: 0.7 }}
              value={(() => {
                const s = parseFloat(stueckVal.replace(',', '.')) || 0;
                return s > 0 ? (betragNum / s).toFixed(4).replace('.', ',') : '';
              })()} />
          </Row>
        </>
      )}
      <Row label={betragLabel}>
        <input type="text" inputMode="decimal" value={betrag} onChange={e => setBetrag(e.target.value)} style={INPUT_STYLE} placeholder="0,00" />
      </Row>
      {isDividende && (
        <>
          <Row label="Steuern">
            <input type="text" inputMode="decimal" value={steuern} onChange={e => setSteuern(e.target.value)} style={INPUT_STYLE} placeholder="0,00" />
          </Row>
          <Row label="Gutschrift">
            <input type="text" value={total.toFixed(2).replace('.', ',')} readOnly style={{ ...INPUT_STYLE, opacity: 0.7 }} />
          </Row>
        </>
      )}
      <Row label="Notiz">
        <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} style={{ ...INPUT_STYLE, resize: 'vertical' }} />
      </Row>
    </DialogShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   AccountTransferDialog — PP AccountTransferDialog.java
   Titel: LabelTransfer = "Umbuchung". Felder: Von | Nach | Datum | Betrag | Notiz
   ══════════════════════════════════════════════════════════════════════ */
export function AccountTransferDialog({ konten, preselectedKonto, onSave, onClose }: {
  konten: Record<string, Konto>;
  preselectedKonto?: string;
  onSave: (txs: Transaktion[]) => void;
  onClose: () => void;
}) {
  const kontoNames = Object.keys(konten);
  const [von, setVon] = useState(preselectedKonto ?? kontoNames[0] ?? '');
  const [nach, setNach] = useState(kontoNames.find(k => k !== (preselectedKonto ?? kontoNames[0])) ?? '');
  const [datum, setDatum] = useState(todayInput());
  const [betrag, setBetrag] = useState('');
  const [notiz, setNotiz] = useState('');

  const betragNum = parseFloat(betrag.replace(',', '.')) || 0;

  // PP: MsgAccountFromMissing / MsgAccountToMissing / MsgAccountMustBeDifferent
  const error = !von ? 'Quellkonto fehlt'
    : !nach ? 'Zielkonto fehlt'
    : von === nach ? 'Quell- und Zielkonto müssen unterschiedlich sein'
    : null;

  const handleOk = () => {
    if (error || betragNum <= 0) return;
    const d = new Date(datum);
    const base = {
      datum: d, isin: '', wertpapierName: '', stueck: 0, kurs: 0,
      betrag: betragNum, gebuehren: 0, steuern: 0,
      waehrung: konten[von]?.waehrung ?? 'EUR',
      notiz: notiz || undefined, quelle: 'manuell' as const,
    };
    onSave([
      { ...base, id: newId(), typ: 'umbuchung_aus', kontoName: von, gegenkontoName: nach },
      { ...base, id: newId(), typ: 'umbuchung_ein', kontoName: nach, gegenkontoName: von },
    ]);
    onClose();
  };

  return (
    <DialogShell title="Umbuchung" error={error} onOk={handleOk} onClose={onClose} okDisabled={!!error || betragNum <= 0}>
      <Row label="Von">
        <select value={von} onChange={e => setVon(e.target.value)} style={INPUT_STYLE}>
          {kontoNames.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </Row>
      <Row label="Nach">
        <select value={nach} onChange={e => setNach(e.target.value)} style={INPUT_STYLE}>
          {kontoNames.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </Row>
      <Row label="Datum">
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={INPUT_STYLE} />
      </Row>
      <Row label="Betrag">
        <input type="text" inputMode="decimal" value={betrag} onChange={e => setBetrag(e.target.value)} style={INPUT_STYLE} placeholder="0,00" />
      </Row>
      <Row label="Notiz">
        <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} style={{ ...INPUT_STYLE, resize: 'vertical' }} />
      </Row>
    </DialogShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SecurityTransactionDialog — PP SecurityTransactionDialog.java
   Felder: Wertpapier | Depot | [Konto] | Datum | Stück | x Kurs | = |
   +/- Gebühren | +/- Steuern | = Belastung/Gutschrift/Wert der Ein-/Auslieferung | Notiz
   ══════════════════════════════════════════════════════════════════════ */
export function SecurityTransactionDialog({ typ, konten, depots, wertpapiere, preselectedDepot, preselectedKonto, initial, mode = 'new', onSave, onClose }: {
  typ: SecurityTxTyp;
  konten: Record<string, Konto>;
  depots: Record<string, Depot>;
  wertpapiere: Record<string, Wertpapier>;
  preselectedDepot?: string;
  preselectedKonto?: string;
  initial?: Transaktion;
  mode?: 'new' | 'edit';
  onSave: (txs: Transaktion[]) => void;
  onClose: () => void;
}) {
  const isKaufVerkauf = typ === 'kauf' || typ === 'verkauf';
  const kontoNames = Object.keys(konten);
  const depotNames = Object.keys(depots);
  const wpKeys = Object.keys(wertpapiere).filter(k => !wertpapiere[k].isExchangeRate);
  const initialWpKey = initial
    ? wpKeys.find(k => (initial.isin && wertpapiere[k].isin === initial.isin) || wertpapiere[k].name === initial.wertpapierName) ?? ''
    : undefined;

  const [wpKey, setWpKey] = useState(initialWpKey ?? wpKeys[0] ?? '');
  const [depotName, setDepotName] = useState(initial?.depotName ?? preselectedDepot ?? depotNames[0] ?? '');
  const defaultKonto = initial?.kontoName ?? preselectedKonto
    ?? (preselectedDepot ? depots[preselectedDepot]?.referenzkontoName : undefined)
    ?? kontoNames[0] ?? '';
  const [kontoName, setKontoName] = useState(defaultKonto);
  const [datum, setDatum] = useState(initial ? dateToInput(initial.datum) : todayInput());
  const [stueckVal, setStueckVal] = useState(initial && initial.stueck > 0 ? String(initial.stueck).replace('.', ',') : '');
  const [kurs, setKurs] = useState(initial && initial.kurs > 0 ? String(initial.kurs).replace('.', ',') : '');
  const [gebuehren, setGebuehren] = useState(initial && initial.gebuehren > 0 ? initial.gebuehren.toFixed(2).replace('.', ',') : '');
  const [steuern, setSteuern] = useState(initial && initial.steuern > 0 ? initial.steuern.toFixed(2).replace('.', ',') : '');
  const [notiz, setNotiz] = useState(initial?.notiz ?? '');

  const stueckNum = parseFloat(stueckVal.replace(',', '.')) || 0;
  const kursNum = parseFloat(kurs.replace(',', '.')) || 0;
  const gebNum = parseFloat(gebuehren.replace(',', '.')) || 0;
  const stNum = parseFloat(steuern.replace(',', '.')) || 0;
  const brutto = stueckNum * kursNum;

  // PP: BUY/DELIVERY_INBOUND → "+", SELL/DELIVERY_OUTBOUND → "-" (Zeilen 301-314)
  const sign = (typ === 'kauf' || typ === 'einlieferung') ? '+ ' : '- ';
  const total = (typ === 'kauf' || typ === 'einlieferung') ? brutto + gebNum + stNum : brutto - gebNum - stNum;

  // PP getTotalLabel() (Zeilen 316-331)
  const totalLabel = typ === 'kauf' ? 'Belastung'
    : typ === 'verkauf' ? 'Gutschrift'
    : typ === 'einlieferung' ? 'Wert der Einlieferung'
    : 'Wert der Auslieferung';

  // PP: MsgMissingSecurity / MsgMissingPortfolio / MsgMissingAccount
  const error = !wpKey ? 'Wertpapier fehlt'
    : !depotName ? 'Depot fehlt'
    : (isKaufVerkauf && !kontoName) ? 'Konto fehlt'
    : null;

  const handleOk = () => {
    if (error || stueckNum <= 0) return;
    const wp = wertpapiere[wpKey];
    onSave([{
      id: mode === 'edit' && initial ? initial.id : newId(),
      datum: new Date(datum),
      typ: typ === 'kauf' ? 'kauf' : typ === 'verkauf' ? 'verkauf' : typ === 'einlieferung' ? 'umbuchung_ein' : 'umbuchung_aus',
      isin: wp?.isin ?? '',
      wertpapierName: wp?.name ?? wpKey,
      stueck: stueckNum,
      kurs: kursNum,
      betrag: brutto,
      gebuehren: gebNum,
      steuern: stNum,
      waehrung: wp?.waehrung ?? 'EUR',
      notiz: notiz || undefined,
      quelle: 'manuell',
      depotName,
      kontoName: isKaufVerkauf ? kontoName : undefined,
    }]);
    onClose();
  };

  return (
    <DialogShell title={SECURITY_TX_TITLES[typ]} error={error} onOk={handleOk} onClose={onClose} okDisabled={!!error || stueckNum <= 0}>
      <Row label="Wertpapier">
        <select value={wpKey} onChange={e => setWpKey(e.target.value)} style={INPUT_STYLE}>
          {wpKeys.map(k => <option key={k} value={k}>{wertpapiere[k].name}</option>)}
        </select>
      </Row>
      <Row label="Depot">
        <select value={depotName} onChange={e => setDepotName(e.target.value)} style={INPUT_STYLE}>
          {depotNames.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </Row>
      {isKaufVerkauf && (
        <Row label="Konto">
          <select value={kontoName} onChange={e => setKontoName(e.target.value)} style={INPUT_STYLE}>
            {kontoNames.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </Row>
      )}
      <Row label="Datum">
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={INPUT_STYLE} />
      </Row>
      <Row label="Stück">
        <input type="text" inputMode="decimal" value={stueckVal} onChange={e => setStueckVal(e.target.value)} style={INPUT_STYLE} />
      </Row>
      <Row label="x Kurs">
        <input type="text" inputMode="decimal" value={kurs} onChange={e => setKurs(e.target.value)} style={INPUT_STYLE} placeholder="0,00" />
      </Row>
      <Row label="=">
        <input type="text" value={brutto.toFixed(2).replace('.', ',')} readOnly style={{ ...INPUT_STYLE, opacity: 0.7 }} />
      </Row>
      <Row label={sign + 'Gebühren'}>
        <input type="text" inputMode="decimal" value={gebuehren} onChange={e => setGebuehren(e.target.value)} style={INPUT_STYLE} placeholder="0,00" />
      </Row>
      <Row label={sign + 'Steuern'}>
        <input type="text" inputMode="decimal" value={steuern} onChange={e => setSteuern(e.target.value)} style={INPUT_STYLE} placeholder="0,00" />
      </Row>
      <Row label={'= ' + totalLabel}>
        <input type="text" value={total.toFixed(2).replace('.', ',')} readOnly style={{ ...INPUT_STYLE, opacity: 0.7 }} />
      </Row>
      <Row label="Notiz">
        <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} style={{ ...INPUT_STYLE, resize: 'vertical' }} />
      </Row>
    </DialogShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SecurityTransferDialog — PP SecurityTransferDialog.java
   Titel: LabelSecurityTransfer = "Wertpapierumbuchung".
   Felder: Wertpapier | Von | Nach | Datum | Stück | x Kurs | = | Notiz
   ══════════════════════════════════════════════════════════════════════ */
export function SecurityTransferDialog({ depots, wertpapiere, preselectedDepot, onSave, onClose }: {
  depots: Record<string, Depot>;
  wertpapiere: Record<string, Wertpapier>;
  preselectedDepot?: string;
  onSave: (txs: Transaktion[]) => void;
  onClose: () => void;
}) {
  const depotNames = Object.keys(depots);
  const wpKeys = Object.keys(wertpapiere).filter(k => !wertpapiere[k].isExchangeRate);

  const [wpKey, setWpKey] = useState(wpKeys[0] ?? '');
  const [von, setVon] = useState(preselectedDepot ?? depotNames[0] ?? '');
  const [nach, setNach] = useState(depotNames.find(d => d !== (preselectedDepot ?? depotNames[0])) ?? '');
  const [datum, setDatum] = useState(todayInput());
  const [stueckVal, setStueckVal] = useState('');
  const [kurs, setKurs] = useState('');
  const [notiz, setNotiz] = useState('');

  const stueckNum = parseFloat(stueckVal.replace(',', '.')) || 0;
  const kursNum = parseFloat(kurs.replace(',', '.')) || 0;
  const betrag = stueckNum * kursNum;

  // PP: MsgMissingSecurity / MsgPortfolioFromMissing / MsgPortfolioToMissing / MsgPortfolioMustBeDifferent
  const error = !wpKey ? 'Wertpapier fehlt'
    : !von ? 'Quelldepot fehlt'
    : !nach ? 'Zieldepot fehlt'
    : von === nach ? 'Quell- und Zieldepot müssen unterschiedlich sein'
    : null;

  const handleOk = () => {
    if (error || stueckNum <= 0) return;
    const wp = wertpapiere[wpKey];
    const base = {
      datum: new Date(datum),
      isin: wp?.isin ?? '',
      wertpapierName: wp?.name ?? wpKey,
      stueck: stueckNum, kurs: kursNum, betrag,
      gebuehren: 0, steuern: 0,
      waehrung: wp?.waehrung ?? 'EUR',
      notiz: notiz || undefined, quelle: 'manuell' as const,
    };
    onSave([
      { ...base, id: newId(), typ: 'umbuchung_aus', depotName: von, gegenkontoName: nach },
      { ...base, id: newId(), typ: 'umbuchung_ein', depotName: nach, gegenkontoName: von },
    ]);
    onClose();
  };

  return (
    <DialogShell title="Wertpapierumbuchung" error={error} onOk={handleOk} onClose={onClose} okDisabled={!!error || stueckNum <= 0}>
      <Row label="Wertpapier">
        <select value={wpKey} onChange={e => setWpKey(e.target.value)} style={INPUT_STYLE}>
          {wpKeys.map(k => <option key={k} value={k}>{wertpapiere[k].name}</option>)}
        </select>
      </Row>
      <Row label="Von">
        <select value={von} onChange={e => setVon(e.target.value)} style={INPUT_STYLE}>
          {depotNames.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </Row>
      <Row label="Nach">
        <select value={nach} onChange={e => setNach(e.target.value)} style={INPUT_STYLE}>
          {depotNames.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </Row>
      <Row label="Datum">
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={INPUT_STYLE} />
      </Row>
      <Row label="Stück">
        <input type="text" inputMode="decimal" value={stueckVal} onChange={e => setStueckVal(e.target.value)} style={INPUT_STYLE} />
      </Row>
      <Row label="x Kurs">
        <input type="text" inputMode="decimal" value={kurs} onChange={e => setKurs(e.target.value)} style={INPUT_STYLE} placeholder="0,00" />
      </Row>
      <Row label="=">
        <input type="text" value={betrag.toFixed(2).replace('.', ',')} readOnly style={{ ...INPUT_STYLE, opacity: 0.7 }} />
      </Row>
      <Row label="Notiz">
        <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} style={{ ...INPUT_STYLE, resize: 'vertical' }} />
      </Row>
    </DialogShell>
  );
}
