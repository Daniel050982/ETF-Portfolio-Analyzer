export interface Transaktion {
  id: string;
  datum: Date;
  typ: 'kauf' | 'verkauf' | 'dividende' | 'ausschuettung';
  isin: string;
  wertpapierName: string;
  stueck: number;
  kurs: number;
  betrag: number;
  gebuehren: number;
  steuern: number;
  waehrung: string;
  notiz?: string;
}

export interface FifoPosten {
  kaufDatum: Date;
  stueck: number;
  kaufkurs: number;
  kaufbetrag: number;
}

export interface Wertpapier {
  isin: string;
  name: string;
  typ: 'ETF' | 'Aktie' | 'Fonds' | 'Sonstige';
  waehrung: string;
  bestand: number;
  durchschnittskurs: number;
  investiert: number;
  fifoPosten: FifoPosten[];
  transaktionen: Transaktion[];
  dividendenGesamt: number;
}

export interface SteuerPosition {
  isin: string;
  name: string;
  verkaufDatum: Date;
  kaufDatum: Date;
  stueck: number;
  kaufkurs: number;
  verkaufkurs: number;
  gewinn: number;
  haltedauerTage: number;
}

export interface SteuerJahr {
  jahr: number;
  realisierteGewinne: number;
  realisierteVerluste: number;
  saldo: number;
  sparerPauschbetrag: number;
  steuerpflichtig: number;
  abgeltungsteuer: number;
  soli: number;
  steuerGesamt: number;
  positionen: SteuerPosition[];
  dividenden: number;
}

export interface PortfolioSnapshot {
  datum: Date;
  investiert: number;
  marktwert: number;
  gewinn: number;
  renditeAbs: number;
}

export interface PortfolioState {
  wertpapiere: Record<string, Wertpapier>;
  transaktionen: Transaktion[];
  steuerJahre: Record<number, SteuerJahr>;
}
