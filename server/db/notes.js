import { randomUUID } from 'node:crypto'
import { db } from './connection.js'
import { nextTimestamp } from '../lib/time.js'

const HEX = /^#[0-9a-fA-F]{6}$/
const MAX_EDITOR_NAME = 40

// Identidad de quien crea/edita (Fase 9 — informativa, spoofeable).
function sanitizeEditorName(name) {
  return typeof name === 'string' && name.trim().length > 0 ? name.trim().slice(0, MAX_EDITOR_NAME) : null
}

function sanitizeEditorColor(color) {
  return typeof color === 'string' && HEX.test(color) ? color.toLowerCase() : null
}

export function getNotes(room) {
  return db.prepare('SELECT * FROM note WHERE room = ? ORDER BY updated_at DESC').all(room)
}

export function createNote(room, title, editorName, editorColor) {
  const id = randomUUID()
  const now = new Date().toISOString()
  const lastEditorName = sanitizeEditorName(editorName)
  const lastEditorColor = sanitizeEditorColor(editorColor)
  db.prepare(
    'INSERT INTO note (id, room, title, body, created_at, updated_at, last_editor_name, last_editor_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, room, title, '', now, now, lastEditorName, lastEditorColor)
  return { id, room, title, body: '', created_at: now, updated_at: now, last_editor_name: lastEditorName, last_editor_color: lastEditorColor }
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
  db.prepare('UPDATE note SET title = ?, body = ?, updated_at = ?, last_editor_name = ?, last_editor_color = ? WHERE id = ?')
    .run(note.title, note.body, now, sanitizeEditorName(note.editor_name), sanitizeEditorColor(note.editor_color), note.id)
  return { status: 'ok', note: db.prepare('SELECT * FROM note WHERE id = ?').get(note.id) }
}

export function deleteNote(id) {
  const note = db.prepare('SELECT * FROM note WHERE id = ?').get(id)
  db.prepare('DELETE FROM note WHERE id = ?').run(id)
  return note
}

export function restoreNote(note) {
  db.prepare(`
    INSERT OR IGNORE INTO note (id, room, title, body, created_at, updated_at, last_editor_name, last_editor_color)
    VALUES (@id, @room, @title, @body, @created_at, @updated_at, @last_editor_name, @last_editor_color)
  `).run(note)
  return note
}
