import { randomUUID } from 'node:crypto'
import { db } from './connection.js'

// Forma que espera el cliente (ver client/src/types.ts ListItem / contract.test.js)
// — sin esto, un `SELECT *` se cuela con created_at/updated_at de más.
const toClientItem = row => ({ id: row.id, list_id: row.list_id, room: row.room, text: row.text, checked: Boolean(row.checked) })

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

export function updateListTitle(id, title) {
  const now = new Date().toISOString()
  db.prepare('UPDATE list SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id)
  const row = db.prepare('SELECT id, room, title, created_at FROM list WHERE id = ?').get(id)
  return row ?? null
}

export function deleteList(id) {
  const list = db.prepare('SELECT * FROM list WHERE id = ?').get(id)
  const items = db.prepare('SELECT * FROM list_item WHERE list_id = ?').all(id)
  db.prepare('DELETE FROM list WHERE id = ?').run(id) // cascada borra los ítems
  return { list, items }
}

export function restoreList(list, items) {
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO list (id, room, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(list.id, list.room, list.title, list.created_at, list.updated_at)
    const ins = db.prepare('INSERT OR IGNORE INTO list_item (id, list_id, room, text, checked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const it of items) ins.run(it.id, it.list_id, it.room, it.text, it.checked, it.created_at, it.updated_at)
  })()
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
  return toClientItem(db.prepare('SELECT * FROM list_item WHERE id = ?').get(id))
}

export function updateListItemText(id, text) {
  const now = new Date().toISOString()
  db.prepare('UPDATE list_item SET text = ?, updated_at = ? WHERE id = ?').run(text, now, id)
  return toClientItem(db.prepare('SELECT * FROM list_item WHERE id = ?').get(id))
}

// Borra los ítems ya marcados de una lista ("vaciar completados"). Devuelve
// las filas completas (no la forma de cliente) porque se usan para el
// tombstone de deshacer, igual que deleteListItem.
export function clearCompletedItems(listId) {
  const items = db.prepare('SELECT * FROM list_item WHERE list_id = ? AND checked = 1').all(listId)
  if (items.length > 0) {
    db.prepare('DELETE FROM list_item WHERE list_id = ? AND checked = 1').run(listId)
  }
  return items
}

export function deleteListItem(id) {
  const item = db.prepare('SELECT * FROM list_item WHERE id = ?').get(id)
  db.prepare('DELETE FROM list_item WHERE id = ?').run(id)
  return item
}

export function restoreListItem(item) {
  db.prepare('INSERT OR IGNORE INTO list_item (id, list_id, room, text, checked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(item.id, item.list_id, item.room, item.text, item.checked, item.created_at, item.updated_at)
}
