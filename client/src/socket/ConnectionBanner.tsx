import { useEffect, useState } from 'react'
import './connection-banner.css'
import { useConnection } from './useConnection'

// Barra fija que aparece cuando el socket lleva un rato sin conexión. Espera una
// gracia antes de mostrarse para no parpadear en la conexión inicial normal ni
// en microcortes que se recuperan solos.
const GRACE_MS = 3000

export function ConnectionBanner() {
  const status = useConnection()
  const connected = status === 'connected'
  const [graceElapsed, setGraceElapsed] = useState(false)

  // Depende de `connected` (booleano), no de `status`: mientras no hay conexión
  // el estado oscila connecting↔disconnected cada segundo, y no queremos que
  // eso reinicie la cuenta de gracia.
  useEffect(() => {
    if (connected) return
    const timer = setTimeout(() => setGraceElapsed(true), GRACE_MS)
    return () => {
      clearTimeout(timer)
      setGraceElapsed(false)
    }
  }, [connected])

  if (connected || !graceElapsed) return null

  return (
    <div className="connection-banner" role="status" aria-live="polite">
      <span className="connection-banner-dot" />
      Sin conexión con el servidor. Reintentando…
    </div>
  )
}
