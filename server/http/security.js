import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { createRateLimiter } from '../lib/rateLimit.js'
import { LIMITS } from '../config/limits.js'
import { ipOf } from './ip.js'

// El servidor HTTP solo expone GET /health (todo lo demás va por Socket.io),
// así que la política es "no hay nada que embeber ni ejecutar".
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  // HSTS solo si la conexión original fue HTTPS (lo termina el proxy): mandarlo
  // por HTTP plano en desarrollo dejaría el navegador forzando https a localhost.
  if (process.env.NODE_ENV === 'production' && config.trustProxy && req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }
  next()
}

// Límite por IP para las rutas HTTP normales. Las de Socket.io no pasan por
// aquí (engine.io las atiende antes de Express) y tienen el suyo en io.js.
export function createHttpLimiter({ max = LIMITS.httpRequestsPerMinutePerIp } = {}) {
  const check = createRateLimiter({ windowMs: 60_000, max })
  return function httpLimiter(req, res, next) {
    const { ip, reliable } = ipOf(req.headers, req.socket.remoteAddress)
    if (!reliable) return next()
    const result = check(ip)
    if (result.allowed) return next()
    res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)))
    res.status(429).json({ error: 'too-many-requests' })
  }
}

// Sin esto Express responde "Cannot GET /x" en HTML (y, fuera de producción, con
// la traza del error): no hay por qué enseñar de qué está hecho el servidor.
export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'not-found' })
}

// Express exige 4 argumentos para reconocer un manejador de errores.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500
  if (status === 500) logger.error('http', err)
  const code = status === 500 ? 'internal' : status === 413 ? 'payload-too-large' : 'bad-request'
  res.status(status).json({ error: code })
}
