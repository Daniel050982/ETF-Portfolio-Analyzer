const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const numberFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// PP: Values.Share = "#,##0.########" → min 0, max 8 Dezimalstellen
const stueckFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 8 });
const prozentFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// PP: Values.Quote QUOTE_PATTERN = "#,##0.00######" → min 2, max 8 Dezimalstellen
const kursFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 8 });

/* PP rechnet mit BigDecimal und Values.MC = MathContext(10, HALF_UP), d.h. auf
   10 signifikante Stellen gerundet. Importierte Kurse tragen oft
   Float-Rauschen (z.B. 122,03500366 statt 122,035); auf 10 signifikante
   Stellen gerundet verschwindet es — exakt wie PP. */
function roundMC10(v: number): number {
  if (!isFinite(v) || v === 0) return v;
  const digits = Math.floor(Math.log10(Math.abs(v))) + 1;
  const decimals = Math.max(0, 10 - digits);
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

export function euro(v: number): string {
  return euroFormat.format(v);
}

// PP-exakte Kursanzeige (berechnete Werte wie Einstandskurs): auf 10
// signifikante Stellen gerundet (Values.MC), dann min 2, max 8 Dezimalstellen.
export function kurs(v: number): string {
  return kursFormat.format(roundMC10(v));
}

/* Roher Live-Marktkurs (aus der Online-Quelle, läuft durch eine float32-Spalte
   und trägt deshalb Rundungsrauschen wie 122,03500366 statt 122,035). float32
   hält nur ~7 signifikante Stellen verlässlich → auf 7 signifikante Stellen
   runden stellt den Originalkurs wieder her. PP speichert den Kurs als long
   mit fester Quote-Präzision und hat dieses Rauschen nicht. */
export function kursLive(v: number): string {
  if (!isFinite(v) || v === 0) return kursFormat.format(v);
  const digits = Math.floor(Math.log10(Math.abs(v))) + 1;
  const decimals = Math.max(0, 7 - digits);
  const f = Math.pow(10, decimals);
  return kursFormat.format(Math.round(v * f) / f);
}

export function num(v: number): string {
  return numberFormat.format(v);
}

export function stueck(v: number): string {
  return stueckFormat.format(v);
}

export function prozent(v: number): string {
  return prozentFormat.format(v) + ' %';
}

export function datumKurz(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function datumMonat(d: Date): string {
  return d.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
}
