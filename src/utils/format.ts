const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const numberFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const stueckFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const prozentFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function euro(v: number): string {
  return euroFormat.format(v);
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
