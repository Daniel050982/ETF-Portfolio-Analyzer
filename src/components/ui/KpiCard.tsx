export function KpiCard({ label, value, color }: { label: string; value: string; color?: 'green' | 'red' | 'default' }) {
  const valColor = color === 'green' ? 'text-emerald-400'
    : color === 'red' ? 'text-red-400'
    : 'text-slate-100';

  return (
    <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
      <p className="text-xs font-medium text-slate-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${valColor}`}>{value}</p>
    </div>
  );
}
