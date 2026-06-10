export interface Transaktion {
  id: string;
  datum: Date;
  typ: 'kauf' | 'verkauf' | 'dividende' | 'ausschuettung' | 'einlage' | 'entnahme' | 'zinsen' | 'gebuehren' | 'steuern_tx' | 'steuererstattung' | 'umbuchung_ein' | 'umbuchung_aus';
  isin: string;
  wertpapierName: string;
  stueck: number;
  kurs: number;
  betrag: number;
  gebuehren: number;
  steuern: number;
  waehrung: string;
  notiz?: string;
  quelle?: string;
  kontoName?: string;
  depotName?: string;
  gegenkontoName?: string;
}

export interface FifoPosten {
  kaufDatum: Date;
  stueck: number;
  kaufkurs: number;
  kaufbetrag: number;
}

export interface KursEintrag {
  datum: Date;
  kurs: number;
}

export interface Wertpapier {
  uuid?: string;
  isin: string;
  wkn?: string;
  symbol?: string;
  name: string;
  typ: 'ETF' | 'Aktie' | 'Fonds' | 'Anleihe' | 'Krypto' | 'Sonstige';
  waehrung: string;
  bestand: number;
  durchschnittskurs: number;
  investiert: number;
  fifoPosten: FifoPosten[];
  transaktionen: Transaktion[];
  dividendenGesamt: number;
  kursHistorie: KursEintrag[];
  letzterKurs?: number;
  letzterKursDatum?: Date;
  marktwert?: number;
  unrealisierterGewinn?: number;
  unrealisierterGewinnProzent?: number;
  feed?: string;
  feedUrl?: string;
  istInaktiv?: boolean;
}

export interface Konto {
  uuid?: string;
  name: string;
  waehrung: string;
  notiz?: string;
  saldo: number;
  transaktionen: Transaktion[];
  istInaktiv?: boolean;
}

export interface Depot {
  uuid?: string;
  name: string;
  referenzkontoName?: string;
  notiz?: string;
  transaktionen: Transaktion[];
  istInaktiv?: boolean;
}

export interface Sparplan {
  name: string;
  wertpapierKey: string;
  depotName: string;
  kontoName: string;
  intervall: number;
  betrag: number;
  startDatum: Date;
  aktiv: boolean;
}

export interface KlassifizierungZuweisung {
  wertpapierKey: string;
  gewicht: number;
}

export interface Klassifizierung {
  id: string;
  name: string;
  farbe: string;
  kinder: Klassifizierung[];
  zuweisungen: KlassifizierungZuweisung[];
}

export interface Taxonomie {
  id: string;
  name: string;
  wurzel: Klassifizierung;
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
  verlustvortrag: number;
}

export interface PortfolioSnapshot {
  datum: Date;
  investiert: number;
  marktwert: number;
  gewinn: number;
  renditeAbs: number;
}

export interface PerformanceDaten {
  ttwror: number;
  irr: number;
  maxDrawdown: number;
  volatilitaet: number;
  snapshots: PortfolioSnapshot[];
}

export interface PortfolioState {
  wertpapiere: Record<string, Wertpapier>;
  transaktionen: Transaktion[];
  steuerJahre: Record<number, SteuerJahr>;
  konten: Record<string, Konto>;
  depots: Record<string, Depot>;
  sparplaene: Sparplan[];
  taxonomien: Taxonomie[];
  performance?: PerformanceDaten;
  basisWaehrung: string;
}
