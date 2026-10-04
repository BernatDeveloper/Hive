import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { resolveClientIp } from '../lib/clientIp.js'

// Si llega X-Forwarded-For pero TRUST_PROXY está desactivado, casi seguro hay un
// proxy delante: todos los clientes compartirían IP (la del proxy). Se avisa una sola vez.
let warnedForwardedHeader = false

// IP del cliente a partir de las cabeceras y la dirección del socket TCP.
// `reliable` = la IP identifica de verdad a un cliente. Es false cuando hay un
// proxy delante que NO hemos declarado de confianza: entonces la IP es la del
// proxy, y aplicar límites o baneos por IP castigaría a TODOS los usuarios por
// lo que haga uno. Los límites por IP se saltan si no es fiable.
export function ipOf(headers, address) {
  const forwardedFor = headers['x-forwarded-for']
  const hasForwarded = typeof forwardedFor === 'string' && forwardedFor.trim().length > 0
  if (!config.trustProxy && hasForwarded && !warnedForwardedHeader) {
    warnedForwardedHeader = true
    logger.warn('Llega X-Forwarded-For pero TRUST_PROXY no está activo: detrás de un proxy todos los clientes comparten IP, así que se desactivan los límites y baneos por IP (el de intentos de acceso sí sigue, y afectaría a toda la app). Define TRUST_PROXY=true (y TRUST_PROXY_HOPS si hay más de un proxy).')
  }
  return {
    ip: resolveClientIp({
      forwardedFor,
      address,
      trustProxy: config.trustProxy,
      hops: config.trustProxyHops,
    }),
    reliable: config.trustProxy || !hasForwarded,
  }
}
