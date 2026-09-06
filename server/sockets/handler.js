import { logger } from '../lib/logger.js'

// Registra un handler de socket con manejo de errores uniforme: si el handler
// lanza, se loguea en el servidor y se avisa al cliente con `errorEvent`
// (payload `errorPayload`, mensaje en español) en vez de propagar la excepción.
// El payload siempre llega al handler como objeto (nunca undefined).
export function safeOn(socket, event, errorEvent, errorPayload, handler) {
  socket.on(event, (payload = {}) => {
    try {
      handler(payload)
    } catch (err) {
      logger.error(`socket:${event}`, err)
      socket.emit(errorEvent, errorPayload)
    }
  })
}
