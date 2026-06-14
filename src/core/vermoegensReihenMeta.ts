/* Metadaten der 19 Vermögensaufstellungs-Datenreihen (PP ClientDataSeries +
   DataSeriesSet.buildStatementOfAssetsDataSeries + Colors).

   Reihenfolge, Labels (messages_de.properties), Farben und Darstellungstyp 1:1
   wie in Portfolio Performance. Per Default ist nur die Gesamtsumme (TOTALS)
   sichtbar — alle weiteren Reihen werden über "Diagramm konfigurieren"
   hinzugefügt. */
import type { ReihenId } from './vermoegensReihen';

export type ReihenTyp = 'line' | 'area' | 'bar';

export interface ReihenMeta {
  id: ReihenId;
  label: string;     // PP-Label (messages_de.properties)
  farbe: string;     // PP-Farbe (Colors / ClientDataSeries)
  typ: ReihenTyp;    // PP-Standarddarstellung
  defaultAktiv: boolean;
}

/* Reihenfolge = PP DataSeriesSet.buildStatementOfAssetsDataSeries. */
export const REIHEN_META: ReihenMeta[] = [
  // Farben/Typen 1:1 aus PP DataSeriesSet.buildStatementOfAssetsDataSeries +
  // Colors.java: TOTALS=schwarz, TRANSFERALS=DARK_GRAY (Balken),
  // TRANSFERALS_ACCUMULATED=GELB (Fläche), INVESTED_CAPITAL/ABSOLUTE=GRAY
  // (Fläche), DELTA=GRAY (Linie), TAXES=RED, DIVIDENDS=DARK_MAGENTA,
  // INTEREST/INTEREST_CHARGE/EARNINGS=DARK_GREEN, FEES=GRAY.
  { id: 'TOTALS',                      label: 'Gesamtsumme',                          farbe: '#000000', typ: 'line', defaultAktiv: true },

  { id: 'TRANSFERALS',                 label: 'Einlagen / Entnahmen',                 farbe: '#595959', typ: 'bar',  defaultAktiv: false },
  { id: 'TRANSFERALS_ACCUMULATED',     label: 'Einlagen / Entnahmen (akkumuliert)',   farbe: '#FFFF00', typ: 'area', defaultAktiv: false },

  { id: 'INVESTED_CAPITAL',            label: 'Investiertes Kapital',                 farbe: '#808080', typ: 'area', defaultAktiv: false },
  { id: 'ABSOLUTE_INVESTED_CAPITAL',   label: 'Investiertes Kapital (gesamt)',        farbe: '#808080', typ: 'area', defaultAktiv: false },

  { id: 'ABSOLUTE_DELTA',              label: 'Absolute Wertentwicklung',             farbe: '#808080', typ: 'line', defaultAktiv: false },
  { id: 'ABSOLUTE_DELTA_ALL_RECORDS',  label: 'Absolute Wertentwicklung (gesamt)',    farbe: '#808080', typ: 'line', defaultAktiv: false },

  { id: 'DIVIDENDS',                   label: 'Dividenden',                           farbe: '#8B008B', typ: 'bar',  defaultAktiv: false },
  { id: 'DIVIDENDS_ACCUMULATED',       label: 'Dividenden (akkumuliert)',             farbe: '#8B008B', typ: 'line', defaultAktiv: false },

  { id: 'INTEREST',                    label: 'Zinsen',                               farbe: '#008000', typ: 'bar',  defaultAktiv: false },
  { id: 'INTEREST_ACCUMULATED',        label: 'Zinsen (akkumuliert)',                 farbe: '#008000', typ: 'line', defaultAktiv: false },

  { id: 'INTEREST_CHARGE',             label: 'Zinsbelastung',                        farbe: '#008000', typ: 'bar',  defaultAktiv: false },
  { id: 'INTEREST_CHARGE_ACCUMULATED', label: 'Zinsbelastung (akkumuliert)',          farbe: '#008000', typ: 'line', defaultAktiv: false },

  { id: 'EARNINGS',                    label: 'Erträge',                              farbe: '#008000', typ: 'bar',  defaultAktiv: false },
  { id: 'EARNINGS_ACCUMULATED',        label: 'Erträge (akkumuliert)',                farbe: '#008000', typ: 'line', defaultAktiv: false },

  { id: 'TAXES',                       label: 'Steuern',                              farbe: '#FF0000', typ: 'bar',  defaultAktiv: false },
  { id: 'TAXES_ACCUMULATED',           label: 'Steuern (akkumuliert)',                farbe: '#FF0000', typ: 'line', defaultAktiv: false },

  { id: 'FEES',                        label: 'Gebühren',                             farbe: '#808080', typ: 'bar',  defaultAktiv: false },
  { id: 'FEES_ACCUMULATED',            label: 'Gebühren (akkumuliert)',               farbe: '#808080', typ: 'line', defaultAktiv: false },
];

export const REIHEN_META_BY_ID: Record<ReihenId, ReihenMeta> =
  Object.fromEntries(REIHEN_META.map(m => [m.id, m])) as Record<ReihenId, ReihenMeta>;
