import { db } from './connection.js'
import { hashPassword, verifyPassword } from '../auth/password.js'

const HEX = /^#[0-9a-fA-F]{6}$/
const MAX_EVENT_COLORS = 8

// Normaliza la paleta de colores de evento: array de hex #rrggbb, sin
// duplicados, tope de 8. Devuelve [] ante cualquier entrada inválida.
function sanitizeEventColors(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  for (const c of value) {
    if (typeof c === 'string' && HEX.test(c)) seen.add(c.toLowerCase())
    if (seen.size >= MAX_EVENT_COLORS) break
  }
  return [...seen]
}

// Parsea la columna JSON `event_colors`. [] si es null o no parsea.
function parseEventColors(json) {
  if (!json) return []
  try {
    return sanitizeEventColors(JSON.parse(json))
  } catch {
    return []
  }
}

export async function createRoom(name, password) {
  if (db.prepare('SELECT name FROM room WHERE name = ?').get(name)) {
    return { ok: false, error: 'El nombre de sala ya existe' }
  }
  const hash = await hashPassword(password)
  // ON CONFLICT: si otra conexión creó la sala mientras hasheábamos, `changes`
  // será 0 y lo tratamos como nombre ya existente (sin sobrescribir el hash).
  const info = db.prepare(
    `INSERT INTO room (name, password_hash, created_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(name) DO NOTHING`
  ).run(name, hash)
  if (info.changes === 0) return { ok: false, error: 'El nombre de sala ya existe' }
  return { ok: true }
}

export async function verifyRoomAccess(name, password) {
  const room = db.prepare('SELECT * FROM room WHERE name = ?').get(name)
  if (!room) return { ok: false, error: 'La sala no existe' }
  if (!(await verifyPassword(password, room.password_hash))) {
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
      event_colors: parseEventColors(styles?.event_colors),
    }
  }
}

export function updateRoomStyle(name, styles) {
  const { primary_color, background_color, text_color, sidebar_color } = styles
  // INSERT OR REPLACE reescribe la fila entera: si el payload no trae
  // `event_colors`, se conserva la paleta ya guardada.
  const event_colors = 'event_colors' in styles
    ? sanitizeEventColors(styles.event_colors)
    : parseEventColors(db.prepare('SELECT event_colors FROM room_style WHERE room = ?').get(name)?.event_colors)
  db.prepare(`
    INSERT OR REPLACE INTO room_style (room, primary_color, background_color, text_color, sidebar_color, event_colors)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, primary_color, background_color, text_color, sidebar_color, JSON.stringify(event_colors))
  return { name, primary_color, background_color, text_color, sidebar_color, event_colors }
}
