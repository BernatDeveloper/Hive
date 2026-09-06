import { randomUUID } from 'node:crypto'
import { db } from './connection.js'

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

export function updateNote(note) {
  const now = new Date().toISOString()
  db.prepare('UPDATE note SET title = ?, body = ?, updated_at = ? WHERE id = ?')
    .run(note.title, note.body, now, note.id)
  return db.prepare('SELECT * FROM note WHERE id = ?').get(note.id)
}

export function deleteNote(id) {
  db.prepare('DELETE FROM note WHERE id = ?').run(id)
}
