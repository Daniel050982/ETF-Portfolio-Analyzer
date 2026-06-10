import { Routes, Route } from 'react-router-dom';
import { PortfolioProvider } from './store/PortfolioContext';
import { AppHeader } from './components/AppHeader';
import DashboardPage from './pages/DashboardPage';
import PortfolioPage from './pages/PortfolioPage';
import WertpapierDetailPage from './pages/WertpapierDetailPage';
import SteuerPage from './pages/SteuerPage';
import ImportPage from './pages/ImportPage';

export default function App() {
  return (
    <PortfolioProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <AppHeader />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/portfolio/:id" element={<WertpapierDetailPage />} />
          <Route path="/steuer" element={<SteuerPage />} />
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </div>
    </PortfolioProvider>
  );
}
