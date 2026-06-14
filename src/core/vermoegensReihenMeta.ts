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
  { id: 'TOTALS',                      label: 'Gesamtsumme',                          farbe: '#000000', typ: 'line', defaultAktiv: true },

  { id: 'TRANSFERALS',                 label: 'Einlagen / Entnahmen',                 farbe: '#808080', typ: 'bar',  defaultAktiv: false },
  { id: 'TRANSFERALS_ACCUMULATED',     label: 'Einlagen / Entnahmen (akkumuliert)',   farbe: '#CCCC00', typ: 'area', defaultAktiv: false },

  { id: 'INVESTED_CAPITAL',            label: 'Investiertes Kapital',                 farbe: '#A0A0A0', typ: 'area', defaultAktiv: false },
  { id: 'ABSOLUTE_INVESTED_CAPITAL',   label: 'Investiertes Kapital (gesamt)',        farbe: '#A0A0A0', typ: 'area', defaultAktiv: false },

  { id: 'ABSOLUTE_DELTA',              label: 'Absolute Wertentwicklung',             farbe: '#606060', typ: 'line', defaultAktiv: false },
  { id: 'ABSOLUTE_DELTA_ALL_RECORDS',  label: 'Absolute Wertentwicklung (gesamt)',    farbe: '#606060', typ: 'line', defaultAktiv: false },

  { id: 'DIVIDENDS',                   label: 'Dividenden',                           farbe: '#8B008B', typ: 'bar',  defaultAktiv: false },
  { id: 'DIVIDENDS_ACCUMULATED',       label: 'Dividenden (akkumuliert)',             farbe: '#8B008B', typ: 'line', defaultAktiv: false },

  { id: 'INTEREST',                    label: 'Zinsen',                               farbe: '#006400', typ: 'bar',  defaultAktiv: false },
  { id: 'INTEREST_ACCUMULATED',        label: 'Zinsen (akkumuliert)',                 farbe: '#006400', typ: 'line', defaultAktiv: false },

  { id: 'INTEREST_CHARGE',             label: 'Zinsbelastung',                        farbe: '#228B22', typ: 'bar',  defaultAktiv: false },
  { id: 'INTEREST_CHARGE_ACCUMULATED', label: 'Zinsbelastung (akkumuliert)',          farbe: '#228B22', typ: 'line', defaultAktiv: false },

  { id: 'EARNINGS',                    label: 'Erträge',                              farbe: '#00688B', typ: 'bar',  defaultAktiv: false },
  { id: 'EARNINGS_ACCUMULATED',        label: 'Erträge (akkumuliert)',                farbe: '#00688B', typ: 'line', defaultAktiv: false },

  { id: 'TAXES',                       label: 'Steuern',                              farbe: '#FF0000', typ: 'bar',  defaultAktiv: false },
  { id: 'TAXES_ACCUMULATED',           label: 'Steuern (akkumuliert)',                farbe: '#FF0000', typ: 'line', defaultAktiv: false },

  { id: 'FEES',                        label: 'Gebühren',                             farbe: '#A9A9A9', typ: 'bar',  defaultAktiv: false },
  { id: 'FEES_ACCUMULATED',            label: 'Gebühren (akkumuliert)',               farbe: '#A9A9A9', typ: 'line', defaultAktiv: false },
];

export const REIHEN_META_BY_ID: Record<ReihenId, ReihenMeta> =
  Object.fromEntries(REIHEN_META.map(m => [m.id, m])) as Record<ReihenId, ReihenMeta>;
