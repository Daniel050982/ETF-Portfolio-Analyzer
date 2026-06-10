import { Link, useLocation } from 'react-router-dom';
import { BarChart3, PieChart, Calculator, Upload } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/portfolio', label: 'Portfolio', icon: PieChart },
  { to: '/steuer', label: 'Steuer', icon: Calculator },
  { to: '/import', label: 'Import', icon: Upload },
];

export function AppHeader() {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 flex items-center justify-between h-14">
        <Link to="/" className="flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-emerald-400" />
          <span className="text-base font-bold text-slate-100 hidden sm:inline">ETF Portfolio Analyzer</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
