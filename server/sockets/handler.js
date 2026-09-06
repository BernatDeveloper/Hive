import { logger } from '../lib/logger.js'
import { isNonEmptyString, isAuthedFor } from './helpers.js'

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

// Como safeOn, pero además exige que el socket haya pasado `join-room`/`create-room`
// para la sala del payload (`payload.room`). Un socket sin autenticar no puede
// leer ni escribir datos de una sala solo por conocer su nombre. Rechazo
// silencioso: no dar pistas a un cliente que no debería estar aquí.
export function safeAuthedOn(socket, event, errorEvent, errorPayload, handler) {
  safeOn(socket, event, errorEvent, errorPayload, (payload) => {
    if (!isNonEmptyString(payload.room) || !isAuthedFor(socket, payload.room)) return
    handler(payload)
  })
}
