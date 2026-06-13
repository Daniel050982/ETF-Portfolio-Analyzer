/* Default-Dashboard-Vorlagen (PP NewDashboardDialog).
   buildIndicatorDashboard / buildEmptyDashboard / buildEarningsDashboard 1:1. */
import type { Dashboard, DashboardWidget } from '../../types/portfolio';
import { widgetByType } from './widgetFactory';
import { CFG } from './widgetConfig';

let uuidCounter = 0;
function uuid(): string {
  // Deterministisch genug (kein Math.random verfügbar in manchen Kontexten);
  // bei echten Neuanlagen reicht ein zeitbasiertes Suffix.
  uuidCounter += 1;
  return `dash-${Date.now().toString(36)}-${uuidCounter}`;
}

function widget(type: string, label?: string, config?: Record<string, string>): DashboardWidget {
  const def = widgetByType(type);
  return { type, label: label ?? def?.label ?? type, configuration: config ?? {} };
}

/* PP buildIndicatorDashboard — das Standard-Dashboard "Kennzahlen". */
export function buildIndicatorDashboard(name = 'Dashboard'): Dashboard {
  return {
    id: uuid(),
    name,
    configuration: { [CFG.REPORTING_PERIOD]: 'L1Y0' },
    columns: [
      {
        weight: 1,
        widgets: [
          widget('HEADING', 'Kennzahlen'),
          widget('TTWROR'),
          widget('IRR'),
          widget('ABSOLUTE_CHANGE'),
          widget('DELTA'),
          widget('HEADING', 'Letzter Tag'),
          widget('TTWROR', undefined, { [CFG.REPORTING_PERIOD]: 'T1' }),
          widget('ABSOLUTE_CHANGE', undefined, { [CFG.REPORTING_PERIOD]: 'T1' }),
        ],
      },
      {
        weight: 1,
        widgets: [
          widget('HEADING', 'Risikokennzahlen'),
          widget('MAXDRAWDOWN'),
          widget('MAXDRAWDOWNDURATION'),
          widget('VOLATILITY'),
          widget('SEMIVOLATILITY'),
        ],
      },
      {
        weight: 1,
        widgets: [
          widget('HEADING', 'Performance-Berechnung'),
          widget('CALCULATION'),
        ],
      },
    ],
  };
}

/* PP buildEmptyDashboard — leere Vorlage mit Beschreibung. */
export function buildEmptyDashboard(name = 'Dashboard'): Dashboard {
  return {
    id: uuid(),
    name,
    configuration: {},
    columns: [
      { weight: 1, widgets: [widget('DESCRIPTION', 'Ziehe Widgets per Rechtsklick auf eine Spalte hierher.')] },
      { weight: 1, widgets: [] },
    ],
  };
}

/* PP buildEarningsDashboard — Erträge. */
export function buildEarningsDashboard(name = 'Erträge'): Dashboard {
  return {
    id: uuid(),
    name,
    configuration: {},
    columns: [
      {
        weight: 1,
        widgets: [
          widget('HEADING', 'Erträge'),
          widget('EARNINGS_PER_YEAR_CHART'),
          widget('EARNINGS_PER_MONTH_CHART'),
        ],
      },
      { weight: 1, widgets: [widget('EARNINGS')] },
    ],
  };
}

export const DASHBOARD_TEMPLATES: { id: string; label: string; build: (name?: string) => Dashboard }[] = [
  { id: 'indicators', label: 'Kennzahlen', build: buildIndicatorDashboard },
  { id: 'empty', label: 'Leer', build: buildEmptyDashboard },
  { id: 'earnings', label: 'Erträge', build: buildEarningsDashboard },
];

export function newDashboardId(): string { return uuid(); }
