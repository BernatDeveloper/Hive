// Enrutado mínimo (la app tiene una sola pantalla real y dos páginas estáticas;
// no hace falta una librería). Se decide UNA vez al arrancar, a partir de la
// ruta de la URL — cada página se abre con una navegación normal, no con
// pushState, así que el estado de la app no se mezcla con estas páginas.
export type Route = 'app' | 'privacy' | 'not-found'

export function resolveRoute(pathname: string): Route {
  // "/privacidad/" y "/privacidad" son la misma página.
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/' || path === '/index.html') return 'app'
  if (path === '/privacidad') return 'privacy'
  return 'not-found'
}
