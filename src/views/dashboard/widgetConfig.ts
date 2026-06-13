/* Widget-Config-System (PP WidgetConfig + Konkretisierungen).
   Jeder Config-Typ stellt Menü-Einträge bereit, um einen Schlüssel in der
   Widget-Konfiguration zu ändern, und liefert ein Label für den Tooltip. */
import { REPORTING_PERIOD_OPTIONS, reportingPeriodLabel } from './dashboardData';
import type { MenuNode } from '../../components/HierarchyMenu';

/* Config-Keys = PP Dashboard.Config (Subset, das wir nutzen). */
export const CFG = {
  REPORTING_PERIOD: 'REPORTING_PERIOD',
  DATA_SERIES: 'DATA_SERIES',
  SECONDARY_DATA_SERIES: 'SECONDARY_DATA_SERIES',
  HEIGHT: 'HEIGHT',
  COUNT: 'COUNT',
  CLIENT_FILTER: 'CLIENT_FILTER',
  COLOR_SCHEMA: 'COLOR_SCHEMA',
  LAYOUT: 'LAYOUT',
  EARNING_TYPE: 'EARNING_TYPE',
  NET_GROSS: 'NET_GROSS',
  START_YEAR: 'START_YEAR',
  CALCULATION_METHOD: 'CALCULATION_METHOD',
  METRIC: 'METRIC',
  SHOW_Y_AXIS: 'SHOW_Y_AXIS',
  TAXONOMY: 'TAXONOMY',
  URL: 'URL',
  AGGREGATION: 'AGGREGATION',
  TRANSACTION_FILTER: 'TRANSACTION_FILTER',
  EVENT_TYPE: 'EVENT_TYPE',
  SORT_DIRECTION: 'SORT_DIRECTION',
  DATE_TYPE_FILTER: 'DATE_TYPE_FILTER',
  SECURITY_FILTER: 'SECURITY_FILTER',
  FIRE_NUMBER: 'FIRE_NUMBER',
  FIRE_MONTHLY_SAVINGS: 'FIRE_MONTHLY_SAVINGS',
  FIRE_RETURNS: 'FIRE_RETURNS',
  COLLAPSED: 'COLLAPSED',
  COST_METHOD: 'COST_METHOD',
  EXCHANGE_RATE_SERIES: 'EXCHANGE_RATE_SERIES',
} as const;

/* Chart-Höhen (PP ChartHeightConfig.Height). */
export const CHART_HEIGHTS: { px: number; label: string }[] = [
  { px: 70, label: 'Kleiner' },
  { px: 140, label: 'Normal' },
  { px: 210, label: 'Größer' },
  { px: 280, label: '2×' },
  { px: 420, label: '3×' },
  { px: 560, label: '4×' },
  { px: 700, label: '5×' },
];

/* Eine Config-Definition: erzeugt einen Submenu-Knoten für das Widget-Menü. */
export interface WidgetConfigDef {
  /* Label (für Tooltip-Aufbau). */
  label: (config: Record<string, string>) => string;
  /* Erzeugt den Menü-Eintrag. setCfg ändert einen Key und triggert Re-Render. */
  menu: (config: Record<string, string>, setCfg: (key: string, value: string | undefined) => void) => MenuNode;
}

/* ── ReportingPeriodConfig ── */
export const reportingPeriodConfig: WidgetConfigDef = {
  label: (c) => `Berichtszeitraum: ${reportingPeriodLabel(c[CFG.REPORTING_PERIOD])}`,
  menu: (c, set) => ({
    kind: 'submenu',
    label: 'Berichtszeitraum',
    children: REPORTING_PERIOD_OPTIONS.map(opt => ({
      kind: 'radio' as const,
      label: opt.label,
      selected: (c[CFG.REPORTING_PERIOD] ?? '') === opt.code || (!c[CFG.REPORTING_PERIOD] && opt.code === 'ALL'),
      onSelect: () => set(CFG.REPORTING_PERIOD, opt.code),
    })),
  }),
};

/* ── ChartHeightConfig ── */
export const chartHeightConfig: WidgetConfigDef = {
  label: (c) => `Höhe: ${c[CFG.HEIGHT] ?? '140'} px`,
  menu: (c, set) => ({
    kind: 'submenu',
    label: 'Höhe',
    children: CHART_HEIGHTS.map(h => ({
      kind: 'radio' as const,
      label: `${h.label} (${h.px} px)`,
      selected: (c[CFG.HEIGHT] ?? '140') === String(h.px),
      onSelect: () => set(CFG.HEIGHT, String(h.px)),
    })),
  }),
};

/* ── CountConfig (Top/Bottom-Anzahl) ── */
export const countConfig: WidgetConfigDef = {
  label: (c) => `Anzahl: ${c[CFG.COUNT] ?? '3'}`,
  menu: (c, set) => ({
    kind: 'submenu',
    label: 'Anzahl',
    children: [1, 2, 3, 5, 7, 10].map(n => ({
      kind: 'radio' as const,
      label: String(n),
      selected: (c[CFG.COUNT] ?? '3') === String(n),
      onSelect: () => set(CFG.COUNT, String(n)),
    })),
  }),
};

/* ── ShowYAxisConfig ── */
export const showYAxisConfig: WidgetConfigDef = {
  label: (c) => `Y-Achse: ${(c[CFG.SHOW_Y_AXIS] ?? 'true') === 'true' ? 'an' : 'aus'}`,
  menu: (c, set) => ({
    kind: 'check',
    label: 'Y-Achse anzeigen',
    checked: (c[CFG.SHOW_Y_AXIS] ?? 'true') === 'true',
    onToggle: () => set(CFG.SHOW_Y_AXIS, (c[CFG.SHOW_Y_AXIS] ?? 'true') === 'true' ? 'false' : 'true'),
  }),
};

/* ── EarningTypeConfig ── */
export const EARNING_TYPES = [
  { code: 'EARNINGS', label: 'Dividenden + Zinsen' },
  { code: 'DIVIDENDS', label: 'Dividenden' },
  { code: 'INTEREST', label: 'Zinsen' },
];
export const earningTypeConfig: WidgetConfigDef = {
  label: (c) => `Art: ${EARNING_TYPES.find(e => e.code === (c[CFG.EARNING_TYPE] ?? 'EARNINGS'))?.label}`,
  menu: (c, set) => ({
    kind: 'submenu',
    label: 'Ertragsart',
    children: EARNING_TYPES.map(e => ({
      kind: 'radio' as const,
      label: e.label,
      selected: (c[CFG.EARNING_TYPE] ?? 'EARNINGS') === e.code,
      onSelect: () => set(CFG.EARNING_TYPE, e.code),
    })),
  }),
};

/* ── GrossNetConfig ── */
export const grossNetConfig: WidgetConfigDef = {
  label: (c) => `${(c[CFG.NET_GROSS] ?? 'NET') === 'NET' ? 'Netto' : 'Brutto'}`,
  menu: (c, set) => ({
    kind: 'submenu',
    label: 'Brutto / Netto',
    children: [
      { kind: 'radio' as const, label: 'Netto', selected: (c[CFG.NET_GROSS] ?? 'NET') === 'NET', onSelect: () => set(CFG.NET_GROSS, 'NET') },
      { kind: 'radio' as const, label: 'Brutto', selected: (c[CFG.NET_GROSS] ?? 'NET') === 'GROSS', onSelect: () => set(CFG.NET_GROSS, 'GROSS') },
    ],
  }),
};

/* ── CostMethodConfig (FIFO / Moving Average) ── */
export const costMethodConfig: WidgetConfigDef = {
  label: (c) => `Methode: ${(c[CFG.COST_METHOD] ?? 'FIFO') === 'FIFO' ? 'FIFO' : 'Gleitender Durchschnitt'}`,
  menu: (c, set) => ({
    kind: 'submenu',
    label: 'Kostenmethode',
    children: [
      { kind: 'radio' as const, label: 'FIFO', selected: (c[CFG.COST_METHOD] ?? 'FIFO') === 'FIFO', onSelect: () => set(CFG.COST_METHOD, 'FIFO') },
      { kind: 'radio' as const, label: 'Gleitender Durchschnitt', selected: (c[CFG.COST_METHOD] ?? 'FIFO') === 'AVG', onSelect: () => set(CFG.COST_METHOD, 'AVG') },
    ],
  }),
};

/* ── LayoutConfig (Performance-Berechnung: FULL / REDUCED) ── */
export const calculationLayoutConfig: WidgetConfigDef = {
  label: (c) => `Layout: ${(c[CFG.LAYOUT] ?? 'FULL') === 'FULL' ? 'Vollständig' : 'Reduziert'}`,
  menu: (c, set) => ({
    kind: 'submenu',
    label: 'Layout',
    children: [
      { kind: 'radio' as const, label: 'Vollständig', selected: (c[CFG.LAYOUT] ?? 'FULL') === 'FULL', onSelect: () => set(CFG.LAYOUT, 'FULL') },
      { kind: 'radio' as const, label: 'Reduziert', selected: (c[CFG.LAYOUT] ?? 'FULL') === 'REDUCED', onSelect: () => set(CFG.LAYOUT, 'REDUCED') },
    ],
  }),
};

/* ── MetricConfig (Haltedauer: Tage / Jahre) ── */
export const holdingMetricConfig: WidgetConfigDef = {
  label: (c) => `Einheit: ${(c[CFG.METRIC] ?? 'DAY') === 'DAY' ? 'Tage' : 'Jahre'}`,
  menu: (c, set) => ({
    kind: 'submenu',
    label: 'Einheit',
    children: [
      { kind: 'radio' as const, label: 'Tage', selected: (c[CFG.METRIC] ?? 'DAY') === 'DAY', onSelect: () => set(CFG.METRIC, 'DAY') },
      { kind: 'radio' as const, label: 'Jahre', selected: (c[CFG.METRIC] ?? 'DAY') === 'YEAR', onSelect: () => set(CFG.METRIC, 'YEAR') },
    ],
  }),
};

/* ── TransactionFilterConfig (Aktivitäts-Chart) ── */
export const TX_FILTERS = [
  { code: 'ALL', label: 'Alle Buchungen' },
  { code: 'BUY', label: 'Nur Käufe' },
  { code: 'SELL', label: 'Nur Verkäufe' },
];
export const transactionFilterConfig: WidgetConfigDef = {
  label: (c) => `Filter: ${TX_FILTERS.find(t => t.code === (c[CFG.TRANSACTION_FILTER] ?? 'ALL'))?.label}`,
  menu: (c, set) => ({
    kind: 'submenu',
    label: 'Buchungsfilter',
    children: TX_FILTERS.map(t => ({
      kind: 'radio' as const,
      label: t.label,
      selected: (c[CFG.TRANSACTION_FILTER] ?? 'ALL') === t.code,
      onSelect: () => set(CFG.TRANSACTION_FILTER, t.code),
    })),
  }),
};

/* ── ColorSchemaConfig (Heatmaps) ── */
export const colorSchemaConfig: WidgetConfigDef = {
  label: (c) => `Farbschema: ${(c[CFG.COLOR_SCHEMA] ?? 'GREEN_RED') === 'GREEN_RED' ? 'Grün/Rot' : 'Grün/Gelb/Rot'}`,
  menu: (c, set) => ({
    kind: 'submenu',
    label: 'Farbschema',
    children: [
      { kind: 'radio' as const, label: 'Grün/Rot', selected: (c[CFG.COLOR_SCHEMA] ?? 'GREEN_RED') === 'GREEN_RED', onSelect: () => set(CFG.COLOR_SCHEMA, 'GREEN_RED') },
      { kind: 'radio' as const, label: 'Grün/Gelb/Rot', selected: (c[CFG.COLOR_SCHEMA] ?? 'GREEN_RED') === 'GYR', onSelect: () => set(CFG.COLOR_SCHEMA, 'GYR') },
    ],
  }),
};
