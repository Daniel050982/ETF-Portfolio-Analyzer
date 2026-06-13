export interface Transaktion {
  id: string;
  datum: Date;
  typ: 'kauf' | 'verkauf' | 'dividende' | 'ausschuettung' | 'einlage' | 'entnahme' | 'zinsen' | 'zinsbelastung' | 'gebuehren' | 'gebuehrenerstattung' | 'steuern_tx' | 'steuererstattung' | 'umbuchung_ein' | 'umbuchung_aus';
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
  typ: 'ETF' | 'Aktie' | 'Fonds' | 'Anleihe' | 'Krypto' | 'Sonstige' | 'Optionsschein' | 'Index' | 'Währung';
  typFarbe?: string;
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
  notiz?: string;
  feed?: string;
  feedUrl?: string;
  coinGeckoId?: string;
  istInaktiv?: boolean;
  isExchangeRate?: boolean;
  targetCurrencyCode?: string;
}

export interface Konto {
  uuid?: string;
  name: string;
  waehrung: string;
  notiz?: string;
  saldo: number;
  transaktionen: Transaktion[];
  istInaktiv?: boolean;
  farbe?: string; // Zusatzfeature: benutzerdefinierte Markerfarbe (Hex)
}

export interface Depot {
  uuid?: string;
  name: string;
  referenzkontoName?: string;
  notiz?: string;
  transaktionen: Transaktion[];
  istInaktiv?: boolean;
  farbe?: string; // Zusatzfeature: benutzerdefinierte Markerfarbe (Hex)
}

/* Sparplan — PP InvestmentPlan. planTyp: PP InvestmentPlan.Type.
   intervall: PP-Kodierung (< 100 = monatlich/alle-N-Monate, > 100 = wöchentlich:
   101 = wöchentlich, 102 = alle 2 Wochen). */
export type SparplanTyp = 'kauf' | 'einzahlung' | 'entnahme' | 'zinsen';
export interface Sparplan {
  id: string;
  name: string;
  planTyp: SparplanTyp;
  wertpapierKey: string;   // leer bei Einzahlung/Entnahme/Zinsen
  depotName: string;       // leer bei Konto-Plänen
  kontoName: string;
  intervall: number;
  betrag: number;
  gebuehren: number;
  steuern: number;
  startDatum: Date;
  autoGenerate: boolean;   // PP autoGenerate ("Automatisch erstellen")
  notiz?: string;
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

/* Gruppierte Konten — PP ClientFilterMenu.Item / PortfolioClientFilter.
   Eine benannte Sammlung von Konten + Depots (per Name referenziert, da das
   Tool Konten/Depots über den Namen identifiziert). */
export interface Gruppierung {
  id: string;            // stabile ID (UUID)
  name: string;          // Anzeigename (editierbar)
  kontoNamen: string[];  // enthaltene Konten (Name)
  depotNamen: string[];  // enthaltene Depots (Name)
  notiz?: string;
}

/* Berichtszeitraum — PP ReportingPeriod. ZENTRALE Liste pro Client (PP
   ClientInput.reportingPeriods), die ALLE Tabs/Tabellen teilen. days = Tage
   zurück ab heute (null nur für Sonderfälle wie 'all'/'ytd'). */
export interface Berichtszeitraum {
  key: string;
  label: string;
  days: number | null;
}

/* ── Dashboard (PP model/Dashboard.java) ──
   Ein Dashboard hat einen Namen, eine Dashboard-weite Konfiguration (z.B.
   REPORTING_PERIOD) und Spalten. Jede Spalte hat ein Gewicht (relative Breite)
   und eine Widget-Liste. Jedes Widget hat type (WidgetFactory-Enum-Name), label
   und eine String→String-Konfiguration (PP Widget.configuration). */
export interface DashboardWidget {
  type: string;
  label: string;
  configuration: Record<string, string>;
}

export interface DashboardColumn {
  weight: number; // PP Column.weight (Minimum 1)
  widgets: DashboardWidget[];
}

export interface Dashboard {
  id: string; // UUID
  name: string;
  configuration: Record<string, string>;
  columns: DashboardColumn[];
}

export interface PortfolioState {
  wertpapiere: Record<string, Wertpapier>;
  transaktionen: Transaktion[];
  steuerJahre: Record<number, SteuerJahr>;
  konten: Record<string, Konto>;
  depots: Record<string, Depot>;
  sparplaene: Sparplan[];
  taxonomien: Taxonomie[];
  gruppierungen: Gruppierung[];
  berichtszeitraeume: Berichtszeitraum[];
  dashboards: Dashboard[];
  performance?: PerformanceDaten;
  basisWaehrung: string;
}
