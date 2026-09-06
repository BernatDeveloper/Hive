import { db } from './connection.js'
import { hashPassword, verifyPassword } from '../auth/password.js'

export function createRoom(name, password) {
  if (db.prepare('SELECT name FROM room WHERE name = ?').get(name)) {
    return { ok: false, error: 'El nombre de sala ya existe' }
  }
  const hash = hashPassword(password)
  db.prepare(
    `INSERT INTO room (name, password_hash, created_at) VALUES (?, ?, datetime('now'))`
  ).run(name, hash)
  return { ok: true }
}

export function verifyRoomAccess(name, password) {
  const room = db.prepare('SELECT * FROM room WHERE name = ?').get(name)
  if (!room) return { ok: false, error: 'La sala no existe' }
  if (!verifyPassword(password, room.password_hash)) {
    return { ok: false, error: 'Contraseña incorrecta' }
  }
  const styles = db.prepare('SELECT * FROM room_style WHERE room = ?').get(name)
  return {
    ok: true,
    room: {
      name: room.name,
      created_at: room.created_at,
      primary_color: styles?.primary_color ?? null,
      background_color: styles?.background_color ?? null,
      text_color: styles?.text_color ?? null,
      sidebar_color: styles?.sidebar_color ?? null,
    }
  }
}

export function updateRoomStyle(name, styles) {
  const { primary_color, background_color, text_color, sidebar_color } = styles
  db.prepare(`
    INSERT OR REPLACE INTO room_style (room, primary_color, background_color, text_color, sidebar_color)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, primary_color, background_color, text_color, sidebar_color)
  return { name, primary_color, background_color, text_color, sidebar_color }
}
