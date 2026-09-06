import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SocketProvider } from './socket'

// El registro del service worker vive en useServiceWorkerUpdate() (src/pwa.ts),
// montado en <App>, para poder ofrecer el prompt de actualización.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SocketProvider>
      <App />
    </SocketProvider>
  </StrictMode>,
)
