/* WidgetFactory — zentrale Registry aller Widget-Typen (PP WidgetFactory enum).
   Pro Typ: Enum-Name, deutsches Label, Gruppe, Render-Komponente, die
   Config-Definitionen (Menü-Einträge) und optionale Default-Config. */
import type { ComponentType } from 'react';
import type { WidgetProps } from './widgetBase';
import {
  reportingPeriodConfig, chartHeightConfig, countConfig, showYAxisConfig,
  earningTypeConfig, grossNetConfig, costMethodConfig, calculationLayoutConfig,
  holdingMetricConfig, transactionFilterConfig, colorSchemaConfig,
} from './widgetConfig';
import type { WidgetConfigDef } from './widgetConfig';
import * as I from './widgets/indicatorWidgets';
import * as C from './widgets/chartWidgets';
import * as H from './widgets/heatmapWidgets';
import * as L from './widgets/listWidgets';

/* Widget-Gruppen (PP WidgetFactory.getGroup). */
export const GROUPS = {
  COMMON: 'Allgemein',
  ASSETS: 'Vermögensaufstellung',
  PERFORMANCE: 'Performance',
  RISK: 'Risikokennzahlen',
  EARNINGS: 'Erträge',
  TRADES: 'Trades',
} as const;

export interface WidgetFactoryEntry {
  type: string;            // Enum-Name (in Widget.type gespeichert)
  label: string;           // deutsches Standard-Label
  group: string;           // Gruppen-Name
  component: ComponentType<WidgetProps>;
  configs: WidgetConfigDef[]; // Menü-Konfigurationen (zusätzlich zum Label)
  defaultConfig?: Record<string, string>;
}

function e(type: string, label: string, group: string, component: ComponentType<WidgetProps>, configs: WidgetConfigDef[] = [], defaultConfig?: Record<string, string>): WidgetFactoryEntry {
  return { type, label, group, component, configs, defaultConfig };
}

const RP = reportingPeriodConfig;
const H_ = chartHeightConfig;
const YA = showYAxisConfig;
const CNT = countConfig;
const CS = colorSchemaConfig;

/* VOLLSTÄNDIGE Widget-Liste (PP WidgetFactory). */
export const WIDGET_FACTORY: WidgetFactoryEntry[] = [
  /* ── Allgemein ── */
  e('HEADING', 'Überschrift', GROUPS.COMMON, I.HeadingWidget),
  e('DESCRIPTION', 'Beschreibung', GROUPS.COMMON, I.DescriptionWidget),
  e('CURRENT_DATE', 'Aktuelles Datum', GROUPS.COMMON, I.CurrentDateWidget),
  e('COLLAPSIBLE_SECTION', 'Klappbarer Abschnitt', GROUPS.COMMON, I.CollapsibleSectionWidget),
  e('EXCHANGE_RATE', 'Wechselkurs', GROUPS.COMMON, I.ExchangeRateWidget, [RP]),
  e('ACTIVITY_CHART', 'Handelsaktivität', GROUPS.COMMON, C.ActivityWidget, [RP, transactionFilterConfig, H_, YA]),
  e('LIMIT_EXCEEDED', 'Kursalarm überschritten', GROUPS.COMMON, L.LimitExceededWidget),
  e('FOLLOW_UP', 'Datum erreicht', GROUPS.COMMON, L.FollowUpWidget),
  e('EVENT_LIST', 'Ereignisliste', GROUPS.COMMON, L.EventListWidget, [RP, H_]),
  e('WEBSITE', 'Website', GROUPS.COMMON, C.BrowserWidget, [H_]),
  e('VERTICAL_SPACER', 'Vertikaler Abstandshalter', GROUPS.COMMON, I.VerticalSpacerWidget),

  /* ── Vermögensaufstellung ── */
  e('TOTAL_SUM', 'Gesamtsumme', GROUPS.ASSETS, I.TotalSumWidget, [RP]),
  e('ABSOLUTE_CHANGE', 'Absolute Veränderung', GROUPS.ASSETS, I.AbsoluteChangeWidget, [RP]),
  e('DELTA', 'Delta (im Berichtszeitraum)', GROUPS.ASSETS, I.DeltaWidget, [RP]),
  e('ABSOLUTE_DELTA', 'Delta (seit der ersten Buchung)', GROUPS.ASSETS, I.AbsoluteDeltaWidget),
  e('INVESTED_CAPITAL', 'Investiertes Kapital (im Berichtszeitraum)', GROUPS.ASSETS, I.InvestedCapitalWidget, [RP]),
  e('ABSOLUTE_INVESTED_CAPITAL', 'Investiertes Kapital (seit der ersten Buchung)', GROUPS.ASSETS, I.AbsoluteInvestedCapitalWidget),
  e('SAVINGS', 'Performanceneutrale Bewegungen', GROUPS.ASSETS, I.SavingsWidget, [RP]),
  e('MONTHLY_PN_TRANSFERS', 'Monatliche performanceneutrale Bewegungen', GROUPS.ASSETS, H.MonthlyPNTransfersWidget, [RP, CS]),
  e('ALL_TIME_HIGH', 'Allzeit-Höchststand', GROUPS.ASSETS, I.AllTimeHighWidget),
  e('RATIO', 'Verhältnis', GROUPS.ASSETS, I.RatioWidget, [RP]),
  e('FIRE', 'FIRE-Berechnung', GROUPS.ASSETS, I.FireWidget),
  e('ASSET_CHART', 'Vermögensaufstellung - Diagramm', GROUPS.ASSETS, C.AssetChartWidget, [RP, H_, YA]),
  e('HOLDINGS_CHART', 'Vermögensaufstellung - Bestand', GROUPS.ASSETS, C.HoldingsChartWidget, [H_]),
  e('CLIENT_DATA_SERIES_CHART', 'Abgeleitete Datenreihen', GROUPS.ASSETS, C.ClientDataSeriesChartWidget, [RP, H_, YA]),
  e('TAXONOMY_CHART', 'Klassifizierungen', GROUPS.ASSETS, C.TaxonomyChartWidget, [H_]),
  e('REBALANCING_TARGET_CHART', 'Klassifizierungen: Zielwert', GROUPS.ASSETS, C.RebalancingTargetChartWidget, [H_]),
  e('REBALANCING_CHART', 'Rebalancing (Ist vs. Ziel)', GROUPS.ASSETS, C.RebalancingChartWidget, [H_, YA]),

  /* ── Performance ── */
  e('TTWROR', 'True Time-Weighted Rate of Return (kumulativ)', GROUPS.PERFORMANCE, I.TtwrorWidget, [RP]),
  e('TTWROR_ANNUALIZED', 'True Time-Weighted Rate of Return (annualisiert)', GROUPS.PERFORMANCE, I.TtwrorAnnualizedWidget, [RP]),
  e('IRR', 'Interner Zinsfuß (IZF)', GROUPS.PERFORMANCE, I.IrrWidget, [RP]),
  e('CALCULATION', 'Performance-Berechnung', GROUPS.PERFORMANCE, I.PerformanceCalculationWidget, [RP, calculationLayoutConfig, costMethodConfig]),
  e('PERFORMANCE_TOP_CONTRIBUTORS', 'Top Contributors (Wert)', GROUPS.PERFORMANCE, L.TopContributorsWidget, [RP, CNT]),
  e('PERFORMANCE_TOP_CONTRIBUTORS_RETURN', 'Top Performer (TTWROR)', GROUPS.PERFORMANCE, L.TopContributorsReturnWidget, [RP, CNT]),
  e('CHART', 'Performance-Diagramm', GROUPS.PERFORMANCE, C.PerformanceChartWidget, [RP, H_, YA]),
  e('HEATMAP', 'Monatsrenditen in einer Heatmap', GROUPS.PERFORMANCE, H.PerformanceHeatmapWidget, [RP, CS]),
  e('HEATMAP_YEARLY', 'Jahresrenditen in einer Heatmap', GROUPS.PERFORMANCE, H.YearlyPerformanceHeatmapWidget, [CS]),
  e('PORTFOLIO_TAX_RATE', 'Portfolio-Steuerquote', GROUPS.PERFORMANCE, I.PortfolioTaxRateWidget, [RP]),
  e('PORTFOLIO_FEE_RATE', 'Portfolio-Gebührenquote', GROUPS.PERFORMANCE, I.PortfolioFeeRateWidget, [RP]),

  /* ── Risikokennzahlen ── */
  e('MAXDRAWDOWN', 'Maximaler Drawdown', GROUPS.RISK, I.MaxDrawdownWidget, [RP]),
  e('CURRENT_DRAWDOWN', 'Aktueller Drawdown', GROUPS.RISK, I.CurrentDrawdownWidget, [RP]),
  e('MAXDRAWDOWNDURATION', 'Maximale Drawdown Duration', GROUPS.RISK, I.MaxDrawdownDurationWidget, [RP]),
  e('VOLATILITY', 'Volatilität', GROUPS.RISK, I.VolatilityWidget, [RP]),
  e('SEMIVOLATILITY', 'Semivolatilität', GROUPS.RISK, I.SemiVolatilityWidget, [RP]),
  e('DRAWDOWN_CHART', 'Drawdown-Diagramm', GROUPS.RISK, C.DrawdownChartWidget, [RP, H_, YA]),

  /* ── Erträge ── */
  e('EARNINGS', 'Übersicht der Transaktionen', GROUPS.EARNINGS, L.EarningsListWidget, [earningTypeConfig, grossNetConfig]),
  e('HEATMAP_EARNINGS', 'Monatliche Erträge', GROUPS.EARNINGS, H.EarningsHeatmapWidget, [RP, earningTypeConfig, CS]),
  e('DIVIDEND_EVENT_LIST', 'Anstehende Dividenden', GROUPS.EARNINGS, L.DividendListWidget),
  e('EARNINGS_PER_YEAR_CHART', 'Erträge pro Jahr', GROUPS.EARNINGS, L.EarningsPerYearWidget, [earningTypeConfig, grossNetConfig, H_, YA]),
  e('EARNINGS_PER_QUARTER_CHART', 'Erträge pro Quartal', GROUPS.EARNINGS, L.EarningsPerQuarterWidget, [earningTypeConfig, grossNetConfig, H_, YA]),
  e('EARNINGS_PER_MONTH_CHART', 'Erträge pro Monat', GROUPS.EARNINGS, L.EarningsPerMonthWidget, [earningTypeConfig, grossNetConfig, H_, YA]),
  e('EARNINGS_BY_TAXONOMY', 'Erträge nach Klassifikation', GROUPS.EARNINGS, L.EarningsByTaxonomyWidget, [RP, earningTypeConfig, H_]),

  /* ── Trades ── */
  e('TRADES_BASIC_STATISTICS', 'Anzahl Trades (mit Gewinn/mit Verlust)', GROUPS.TRADES, L.TradesWidget, [RP]),
  e('TRADES_PROFIT_LOSS', 'Trades Gewinn/Verlust', GROUPS.TRADES, L.TradesProfitLossWidget, [RP, costMethodConfig]),
  e('TRADES_AVERAGE_HOLDING_PERIOD', 'Mittlere Haltedauer', GROUPS.TRADES, L.TradesAverageHoldingPeriodWidget, [RP, holdingMetricConfig]),
  e('TRADES_TURNOVER_RATIO', 'Portfolio Turnover Rate', GROUPS.TRADES, L.TradesTurnoverWidget, [RP]),
  e('HEATMAP_INVESTMENTS', 'Monatliche Investitionen', GROUPS.TRADES, H.InvestmentHeatmapWidget, [RP, CS]),
  e('HEATMAP_TAXES', 'Monatliche Steuern', GROUPS.TRADES, H.TaxHeatmapWidget, [RP, CS]),
  e('HEATMAP_FEES', 'Monatliche Gebühren', GROUPS.TRADES, H.FeeHeatmapWidget, [RP, CS]),
];

const BY_TYPE = new Map(WIDGET_FACTORY.map(w => [w.type, w]));
export function widgetByType(type: string): WidgetFactoryEntry | undefined {
  return BY_TYPE.get(type);
}

/* Gruppen in definierter Reihenfolge (für das "Neues Widget"-Menü). */
export const GROUP_ORDER = [GROUPS.COMMON, GROUPS.ASSETS, GROUPS.PERFORMANCE, GROUPS.RISK, GROUPS.EARNINGS, GROUPS.TRADES];
