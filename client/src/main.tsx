import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { resolveRoute } from './routes'
import NotFoundPage from './pages/NotFoundPage'
import PrivacyPage from './pages/PrivacyPage'

// El registro del service worker vive en useServiceWorkerUpdate() (src/pwa.ts),
// montado en <App>, para poder ofrecer el prompt de actualización.

const root = createRoot(document.getElementById('root')!)
const route = resolveRoute(window.location.pathname)

if (route === 'app') {
  // Import DINÁMICO: al importar la app se crea el socket y se conecta al
  // servidor (socket/client.ts), y la política de privacidad o un 404 no tienen
  // por qué abrir una conexión ni intentar entrar en una sala.
  Promise.all([import('./App.tsx'), import('./socket')]).then(([{ default: App }, { SocketProvider }]) => {
    root.render(
      <StrictMode>
        <SocketProvider>
          <App />
        </SocketProvider>
      </StrictMode>,
    )
  })
} else {
  root.render(<StrictMode>{route === 'privacy' ? <PrivacyPage /> : <NotFoundPage />}</StrictMode>)
}
