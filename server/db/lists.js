import { randomUUID } from 'node:crypto'
import { db } from './connection.js'

export function getLists(room) {
  return db.prepare('SELECT * FROM list WHERE room = ? ORDER BY created_at ASC').all(room)
}

export function getListItems(room) {
  return db.prepare('SELECT * FROM list_item WHERE room = ? ORDER BY created_at ASC')
    .all(room)
    .map(i => ({ ...i, checked: Boolean(i.checked) }))
}

export function createList(room, title) {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO list (id, room, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, room, title, now, now)
  return { id, room, title, created_at: now }
}

export function deleteList(id) {
  db.prepare('DELETE FROM list WHERE id = ?').run(id)
}

export function createListItem(listId, room, text) {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO list_item (id, list_id, room, text, checked, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
  ).run(id, listId, room, text, now, now)
  return { id, list_id: listId, room, text, checked: false }
}

export function toggleListItem(id, checked) {
  const now = new Date().toISOString()
  db.prepare('UPDATE list_item SET checked = ?, updated_at = ? WHERE id = ?')
    .run(checked ? 1 : 0, now, id)
  const item = db.prepare('SELECT * FROM list_item WHERE id = ?').get(id)
  return { ...item, checked: Boolean(item.checked) }
}

export function deleteListItem(id) {
  db.prepare('DELETE FROM list_item WHERE id = ?').run(id)
}
