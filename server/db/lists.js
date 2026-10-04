import { randomUUID } from 'node:crypto'
import { db } from './connection.js'
import { sanitizeEditorName, sanitizeEditorColor } from './editor.js'

// Formas que espera el cliente (ver client/src/types.ts / contract.test.js) —
// sin esto, un `SELECT *` se cuela con created_at/updated_at de más.
const toClientItem = row => ({ id: row.id, list_id: row.list_id, room: row.room, text: row.text, checked: Boolean(row.checked) })

const toClientList = row => ({
  id: row.id,
  room: row.room,
  title: row.title,
  created_at: row.created_at,
  last_editor_name: row.last_editor_name ?? null,
  last_editor_color: row.last_editor_color ?? null,
  edited_at: row.edited_at ?? null,
})

const getListRow = id => db.prepare('SELECT * FROM list WHERE id = ?').get(id)

// Atribución de la lista: quién hizo la ÚLTIMA modificación y cuándo. Cuenta
// cualquier cambio de la lista o de sus ítems (crearla, renombrarla, añadir,
// marcar/desmarcar, editar o borrar un ítem, vaciar completados, clonarla).
// `editor` = { name, color } (identidad de dispositivo, informativa y spoofeable).
function attributionOf(editor = {}) {
  return { name: sanitizeEditorName(editor.name), color: sanitizeEditorColor(editor.color), at: new Date().toISOString() }
}

export function getLists(room) {
  return db.prepare('SELECT * FROM list WHERE room = ? ORDER BY created_at ASC').all(room).map(toClientList)
}

export function getListItems(room) {
  return db.prepare('SELECT * FROM list_item WHERE room = ? ORDER BY created_at ASC')
    .all(room)
    .map(i => ({ ...i, checked: Boolean(i.checked) }))
}

export function createList(room, title, editor) {
  const id = randomUUID()
  const a = attributionOf(editor)
  db.prepare(
    'INSERT INTO list (id, room, title, created_at, updated_at, last_editor_name, last_editor_color, edited_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, room, title, a.at, a.at, a.name, a.color, a.at)
  return toClientList(getListRow(id))
}

export function updateListTitle(id, title, editor) {
  const a = attributionOf(editor)
  db.prepare('UPDATE list SET title = ?, updated_at = ?, last_editor_name = ?, last_editor_color = ?, edited_at = ? WHERE id = ?')
    .run(title, a.at, a.name, a.color, a.at, id)
  const row = getListRow(id)
  return row ? toClientList(row) : null
}

// Marca la lista como modificada por `editor` (tras tocar uno de sus ítems).
// Se acota por sala: un id de lista de otra sala no se toca. null si no existe.
export function touchList(room, id, editor) {
  const a = attributionOf(editor)
  const info = db.prepare('UPDATE list SET last_editor_name = ?, last_editor_color = ?, edited_at = ? WHERE id = ? AND room = ?')
    .run(a.name, a.color, a.at, id, room)
  return info.changes > 0 ? toClientList(getListRow(id)) : null
}

// Atribución actual de la lista tal cual está guardada (para el "deshacer" de
// borrar un ítem o vaciar completados) y su restauración.
export function getListAttribution(room, id) {
  const row = db.prepare('SELECT last_editor_name, last_editor_color, edited_at FROM list WHERE id = ? AND room = ?').get(id, room)
  return row ?? null
}

export function setListAttribution(room, id, prev) {
  const info = db.prepare('UPDATE list SET last_editor_name = ?, last_editor_color = ?, edited_at = ? WHERE id = ? AND room = ?')
    .run(prev.last_editor_name ?? null, prev.last_editor_color ?? null, prev.edited_at ?? null, id, room)
  return info.changes > 0 ? toClientList(getListRow(id)) : null
}

export function deleteList(id) {
  const list = getListRow(id)
  const items = db.prepare('SELECT * FROM list_item WHERE list_id = ?').all(id)
  db.prepare('DELETE FROM list WHERE id = ?').run(id) // cascada borra los ítems
  return { list, items }
}

export function restoreList(list, items) {
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO list (id, room, title, created_at, updated_at, last_editor_name, last_editor_color, edited_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(list.id, list.room, list.title, list.created_at, list.updated_at, list.last_editor_name ?? null, list.last_editor_color ?? null, list.edited_at ?? null)
    const ins = db.prepare('INSERT OR IGNORE INTO list_item (id, list_id, room, text, checked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const it of items) ins.run(it.id, it.list_id, it.room, it.text, it.checked, it.created_at, it.updated_at)
  })()
  return toClientList(getListRow(list.id))
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
  const row = db.prepare('SELECT * FROM list_item WHERE id = ?').get(id)
  return row ? toClientItem(row) : null
}

export function updateListItemText(id, text) {
  const now = new Date().toISOString()
  db.prepare('UPDATE list_item SET text = ?, updated_at = ? WHERE id = ?').run(text, now, id)
  const row = db.prepare('SELECT * FROM list_item WHERE id = ?').get(id)
  return row ? toClientItem(row) : null
}

// Duplica una lista con todos sus ítems, sin marcar — plantilla rápida para
// listas recurrentes (p. ej. "Compra semanal"). Quien clona figura como autor
// de la última modificación de la copia.
export function cloneList(id, editor) {
  const original = getListRow(id)
  if (!original) return null
  const items = db.prepare('SELECT * FROM list_item WHERE list_id = ? ORDER BY created_at ASC').all(id)
  const newId = randomUUID()
  const a = attributionOf(editor)
  const title = `${original.title} (copia)`
  const newItems = []
  db.transaction(() => {
    db.prepare('INSERT INTO list (id, room, title, created_at, updated_at, last_editor_name, last_editor_color, edited_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId, original.room, title, a.at, a.at, a.name, a.color, a.at)
    const ins = db.prepare('INSERT INTO list_item (id, list_id, room, text, checked, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
    for (const it of items) {
      const itemId = randomUUID()
      ins.run(itemId, newId, original.room, it.text, a.at, a.at)
      newItems.push({ id: itemId, list_id: newId, room: original.room, text: it.text, checked: false })
    }
  })()
  return { list: toClientList(getListRow(newId)), items: newItems }
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
