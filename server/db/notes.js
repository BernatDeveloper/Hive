import { randomUUID } from 'node:crypto'
import { db } from './connection.js'
import { nextTimestamp } from '../lib/time.js'

export function getNotes(room) {
  return db.prepare('SELECT * FROM note WHERE room = ? ORDER BY updated_at DESC').all(room)
}

export function createNote(room, title) {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO note (id, room, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, room, title, '', now, now)
  return { id, room, title, body: '', created_at: now, updated_at: now }
}

// Concurrencia optimista: si `note.expected_updated_at` viene y no coincide con
// el `updated_at` actual, es un guardado sobre una versión obsoleta → no se
// aplica y se devuelve la versión buena para reconciliar en el cliente.
// Sin `expected_updated_at` → last-write-wins (compatibilidad).
export function updateNote(note) {
  const current = db.prepare('SELECT * FROM note WHERE id = ?').get(note.id)
  if (!current) return { status: 'not-found' }
  if (note.expected_updated_at != null && note.expected_updated_at !== current.updated_at) {
    return { status: 'conflict', current }
  }
  const now = nextTimestamp(current.updated_at)
  db.prepare('UPDATE note SET title = ?, body = ?, updated_at = ? WHERE id = ?')
    .run(note.title, note.body, now, note.id)
  return { status: 'ok', note: db.prepare('SELECT * FROM note WHERE id = ?').get(note.id) }
}

export function deleteNote(id) {
  const note = db.prepare('SELECT * FROM note WHERE id = ?').get(id)
  db.prepare('DELETE FROM note WHERE id = ?').run(id)
  return note
}

export function restoreNote(note) {
  db.prepare('INSERT OR IGNORE INTO note (id, room, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(note.id, note.room, note.title, note.body, note.created_at, note.updated_at)
  return note
}
