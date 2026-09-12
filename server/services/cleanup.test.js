import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '../db/connection.js'
import { initDb } from '../db/index.js'
import { cleanInactiveRooms, cleanOldEvents } from './cleanup.js'

initDb()
after(() => db.close())

function isoYearsAgo(years) {
  return new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000).toISOString()
}

function insertRoom(name, createdAt) {
  db.prepare('INSERT INTO room (name, password_hash, created_at) VALUES (?, ?, ?)').run(name, 'x', createdAt)
}

function insertEvent(room, { start, end, updatedAt, recurrenceId = null }) {
  const id = randomUUID()
  db.prepare(`
    INSERT INTO event (id, room, title, start, end, recurrence_id, updated_at)
    VALUES (?, ?, 'E', ?, ?, ?, ?)
  `).run(id, room, start, end, recurrenceId, updatedAt)
  return id
}

function roomExists(name) {
  return !!db.prepare('SELECT 1 FROM room WHERE name = ?').get(name)
}

test('cleanInactiveRooms: no usa COALESCE(a,b,c) — una nota reciente protege una sala con eventos viejos', () => {
  const room = 'inact-' + randomUUID()
  insertRoom(room, isoYearsAgo(5))
  insertEvent(room, { start: '2020-01-01', end: '2020-01-01', updatedAt: isoYearsAgo(5) })
  db.prepare('INSERT INTO note (id, room, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), room, 'N', '', new Date().toISOString(), new Date().toISOString())

  cleanInactiveRooms()

  assert.ok(roomExists(room), 'una sala con actividad reciente en notas no debería borrarse')
})

test('cleanInactiveRooms: sala sin ninguna actividad en más de 2 años se borra', () => {
  const room = 'inact-' + randomUUID()
  insertRoom(room, isoYearsAgo(3))
  insertEvent(room, { start: '2020-01-01', end: '2020-01-01', updatedAt: isoYearsAgo(3) })

  cleanInactiveRooms()

  assert.ok(!roomExists(room))
})

test('cleanInactiveRooms: sala con actividad reciente (< 2 años) no se borra', () => {
  const room = 'inact-' + randomUUID()
  insertRoom(room, isoYearsAgo(1))
  insertEvent(room, { start: '2020-01-01', end: '2020-01-01', updatedAt: isoYearsAgo(1) })

  cleanInactiveRooms()

  assert.ok(roomExists(room))
})

test('cleanOldEvents: borra instancias > 3 años pero conserva las futuras de la misma serie', () => {
  const room = 'series-' + randomUUID()
  insertRoom(room, new Date().toISOString())
  const recurrenceId = randomUUID()
  const years = [2021, 2022, 2023, 2024, 2025, 2026, 2027]
  for (const y of years) {
    insertEvent(room, { start: `${y}-01-15`, end: `${y}-01-15`, updatedAt: new Date().toISOString(), recurrenceId })
  }

  cleanOldEvents()

  const remaining = db.prepare('SELECT start FROM event WHERE recurrence_id = ? ORDER BY start').all(recurrenceId)
  const threshold = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  assert.ok(remaining.length > 0 && remaining.length < years.length, 'debería borrar algunas y conservar otras')
  for (const r of remaining) assert.ok(r.start >= threshold, `${r.start} debería haberse borrado (< ${threshold})`)
  // La instancia más futura de la serie (2027) sobrevive: cleanOldEvents jamás
  // se lleva por delante ocurrencias futuras de una serie con historial viejo.
  assert.ok(remaining.some(r => r.start.startsWith('2027')), 'la instancia futura de la serie debe sobrevivir')
})

test('cleanOldEvents no toca eventos recientes de ninguna sala', () => {
  const room = 'recent-' + randomUUID()
  insertRoom(room, new Date().toISOString())
  const id = insertEvent(room, { start: '2026-12-01', end: '2026-12-01', updatedAt: new Date().toISOString() })

  cleanOldEvents()

  assert.ok(db.prepare('SELECT 1 FROM event WHERE id = ?').get(id))
})
