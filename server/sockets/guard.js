import { LIMITS } from '../config/limits.js'
import { createTokenBucket } from '../lib/tokenBucket.js'
import { logger } from '../lib/logger.js'
import { ipOf } from '../http/ip.js'

// Mensajes que no escriben nada: cuentan para el límite general, no para el de escrituras.
const READ_EVENTS = new Set(['get-presence'])
const NOTICE_EVERY_MS = 1000

// Protección por socket, ANTES de que cualquier handler vea el mensaje:
//  - contabilidad de conexiones abiertas por IP (el límite se aplica al abrir,
//    en createIo → allowRequest);
//  - dos cubos de fichas por socket: uno para TODO lo que llega (incluidos
//    mensajes con nombres inventados) y otro, más estrecho, para escrituras;
//  - un mensaje descartado suma una falta a su IP; con suficientes se banea
//    (ver lib/ipGuard.js) y se cierran los sockets de esa IP.
//
// Esto vale también DENTRO de una sala: el límite de intentos de acceso solo
// protege contra adivinar contraseñas; quien ya tiene la contraseña (o un
// script con ella) podría inundar de escrituras al servidor.
export function attachSocketGuard(io, ipGuard) {
  function ban(ip) {
    logger.warn(`IP baneada ${Math.round(LIMITS.banMs / 1000)}s por abuso: ${ip}`)
    for (const s of io.sockets.sockets.values()) if (s.data.ip === ip) s.disconnect(true)
  }

  io.on('connection', (socket) => {
    const { ip, reliable } = ipOf(socket.handshake.headers, socket.handshake.address)
    socket.data.ip = reliable ? ip : null

    // Disponible para otros handlers (p. ej. intentos de acceso rechazados).
    const strike = () => { if (reliable && ipGuard.strike(ip)) ban(ip) }
    socket.data.strike = strike

    if (reliable) {
      ipGuard.connected(ip)
      socket.on('disconnect', () => ipGuard.disconnected(ip))
    }

    const general = createTokenBucket(LIMITS.eventBucket)
    const writes = createTokenBucket(LIMITS.writeBucket)
    let lastNotice = 0

    socket.use(([event], next) => {
      if (general.take() && (READ_EVENTS.has(event) || writes.take())) return next()
      // Descartado: no se llama a next(), el handler nunca lo ve. Se avisa al
      // cliente como mucho una vez por segundo (para no amplificar la ráfaga).
      const t = Date.now()
      if (t - lastNotice > NOTICE_EVERY_MS) {
        lastNotice = t
        socket.emit('rate-limited')
      }
      strike()
    })
  })
}
