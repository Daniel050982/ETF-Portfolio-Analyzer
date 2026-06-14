import { useState } from 'react';
import { PortfolioProvider } from './store/PortfolioContext';
import { Sidebar, type ViewId } from './components/Sidebar';
import { Statusbar, PlaceholderView } from './components/PPElements';

import AlleWertpapiereView from './views/AlleWertpapiereView';
import KontenView from './views/KontenView';
import DepotsView from './views/DepotsView';
import BuchungenView from './views/BuchungenView';
import VermoegensuebersichtView from './views/VermoegensuebersichtView';
import PerformanceChartView from './views/PerformanceChartView';
import PerformanceBerechnungView from './views/PerformanceBerechnungView';
import StatementOfAssetsHistoryView from './views/StatementOfAssetsHistoryView';
import SteuerView from './views/SteuerView';
import SteuerPositionenView from './views/SteuerPositionenView';
import ImportView from './views/ImportView';
import EinstellungenView from './views/EinstellungenView';
import SparplaeneView from './views/SparplaeneView';
import GruppierteKontenView from './views/GruppierteKontenView';
import BestandView from './views/BestandView';
import RenditeVolatilitaetView from './views/RenditeVolatilitaetView';
import WertpapierePerfView from './views/WertpapierePerfView';
import ZahlungenView from './views/ZahlungenView';
import TradesView from './views/TradesView';
import KlassifizierungView from './views/KlassifizierungView';
import WaehrungenView from './views/WaehrungenView';
import DashboardView from './views/dashboard/DashboardView';

function ViewRouter({ view }: { view: ViewId }) {
  switch (view) {
    case 'alle-wertpapiere':
      return <AlleWertpapiereView key="alle" />;
    case 'krypto':
      return <AlleWertpapiereView key="krypto" filterTyp="Krypto" title="Krypto" />;
    case 'etf':
      return <AlleWertpapiereView key="etf" filterTyp="ETF" title="ETF" />;
    case 'waehrungen':
      return <AlleWertpapiereView key="waehrungen" title="Währungen" defaultFilters={['onlyExchangeRates']} />;
    case 'konten':
      return <KontenView />;
    case 'depots':
      return <DepotsView />;
    case 'gruppierte-konten':
      return <GruppierteKontenView />;
    case 'sparplaene':
      return <SparplaeneView />;
    case 'alle-buchungen':
      return <BuchungenView />;
    case 'vermoegensuebersicht':
      return <VermoegensuebersichtView />;
    case 'diagramm-berichte':
      return <StatementOfAssetsHistoryView />;
    case 'bestand':
      return <BestandView />;
    case 'performance-dashboard':
      return <DashboardView />;
    case 'berechnung':
      return <PerformanceBerechnungView />;
    case 'diagramm-perf':
      return <PerformanceChartView />;
    case 'rendite-volatilitaet':
      return <RenditeVolatilitaetView />;
    case 'wertpapiere-perf':
      return <WertpapierePerfView />;
    case 'zahlungen':
      return <ZahlungenView />;
    case 'trades':
      return <TradesView />;
    case 'klassifizierung-wertpapierart':
      return <KlassifizierungView />;
    case 'steuer':
      return <SteuerView />;
    case 'steuer-positionen':
      return <SteuerPositionenView />;
    case 'waehrungen-allgemein':
      return <WaehrungenView />;
    case 'einstellungen':
      return <EinstellungenView />;
    case 'import':
      return <ImportView />;
    default:
      return <PlaceholderView title="Unbekannte Ansicht" />;
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>('alle-wertpapiere');

  return (
    <PortfolioProvider>
      <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--pp-bg)', color: 'var(--pp-text)' }}>
        <div className="flex flex-1 overflow-hidden">
          <Sidebar activeView={activeView} onNavigate={setActiveView} />
          <main className="flex-1 overflow-hidden flex flex-col" style={{ background: 'var(--pp-content-bg)' }}>
            <ViewRouter view={activeView} />
          </main>
        </div>
        <Statusbar />
      </div>
    </PortfolioProvider>
  );
}
