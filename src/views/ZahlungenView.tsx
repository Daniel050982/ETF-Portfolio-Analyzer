import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { usePortfolio } from '../store/PortfolioContext';
import { PPTable, type PPColumn } from '../components/PPTable';
import { Toolbar, TabBar } from '../components/PPElements';
import { euro, datumKurz, datumMonat } from '../utils/format';
import type { Transaktion } from '../types/portfolio';

const TABS = [
  { id: 'tabelle', label: 'Zahlungen' },
  { id: 'chart', label: 'Diagramm' },
];

const typLabel: Record<string, string> = {
  einlage: 'Einlage',
  entnahme: 'Entnahme',
  dividende: 'Dividende',
  ausschuettung: 'Ausschüttung',
  zinsen: 'Zinsen',
  gebuehren: 'Gebühren',
  steuern_tx: 'Steuern',
  steuererstattung: 'Steuererstattung',
};

const COLUMNS: PPColumn<Transaktion>[] = [
  { id: 'datum', label: 'Datum', width: 90, render: tx => datumKurz(tx.datum), sortFn: (a, b) => a.datum.getTime() - b.datum.getTime() },
  { id: 'typ', label: 'Typ', width: 100, render: tx => typLabel[tx.typ] ?? tx.typ },
  { id: 'konto', label: 'Konto', width: 140, render: tx => tx.kontoName ?? '—' },
  { id: 'betrag', label: 'Betrag', width: 110, align: 'right', render: tx => (
    <span style={{ color: tx.betrag >= 0 ? 'var(--pp-green-text)' : 'var(--pp-red-text)' }}>{euro(tx.betrag)}</span>
  ), sortFn: (a, b) => a.betrag - b.betrag },
  { id: 'notiz', label: 'Notiz', width: 200, render: tx => tx.notiz ?? '' },
];

export default function ZahlungenView() {
  const { state } = usePortfolio();
  const [tab, setTab] = useState('tabelle');

  const zahlungen = useMemo(() =>
    state.transaktionen
      .filter(tx => ['einlage', 'entnahme', 'dividende', 'ausschuettung', 'zinsen', 'gebuehren', 'steuern_tx', 'steuererstattung'].includes(tx.typ))
      .sort((a, b) => b.datum.getTime() - a.datum.getTime()),
    [state.transaktionen]
  );

  const chartData = useMemo(() => {
    const monatMap = new Map<string, { einnahmen: number; ausgaben: number; label: string }>();
    for (const tx of zahlungen) {
      const key = `${tx.datum.getFullYear()}-${String(tx.datum.getMonth() + 1).padStart(2, '0')}`;
      if (!monatMap.has(key)) monatMap.set(key, { einnahmen: 0, ausgaben: 0, label: datumMonat(tx.datum) });
      const m = monatMap.get(key)!;
      if (tx.betrag >= 0) m.einnahmen += tx.betrag;
      else m.ausgaben += Math.abs(tx.betrag);
    }
    return [...monatMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [zahlungen]);

  return (
    <div className="flex flex-col h-full">
      <Toolbar title="Zahlungen" showSearch={false} />
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'tabelle' ? (
        zahlungen.length > 0 ? (
          <PPTable columns={COLUMNS} data={zahlungen} rowKey={tx => tx.id} storageKey="zahlungen" />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>
            Keine Zahlungen vorhanden.
          </div>
        )
      ) : (
        <div className="flex-1 p-4">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }} />
                <YAxis tickFormatter={(v: number) => euro(v)} tick={{ fontSize: 10, fill: 'var(--pp-text-muted)' }} width={90} />
                <Tooltip
                  contentStyle={{ fontSize: 11, background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)', color: 'var(--pp-text)' }}
                  formatter={(v: number, name: string) => [euro(v), name === 'einnahmen' ? 'Einnahmen' : 'Ausgaben']}
                />
                <Legend formatter={(v: string) => v === 'einnahmen' ? 'Einnahmen' : 'Ausgaben'} />
                <Bar dataKey="einnahmen" fill="var(--pp-green-text)" />
                <Bar dataKey="ausgaben" fill="var(--pp-red-text)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--pp-text-muted)' }}>Keine Daten.</div>
          )}
        </div>
      )}
    </div>
  );
}
