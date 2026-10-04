import { config } from './env.js'
import { logger } from '../lib/logger.js'

// CLIENT_ORIGIN admite uno o varios orígenes separados por comas (p. ej. el de
// producción y el de un entorno de pruebas). Se normalizan con `URL.origin`:
// sin barra final ni ruta ("https://app.com/" → "https://app.com"), que es
// como los navegadores mandan la cabecera Origin — si no, pegar la URL con
// barra final hacía que ninguna petición coincidiera. Lo que no es una URL se
// descarta.
export function parseOrigins(value) {
  if (!value) return []
  return value.split(',').map(v => v.trim()).filter(Boolean).flatMap(v => {
    try {
      const url = new URL(v)
      // Solo http(s): un "file:///x" tiene origen opaco "null" y colaría ese valor.
      return url.protocol === 'http:' || url.protocol === 'https:' ? [url.origin] : []
    } catch { return [] }
  })
}

// ¿Es un host de desarrollo local? localhost, loopback y las redes privadas
// (192.168/16, 10/8, 172.16/12): así se puede probar el cliente desde el móvil
// por http://<ip-del-pc>:5173 sin tocar la configuración. SOLO en desarrollo.
export function isLocalDevHost(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

// Comprobador de orígenes. `allowLocalhost` = origen de desarrollo local
// (cualquier puerto: Vite salta de puerto si el 5173 está ocupado) — solo
// fuera de producción.
//
// NO se aceptan dominios de plataforma en bloque (antes: cualquier
// `*.vercel.app`): cualquier persona puede publicar una página ahí, y esa
// página podría abrir conexiones a este servidor desde el navegador de un
// visitante. No salta la contraseña de sala, pero no hay motivo para dejarlo
// abierto: en producción solo valen los orígenes de CLIENT_ORIGIN.
export function createOriginChecker({ allowedOrigins, allowLocalhost }) {
  const allowed = new Set(allowedOrigins)
  return function isOriginAllowed(origin) {
    let url
    try { url = new URL(origin) } catch { return false } // incluye el literal "null"
    if (allowLocalhost && isLocalDevHost(url.hostname)) return true
    return allowed.has(url.origin)
  }
}

const isProduction = process.env.NODE_ENV === 'production'
const allowedOrigins = parseOrigins(config.clientOrigin)

if (isProduction && allowedOrigins.length === 0) {
  logger.warn('CLIENT_ORIGIN no está definido: ningún navegador podrá conectarse desde un dominio de producción (CORS).')
}

export const isOriginAllowed = createOriginChecker({ allowedOrigins, allowLocalhost: !isProduction })

// Firma que esperan tanto `cors` (Express) como Socket.io: (origin, callback).
// Un origen no permitido simplemente no recibe cabeceras CORS (el navegador
// bloquea la respuesta); devolver un Error aquí acababa en un 500 con traza en
// el log por cada petición ajena.
export function corsOrigin(origin, cb) {
  if (!origin) return cb(null, true) // health checks, curl (los navegadores siempre mandan Origin)
  cb(null, isOriginAllowed(origin))
}
