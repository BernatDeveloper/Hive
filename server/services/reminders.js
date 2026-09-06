import webpush from '../config/webpush.js'
import { getPendingReminderEvents, markReminderSent } from '../db/events.js'
import { getRoomSubscriptions, deletePushSubscription } from '../db/push.js'
import { logger } from '../lib/logger.js'

// Hora efectiva del evento: si es fecha sin hora ("YYYY-MM-DD"), 09:00 locales.
function effectiveStart(ev) {
  const isDateOnly = ev.start.length === 10
  const iso = isDateOnly ? `${ev.start}T09:00:00` : ev.start
  return new Date(iso).getTime()
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
      if (err.statusCode === 404 || err.statusCode === 410) {
        deletePushSubscription(s.endpoint)
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
      const fireTime = effectiveStart(ev) - ev.reminder_offset * 60_000
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
