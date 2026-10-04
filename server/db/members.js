import { db } from './connection.js'

// Alta o actualización (al entrar o al renombrarse) de un dispositivo como
// miembro de la sala. El nombre/color llegan ya saneados (sockets/presence.js).
export function upsertRoomMember(room, deviceId, name, color) {
  db.prepare(`
    INSERT INTO room_member (room, device_id, name, color, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (room, device_id) DO UPDATE SET
      name = excluded.name, color = excluded.color, last_seen_at = excluded.last_seen_at
  `).run(room, deviceId, name, color, new Date().toISOString())
}

// Al desconectarse (sin otra pestaña de ese dispositivo en la sala): fija el
// "visto por última vez".
export function touchRoomMember(room, deviceId) {
  db.prepare('UPDATE room_member SET last_seen_at = ? WHERE room = ? AND device_id = ?')
    .run(new Date().toISOString(), room, deviceId)
}

export function getRoomMembers(room) {
  return db.prepare('SELECT device_id, name, color, last_seen_at FROM room_member WHERE room = ?').all(room)
}
