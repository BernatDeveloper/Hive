import { useEffect, useState } from 'react'

// Registra el service worker y detecta cuándo hay una versión nueva en espera.
// El SW nuevo NO toma el control hasta que se llama a `apply()` (ver public/sw.js).
export function useServiceWorkerUpdate() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let cancelled = false

    navigator.serviceWorker.register('/sw.js').then(reg => {
      if (cancelled) return
      // Ya hay uno esperando al cargar la página.
      if (reg.waiting && navigator.serviceWorker.controller) setReady(true)

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          // 'installed' + hay un controller => es una actualización, no la 1ª instalación.
          if (nw.state === 'installed' && navigator.serviceWorker.controller) setReady(true)
        })
      })
    }).catch(err => console.error('[sw] register', err))

    // Cuando el SW nuevo toma el control, recargamos para servir el cliente nuevo.
    let reloading = false
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  async function apply() {
    const reg = await navigator.serviceWorker.getRegistration()
    reg?.waiting?.postMessage('skip-waiting')
  }

  return { ready, apply }
}
