import { randomUUID } from 'node:crypto'
import { db } from './connection.js'

export function savePushSubscription(room, subscription) {
  const { endpoint, keys } = subscription
  db.prepare(`
    INSERT INTO push_subscription (id, room, endpoint, p256dh, auth, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      room = excluded.room, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(randomUUID(), room, endpoint, keys.p256dh, keys.auth, new Date().toISOString())
}

export function deletePushSubscription(endpoint) {
  db.prepare('DELETE FROM push_subscription WHERE endpoint = ?').run(endpoint)
}

export function getRoomSubscriptions(room) {
  return db.prepare('SELECT endpoint, p256dh, auth FROM push_subscription WHERE room = ?').all(room)
}
