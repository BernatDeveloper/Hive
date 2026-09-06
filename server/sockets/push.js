import { savePushSubscription, deletePushSubscription } from '../db/index.js'
import { isNonEmptyString, isAuthedFor } from './helpers.js'

export function registerPushHandlers(io, socket) {
  socket.on('subscribe-push', ({ room, subscription } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      if (typeof subscription !== 'object' || subscription === null) return
      savePushSubscription(room, subscription)
      socket.emit('push-subscribed')
    } catch (e) {
      console.error('[subscribe-push]', e)
      socket.emit('push-error', { message: 'No se pudo registrar el dispositivo' })
    }
  })

  socket.on('unsubscribe-push', ({ endpoint } = {}) => {
    try {
      if (!isNonEmptyString(endpoint)) return
      // Sin `room` en este payload no se puede pedir isAuthedFor(socket, room);
      // exigimos al menos haber pasado la contraseña de alguna sala. El endpoint
      // en sí es un identificador opaco de push no adivinable, a diferencia de
      // un nombre de sala.
      if (!socket.data.authedRooms?.size) return
      deletePushSubscription(endpoint)
      socket.emit('push-unsubscribed')
    } catch (e) {
      console.error('[unsubscribe-push]', e)
      socket.emit('push-error', { message: 'No se pudo cancelar la suscripción' })
    }
  })
}
