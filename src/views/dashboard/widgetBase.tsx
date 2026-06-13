/* Widget-Bausteine — gemeinsame Layout-Komponenten für Dashboard-Widgets.
   PP-Pendants: AbstractIndicatorWidget (Titel + großer KPI-Wert),
   AbstractHeatmapWidget (Grid), AbstractSecurityListWidget (Liste). */
import type { ReactNode } from 'react';
import type { DashboardCalc } from './dashboardData';
import type { DashboardWidget } from '../../types/portfolio';

/* Contract, den jede Widget-Komponente erhält. */
export interface WidgetProps {
  widget: DashboardWidget;
  calc: DashboardCalc;
  /* Konfig ändern (persistiert). */
  setConfig: (key: string, value: string | undefined) => void;
}

/* ── Indikator-Layout (PP AbstractIndicatorWidget): Titel oben, großer Wert. ── */
export function IndicatorBody({ title, value, colored }: {
  title: string; value: string; colored?: 'pos' | 'neg' | null;
}) {
  const color = colored === 'pos' ? 'var(--pp-green-text)'
    : colored === 'neg' ? 'var(--pp-red-text)'
    : 'var(--pp-text)';
  return (
    <div className="flex flex-col" style={{ padding: '4px 6px' }}>
      <span className="text-[11px] leading-tight truncate" style={{ color: 'var(--pp-text-secondary)' }}>{title}</span>
      <span className="text-[20px] font-semibold leading-tight mono" style={{ color }}>{value}</span>
    </div>
  );
}

/* ── Überschrift (PP HeadingWidget): HEADING1-Stil. ── */
export function HeadingBody({ text }: { text: string }) {
  return (
    <div style={{ padding: '10px 6px 4px' }}>
      <span className="text-[13px] font-bold" style={{ color: 'var(--pp-heading, var(--pp-accent))' }}>{text}</span>
    </div>
  );
}

/* ── Heatmap-Grid (PP AbstractHeatmapWidget). ── */
export interface HeatmapCell { value: number | null; text: string; }
export interface HeatmapModel {
  columnLabels: string[];
  rows: { label: string; cells: HeatmapCell[] }[];
}

/* Farbfunktion: rot (negativ) → transparent (0) → grün (positiv).
   maxAbs skaliert die Intensität. */
export function heatColor(value: number | null, maxAbs: number, schema: string): string {
  if (value === null || maxAbs <= 0) return 'transparent';
  const t = Math.max(-1, Math.min(1, value / maxAbs));
  const intensity = Math.abs(t);
  if (schema === 'GYR') {
    // Grün → Gelb → Rot
    if (t > 0) return `rgba(76, 175, 80, ${0.15 + 0.55 * intensity})`;
    return `rgba(229, 57, 53, ${0.15 + 0.55 * intensity})`;
  }
  if (t > 0) return `rgba(76, 175, 80, ${0.12 + 0.5 * intensity})`;
  if (t < 0) return `rgba(229, 57, 53, ${0.12 + 0.5 * intensity})`;
  return 'transparent';
}

export function HeatmapGrid({ model, schema = 'GREEN_RED' }: { model: HeatmapModel; schema?: string }) {
  const maxAbs = Math.max(0.0001, ...model.rows.flatMap(r => r.cells.map(c => c.value === null ? 0 : Math.abs(c.value))));
  return (
    <div className="overflow-auto" style={{ padding: '2px 4px' }}>
      <table className="border-collapse" style={{ fontSize: 10, width: '100%' }}>
        <thead>
          <tr>
            <th style={{ padding: '2px 4px', textAlign: 'left', color: 'var(--pp-text-muted)' }}></th>
            {model.columnLabels.map((l, i) => (
              <th key={i} style={{ padding: '2px 3px', textAlign: 'right', color: 'var(--pp-text-muted)', fontWeight: 500 }}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, ri) => (
            <tr key={ri}>
              <td style={{ padding: '2px 4px', color: 'var(--pp-text-secondary)', fontWeight: 600 }}>{row.label}</td>
              {row.cells.map((c, ci) => (
                <td key={ci} className="mono" style={{
                  padding: '2px 3px', textAlign: 'right',
                  background: heatColor(c.value, maxAbs, schema),
                  color: 'var(--pp-text)',
                }}>{c.text}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Listen-Container (PP AbstractSecurityListWidget). ── */
export function ListBody({ children, empty }: { children: ReactNode; empty?: boolean }) {
  if (empty) {
    return <div className="text-[11px] px-2 py-3" style={{ color: 'var(--pp-text-muted)' }}>Keine Daten.</div>;
  }
  return <div className="flex flex-col" style={{ padding: '2px 4px', gap: 1 }}>{children}</div>;
}

/* Leerwert-Anzeige (PP: "-"). */
export const LEER = '–';
