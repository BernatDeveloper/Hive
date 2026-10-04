import { savePushSubscription, deletePushSubscription, hasPushSubscription } from '../db/index.js'
import { createRateLimiter } from '../lib/rateLimit.js'
import { LIMITS } from '../config/limits.js'
import { withinQuota } from './quota.js'
import { safeAuthedOn, safeOn } from './handler.js'
import { MAX, str, isValidPushSubscription } from './validate.js'

const subscribeLimiter = createRateLimiter({ windowMs: 3_600_000, max: LIMITS.subscribePushPerHour })

export function registerPushHandlers(io, socket) {
  safeAuthedOn(socket, 'subscribe-push', 'push-error', { message: 'No se pudo registrar el dispositivo' }, ({ room, subscription }) => {
    if (!isValidPushSubscription(subscription)) return
    if (!subscribeLimiter(socket.id).allowed) {
      return socket.emit('push-error', { message: 'Demasiados intentos de registrar este dispositivo. Inténtalo más tarde.' })
    }
    // Volver a suscribir un dispositivo que ya está no ocupa cupo nuevo.
    if (!hasPushSubscription(subscription.endpoint) && !withinQuota(socket, 'push-error', 'push_subscription', room)) return
    savePushSubscription(room, subscription)
    socket.emit('push-subscribed')
  })

  safeOn(socket, 'unsubscribe-push', 'push-error', { message: 'No se pudo cancelar la suscripción' }, ({ endpoint }) => {
    if (!str(endpoint, MAX.pushEndpoint)) return
    // Sin `room` en este payload no se puede pedir isAuthedFor(socket, room);
    // exigimos al menos haber pasado la contraseña de alguna sala. El endpoint
    // en sí es un identificador opaco de push no adivinable, a diferencia de
    // un nombre de sala.
    if (!socket.data.authedRooms?.size) return
    deletePushSubscription(endpoint)
    socket.emit('push-unsubscribed')
  })
}
