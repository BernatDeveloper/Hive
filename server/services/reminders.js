import webpush from '../config/webpush.js'
import { getPendingReminderEvents, markReminderSent } from '../db/events.js'
import { getRoomSubscriptions, deletePushSubscription } from '../db/push.js'
import { zonedWallTimeToInstant } from '../lib/time.js'
import { logger } from '../lib/logger.js'

// Hora efectiva del evento, interpretada en la zona de la sala: si es fecha
// sin hora ("YYYY-MM-DD"), 09:00 de esa zona; si tiene hora, esa hora de
// pared (recortada a minutos) en esa zona. El display del calendario no
// cambia — esto solo gobierna cuándo dispara el push.
export function effectiveStart(ev, timeZone) {
  const isDateOnly = ev.start.length === 10
  const wall = isDateOnly ? `${ev.start}T09:00` : ev.start.slice(0, 16)
  return zonedWallTimeToInstant(wall, timeZone)
}

function reminderBody(minutes) {
  if (minutes >= 1440) return `Es dentro de ${Math.round(minutes / 1440)} día(s)`
  if (minutes >= 60) return `Empieza en ${Math.round(minutes / 60)} hora(s)`
  return `Empieza en ${minutes} minutos`
}

export async function sendPushToRoom(room, payload) {
  const subs = getRoomSubscriptions(room)
  await Promise.all(subs.map(async (s) => {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload))
    } catch (err) {
      // 410 Gone / 404: la suscripción caducó — borrarla para no reintentar
      // ni dejar que la tabla crezca con suscripciones muertas.
      if (err.statusCode === 404 || err.statusCode === 410) {
        deletePushSubscription(s.endpoint)
        logger.info(`push subscription caducada eliminada (${err.statusCode})`)
      } else {
        logger.error('sendPushToRoom', err)
      }
    }
  }))
}

function runReminderTick() {
  try {
    const now = Date.now()
    for (const ev of getPendingReminderEvents()) {
      const fireTime = effectiveStart(ev, ev.timezone) - ev.reminder_offset * 60_000
      if (now >= fireTime && now - fireTime < 6 * 60 * 60_000) {
        sendPushToRoom(ev.room, {
          title: ev.title,
          body: reminderBody(ev.reminder_offset),
          url: '/',
          eventId: ev.id
        })
        markReminderSent(ev.id)
      } else if (fireTime < now - 6 * 60 * 60_000) {
        markReminderSent(ev.id) // demasiado viejo: marcar para no reintentar
      }
    }
  } catch (e) {
    logger.error('reminderTick', e)
  }
}

export function startReminderScheduler() {
  setInterval(runReminderTick, 60_000)
  runReminderTick() // primera pasada inmediata
}
