import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Kein StrictMode: dessen absichtlicher Doppel-Render (nur im Dev) verdoppelt
// die Arbeit bei jedem Kontowechsel mit tausenden Buchungen spürbar. Im
// Production-Build ist StrictMode ohnehin wirkungslos.
createRoot(document.getElementById('root')!).render(
  <App />,
)
