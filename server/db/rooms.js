import { randomBytes } from 'node:crypto'
import { db } from './connection.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { isValidTimeZone } from '../lib/time.js'

const DEFAULT_TIMEZONE = 'Europe/Madrid'

// Un único mensaje para "no existe" y "contraseña incorrecta": si no, el
// formulario de acceso serviría para averiguar qué nombres de sala existen.
export const BAD_CREDENTIALS = 'Sala o contraseña incorrectas'

// Para que tampoco el TIEMPO delate si una sala existe: con una sala real se
// ejecuta scrypt (decenas de ms) y con una inexistente se haría una respuesta
// instantánea. Se verifica contra un hash de relleno para que cueste lo mismo.
let dummyHash = null
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')))

export function roomExists(name) {
  return !!db.prepare('SELECT 1 FROM room WHERE name = ?').get(name)
}

export async function createRoom(name, password, timezone) {
  if (db.prepare('SELECT name FROM room WHERE name = ?').get(name)) {
    return { ok: false, error: 'El nombre de sala ya existe' }
  }
  const hash = await hashPassword(password)
  const tz = isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE
  // ON CONFLICT: si otra conexión creó la sala mientras hasheábamos, `changes`
  // será 0 y lo tratamos como nombre ya existente (sin sobrescribir el hash).
  const info = db.prepare(
    `INSERT INTO room (name, password_hash, created_at, timezone) VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(name) DO NOTHING`
  ).run(name, hash, tz)
  if (info.changes === 0) return { ok: false, error: 'El nombre de sala ya existe' }
  return { ok: true }
}

export async function verifyRoomAccess(name, password) {
  const room = db.prepare('SELECT * FROM room WHERE name = ?').get(name)
  if (!room) {
    await verifyPassword(password, await getDummyHash())
    return { ok: false, error: BAD_CREDENTIALS }
  }
  if (!(await verifyPassword(password, room.password_hash))) {
    return { ok: false, error: BAD_CREDENTIALS }
  }
  const styles = db.prepare('SELECT * FROM room_style WHERE room = ?').get(name)
  return {
    ok: true,
    room: {
      name: room.name,
      created_at: room.created_at,
      timezone: room.timezone,
      primary_color: styles?.primary_color ?? null,
      background_color: styles?.background_color ?? null,
      text_color: styles?.text_color ?? null,
      sidebar_color: styles?.sidebar_color ?? null,
    }
  }
}

// Cambia la zona horaria de la sala (afecta al instante en que disparan los
// recordatorios push; el display del calendario sigue igual para todos).
export function updateRoomTimezone(name, timezone) {
  const tz = isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE
  db.prepare('UPDATE room SET timezone = ? WHERE name = ?').run(tz, name)
  return { name, timezone: tz }
}

export function updateRoomStyle(name, styles) {
  const { primary_color, background_color, text_color, sidebar_color } = styles
  db.prepare(`
    INSERT OR REPLACE INTO room_style (room, primary_color, background_color, text_color, sidebar_color)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, primary_color, background_color, text_color, sidebar_color)
  return { name, primary_color, background_color, text_color, sidebar_color }
}
