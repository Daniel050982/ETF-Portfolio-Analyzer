import { useState, useMemo } from 'react';

/* ══════════════════════════════════════════════════════════════════════
   ReportingPeriodDialog — 1:1-Nachbau des PP ReportingPeriodDialog.java.
   Erlaubt das Anlegen eines Berichtszeitraums über dieselben Optionen wie PP:
   Letzte X Jahre/Monate · Letzte X Tage · Letzte X Handelstage · Von–bis ·
   Seit · Jahr · Aktuelle (Woche/Monat/Quartal/Jahr-YTD) · Vorige
   (Tag/Handelstag/Woche/Monat/Quartal/Jahr). Oben steht der dynamisch
   berechnete Intervall-Text (Ende des ersten Tages → Ende des letzten Tages).
   Labels exakt aus messages_de.properties.
   ══════════════════════════════════════════════════════════════════════ */

export type ReportingPeriodMode =
  | 'lastXY' | 'lastDays' | 'lastTradingDays' | 'fromTo' | 'since' | 'year'
  | 'currentWeek' | 'currentMonth' | 'currentQuarter' | 'ytd'
  | 'prevDay' | 'prevTradingDay' | 'prevWeek' | 'prevMonth' | 'prevQuarter' | 'prevYear';

/* Das Ergebnis eines angelegten Berichtszeitraums:
   - key: stabiler Schlüssel (für Spalten-IDs / Persistenz)
   - label: Anzeigename
   - days: Tage zurück ab heute (oder null bei fixen Intervallen)
   - interval: konkretes [start, end] (für die Berechnung) */
export interface ReportingPeriodResult {
  key: string;
  label: string;
  days: number | null;
  start: Date;
  end: Date;
}

const dmy = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
const parseDmy = (s: string): Date | null => {
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
const startOfWeek = (d: Date) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }; // Montag
const quarterStart = (d: Date) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);

export function ReportingPeriodDialog({ onClose, onSelect }: {
  onClose: () => void;
  onSelect: (result: ReportingPeriodResult) => void;
}) {
  const [mode, setMode] = useState<ReportingPeriodMode>('lastXY');
  const [years, setYears] = useState(1);
  const [months, setMonths] = useState(0);
  const [days, setDays] = useState(365);
  const [tradingDays, setTradingDays] = useState(253);
  const [yearVal, setYearVal] = useState(new Date().getFullYear());
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);
  const [fromStr, setFromStr] = useState(() => dmy(addDays(today, -365)));
  const [toStr, setToStr] = useState(() => dmy(today));
  const [sinceStr, setSinceStr] = useState(() => dmy(addDays(today, -365)));

  // Berechnet [start, end] + Label + key analog PP ReportingPeriod.toInterval()
  const compute = (): ReportingPeriodResult => {
    const end = today;
    switch (mode) {
      case 'lastXY': {
        const start = new Date(end); start.setFullYear(start.getFullYear() - years); start.setMonth(start.getMonth() - months);
        const parts: string[] = [];
        if (years > 0) parts.push(years === 1 ? '1 Jahr' : `${years} Jahre`);
        if (months > 0) parts.push(months === 1 ? '1 Monat' : `${months} Monate`);
        return { key: `LX${years}_${months}`, label: parts.join(', ') || '0 Monate', days: daysBetween(start, end), start, end };
      }
      case 'lastDays': {
        const start = addDays(end, -days);
        return { key: `LD${days}`, label: days === 1 ? '1 Tag' : `${days} Tage`, days, start, end };
      }
      case 'lastTradingDays': {
        // Näherung: Handelstage ~ Kalendertage × 7/5
        const cal = Math.round(tradingDays * 7 / 5);
        const start = addDays(end, -cal);
        return { key: `LT${tradingDays}`, label: tradingDays === 1 ? '1 Handelstag' : `${tradingDays} Handelstage`, days: cal, start, end };
      }
      case 'fromTo': {
        const s = parseDmy(fromStr) ?? addDays(end, -365);
        const e = parseDmy(toStr) ?? end;
        return { key: `FT${dmy(s)}_${dmy(e)}`, label: `${dmy(s)} - ${dmy(e)}`, days: null, start: s, end: e };
      }
      case 'since': {
        const s = parseDmy(sinceStr) ?? addDays(end, -365);
        return { key: `SX${dmy(s)}`, label: `seit ${dmy(s)}`, days: null, start: s, end };
      }
      case 'year': {
        const s = new Date(yearVal, 0, 1);
        const e = new Date(yearVal, 11, 31);
        return { key: `Y${yearVal}`, label: String(yearVal), days: null, start: s, end: e };
      }
      case 'currentWeek':    { const s = startOfWeek(end);                                   return { key: 'CW', label: 'Aktuelle Woche', days: null, start: s, end }; }
      case 'currentMonth':   { const s = new Date(end.getFullYear(), end.getMonth(), 1);     return { key: 'CM', label: 'Aktueller Monat', days: null, start: s, end }; }
      case 'currentQuarter': { const s = quarterStart(end);                                  return { key: 'CQ', label: 'Aktuelles Quartal', days: null, start: s, end }; }
      case 'ytd':            { const s = new Date(end.getFullYear(), 0, 1);                  return { key: 'ytd', label: 'Aktuelles Jahr (YTD)', days: null, start: s, end }; }
      case 'prevDay':        { const s = addDays(end, -1);                                   return { key: 'PD', label: 'Voriger Tag', days: null, start: s, end: s }; }
      case 'prevTradingDay': { const s = addDays(end, -1);                                   return { key: 'PTD', label: 'Voriger Handelstag', days: null, start: s, end: s }; }
      case 'prevWeek':       { const s = startOfWeek(addDays(startOfWeek(end), -1)); const e = addDays(startOfWeek(end), -1); return { key: 'PW', label: 'Vorwoche', days: null, start: s, end: e }; }
      case 'prevMonth':      { const s = new Date(end.getFullYear(), end.getMonth() - 1, 1); const e = new Date(end.getFullYear(), end.getMonth(), 0); return { key: 'PM', label: 'Voriger Monat', days: null, start: s, end: e }; }
      case 'prevQuarter':    { const qs = quarterStart(end); const e = addDays(qs, -1); const s = quarterStart(e); return { key: 'PQ', label: 'Voriges Quartal', days: null, start: s, end: e }; }
      case 'prevYear':       { const s = new Date(end.getFullYear() - 1, 0, 1); const e = new Date(end.getFullYear() - 1, 11, 31); return { key: 'PY', label: 'Voriges Jahr', days: null, start: s, end: e }; }
    }
  };

  const result = compute();

  const radioStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12, color: 'var(--pp-text)' };
  const inputStyle: React.CSSProperties = { width: 56, padding: '2px 4px', fontSize: 12, background: 'var(--pp-content-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)', borderRadius: 2, textAlign: 'center' };
  const dateStyle: React.CSSProperties = { width: 110, padding: '2px 4px', fontSize: 12, background: 'var(--pp-content-bg)', color: 'var(--pp-text)', border: '1px solid var(--pp-border)', borderRadius: 2 };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="rounded shadow-xl" style={{ background: 'var(--pp-sidebar-bg)', border: '1px solid var(--pp-border)', padding: 16, minWidth: 400 }} onClick={e => e.stopPropagation()}>
        {/* Titelzeile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--pp-text)' }}>Berichtszeitraum</span>
        </div>
        {/* Dynamische Intervall-Vorschau (zentriert, fett) */}
        <div style={{ textAlign: 'center', fontWeight: 600, fontSize: 13, color: 'var(--pp-text)', marginBottom: 8 }}>
          {dmy(result.start)} - {dmy(result.end)}
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--pp-text-muted)', marginBottom: 14 }}>
          Der Berichtszeitraum erstreckt sich vom Ende des ersten Tages bis zum Ende des letzten Tages.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={radioStyle}>
            <input type="radio" checked={mode === 'lastXY'} onChange={() => setMode('lastXY')} style={{ accentColor: 'var(--pp-accent)' }} />
            Letzte <input type="number" value={years} min={0} onChange={e => { setYears(+e.target.value); setMode('lastXY'); }} style={inputStyle} /> Jahre
            <input type="number" value={months} min={0} max={11} onChange={e => { setMonths(+e.target.value); setMode('lastXY'); }} style={inputStyle} /> Monate
          </label>
          <label style={radioStyle}>
            <input type="radio" checked={mode === 'lastDays'} onChange={() => setMode('lastDays')} style={{ accentColor: 'var(--pp-accent)' }} />
            Letzte <input type="number" value={days} min={1} onChange={e => { setDays(+e.target.value); setMode('lastDays'); }} style={inputStyle} /> Tage
          </label>
          <label style={radioStyle}>
            <input type="radio" checked={mode === 'lastTradingDays'} onChange={() => setMode('lastTradingDays')} style={{ accentColor: 'var(--pp-accent)' }} />
            Letzte <input type="number" value={tradingDays} min={1} onChange={e => { setTradingDays(+e.target.value); setMode('lastTradingDays'); }} style={inputStyle} /> Handelstage
          </label>
          <label style={radioStyle}>
            <input type="radio" checked={mode === 'fromTo'} onChange={() => setMode('fromTo')} style={{ accentColor: 'var(--pp-accent)' }} />
            Von <input type="text" value={fromStr} onChange={e => { setFromStr(e.target.value); setMode('fromTo'); }} style={dateStyle} />
            <span style={{ color: 'var(--pp-text-muted)' }}>(ausschl.)</span>
            bis <input type="text" value={toStr} onChange={e => { setToStr(e.target.value); setMode('fromTo'); }} style={dateStyle} />
          </label>
          <label style={radioStyle}>
            <input type="radio" checked={mode === 'since'} onChange={() => setMode('since')} style={{ accentColor: 'var(--pp-accent)' }} />
            Seit <input type="text" value={sinceStr} onChange={e => { setSinceStr(e.target.value); setMode('since'); }} style={dateStyle} />
            <span style={{ color: 'var(--pp-text-muted)' }}>(ausschl.)</span>
          </label>
          <label style={radioStyle}>
            <input type="radio" checked={mode === 'year'} onChange={() => setMode('year')} style={{ accentColor: 'var(--pp-accent)' }} />
            Jahr <input type="number" value={yearVal} min={1900} max={2100} onChange={e => { setYearVal(+e.target.value); setMode('year'); }} style={{ ...inputStyle, width: 70 }} />
          </label>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--pp-text)', fontWeight: 500 }}>Aktuelle</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
          {(['currentWeek', 'currentMonth', 'currentQuarter', 'ytd'] as const).map(m => (
            <label key={m} style={{ ...radioStyle, fontSize: 11 }}>
              <input type="radio" checked={mode === m} onChange={() => setMode(m)} style={{ accentColor: 'var(--pp-accent)' }} />
              {{ currentWeek: 'Woche', currentMonth: 'Monat', currentQuarter: 'Quartal', ytd: 'Jahr (YTD)' }[m]}
            </label>
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--pp-text)', fontWeight: 500 }}>Vorige</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
          {(['prevDay', 'prevTradingDay', 'prevWeek', 'prevMonth', 'prevQuarter', 'prevYear'] as const).map(m => (
            <label key={m} style={{ ...radioStyle, fontSize: 11 }}>
              <input type="radio" checked={mode === m} onChange={() => setMode(m)} style={{ accentColor: 'var(--pp-accent)' }} />
              {{ prevDay: 'Tag', prevTradingDay: 'Handelstag', prevWeek: 'Woche', prevMonth: 'Monat', prevQuarter: 'Quartal', prevYear: 'Jahr' }[m]}
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={() => { onSelect(compute()); onClose(); }}
            style={{ padding: '4px 24px', fontSize: 12, background: 'var(--pp-accent)', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
            OK
          </button>
          <button onClick={onClose}
            style={{ padding: '4px 20px', fontSize: 12, background: 'var(--pp-border)', color: 'var(--pp-text)', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
