import type { ReactNode } from 'react';

export function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-700/50 bg-slate-800/60 ${className ?? ''}`}>
      {title && (
        <div className="px-4 py-3 border-b border-slate-700/30">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        </div>
      )}
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}
