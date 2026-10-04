import { useEffect } from 'react'
import './pages.css'
import HiveLogo from '../shared/HiveLogo'

// Página 404. Se muestra en rutas que no existen cuando el host sirve la app
// para cualquier ruta (desarrollo, preview, otros alojamientos). En Vercel, una
// ruta desconocida la atiende `public/404.html` con estado 404 real.
export default function NotFoundPage() {
  useEffect(() => {
    document.title = 'Página no encontrada · Hive'
    // Que ningún buscador indexe una URL inexistente.
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => { meta.remove() }
  }, [])

  return (
    <main className="page page--center">
      <a className="page-brand" href="/">
        <span className="page-brand-logo"><HiveLogo size={20} /></span>
        Hive
      </a>
      <p className="notfound-code" aria-hidden="true">404</p>
      <h1 className="notfound-title">No encontramos esta página</h1>
      <p className="notfound-text">
        La dirección que has abierto no existe o ha cambiado. Puedes volver al inicio y entrar a tu sala desde ahí.
      </p>
      <div className="notfound-actions">
        <a className="btn-primary" href="/">Ir al inicio</a>
        <a className="btn-secondary" href="/privacidad">Política de privacidad</a>
      </div>
    </main>
  )
}
