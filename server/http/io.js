import { Server } from 'socket.io'
import { corsOrigin, isOriginAllowed } from '../config/cors.js'
import { LIMITS } from '../config/limits.js'
import { createIpGuard } from '../lib/ipGuard.js'
import { logger } from '../lib/logger.js'
import { attachSocketGuard } from '../sockets/guard.js'
import { ipOf } from './ip.js'

export function createIo(httpServer) {
  const ipGuard = createIpGuard({
    maxConnections: LIMITS.maxConnectionsPerIp,
    handshakesPerMinute: LIMITS.handshakesPerMinutePerIp,
    strikesToBan: LIMITS.strikesToBan,
    strikeWindowMs: LIMITS.strikeWindowMs,
    banMs: LIMITS.banMs,
  })

  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
    // Un mensaje mayor cierra la conexión (el defecto de socket.io es 1 MB).
    maxHttpBufferSize: LIMITS.maxMessageBytes,
    // Se ejecuta ANTES de crear la sesión: rechazar aquí es lo más barato.
    // Ojo: engine.io lo llama en CADA petición, también en las de long-polling
    // de sesiones ya abiertas (llevan `sid`); solo las conexiones nuevas cuentan
    // para el límite por minuto, pero un baneo corta todo.
    allowRequest(req, callback) {
      // CORS NO protege las conexiones WebSocket (el navegador no lo aplica a
      // ws://), así que el origen se comprueba aquí, antes de crear la sesión.
      // Sin cabecera Origin = cliente que no es un navegador (scripts, tests):
      // pasa, igual que con CORS; lo que lo frena es la contraseña de sala.
      const origin = req.headers.origin
      if (origin && !isOriginAllowed(origin)) {
        logger.warn(`conexión rechazada (origen no permitido) origin=${origin}`)
        return callback('origin-not-allowed', false)
      }

      const { ip, reliable } = ipOf(req.headers, req.socket.remoteAddress)
      if (!reliable) return callback(null, true)
      if (ipGuard.isBanned(ip)) return callback('banned', false)

      const isNewSession = !new URL(req.url, 'http://localhost').searchParams.has('sid')
      if (!isNewSession) return callback(null, true)

      const verdict = ipGuard.check(ip)
      if (verdict.ok) return callback(null, true)
      logger.warn(`conexión rechazada (${verdict.reason}) ip=${ip}`)
      callback(verdict.reason, false)
    },
  })

  attachSocketGuard(io, ipGuard)

  const sweep = setInterval(() => ipGuard.sweep(), 60_000)
  sweep.unref?.()
  httpServer.on('close', () => clearInterval(sweep))

  return io
}
