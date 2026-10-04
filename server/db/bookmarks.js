import { randomUUID } from 'node:crypto'
import { db } from './connection.js'

const HEX = /^#[0-9a-fA-F]{6}$/
const MAX_EDITOR_NAME = 40
const MAX_TAGS = 10
const MAX_TAG_LENGTH = 30

function sanitizeEditorName(name) {
  return typeof name === 'string' && name.trim().length > 0 ? name.trim().slice(0, MAX_EDITOR_NAME) : null
}

function sanitizeEditorColor(color) {
  return typeof color === 'string' && HEX.test(color) ? color.toLowerCase() : null
}

// Etiquetas: minúsculas, sin "#" inicial, espacios colapsados, sin duplicados,
// máx. 10 de 30 caracteres. Cualquier otra cosa se descarta en silencio.
export function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return []
  const out = []
  for (const raw of tags) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_TAG_LENGTH).trim()
    if (tag && !out.includes(tag)) out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

// Título provisional mientras no hay vista previa: el dominio sin "www.".
// Si al terminar la descarga el título sigue siendo este, es que nadie lo ha
// tocado y se puede sustituir por el real de la página.
export function placeholderTitle(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 60)
  }
}

function parseTags(json) {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Forma que espera el cliente (ver client/src/types.ts Bookmark / contract.test.js).
const toClient = row => ({
  id: row.id,
  room: row.room,
  url: row.url,
  title: row.title,
  description: row.description,
  image: row.image,
  site_name: row.site_name,
  tags: parseTags(row.tags),
  favorite: Boolean(row.favorite),
  seen: Boolean(row.seen),
  preview_status: row.preview_status,
  added_by_name: row.added_by_name,
  added_by_color: row.added_by_color,
  created_at: row.created_at,
  updated_at: row.updated_at,
})

const getRow = id => db.prepare('SELECT * FROM bookmark WHERE id = ?').get(id)

export function getBookmarks(room) {
  return db.prepare('SELECT * FROM bookmark WHERE room = ? ORDER BY created_at DESC').all(room).map(toClient)
}

export function getBookmark(id) {
  const row = getRow(id)
  return row ? toClient(row) : null
}

export function createBookmark(room, url, editorName, editorColor) {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO bookmark (id, room, url, title, description, image, site_name, tags, favorite, seen, preview_status, added_by_name, added_by_color, created_at, updated_at)
    VALUES (?, ?, ?, ?, '', NULL, NULL, '[]', 0, 0, 'pending', ?, ?, ?, ?)
  `).run(id, room, url, placeholderTitle(url), sanitizeEditorName(editorName), sanitizeEditorColor(editorColor), now, now)
  return toClient(getRow(id))
}

// Edición parcial (last-write-wins): solo toca los campos presentes en `patch`.
// Título vacío → vuelve al provisional (dominio) en vez de dejar una tarjeta
// sin título.
export function updateBookmark(id, patch) {
  const current = getRow(id)
  if (!current) return null
  const sets = []
  const values = []
  if (typeof patch.title === 'string') {
    sets.push('title = ?')
    values.push(patch.title.trim() || placeholderTitle(current.url))
  }
  if (typeof patch.description === 'string') {
    sets.push('description = ?')
    values.push(patch.description.trim())
  }
  if (patch.tags !== undefined) {
    sets.push('tags = ?')
    values.push(JSON.stringify(sanitizeTags(patch.tags)))
  }
  if (patch.favorite !== undefined) {
    sets.push('favorite = ?')
    values.push(patch.favorite ? 1 : 0)
  }
  if (patch.seen !== undefined) {
    sets.push('seen = ?')
    values.push(patch.seen ? 1 : 0)
  }
  if (sets.length === 0) return toClient(current)
  sets.push('updated_at = ?')
  values.push(new Date().toISOString())
  db.prepare(`UPDATE bookmark SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
  return toClient(getRow(id))
}

export function setPreviewPending(id) {
  db.prepare("UPDATE bookmark SET preview_status = 'pending', updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id)
  return getBookmark(id)
}

// Aplica el resultado de la descarga de la vista previa. `preview` = null →
// falló (red, bloqueado, no responde…). Lo que el usuario ya haya escrito a
// mano manda: el título solo se sustituye si sigue siendo el provisional, y la
// descripción solo si está vacía. La fila pudo borrarse mientras tanto → null.
export function applyPreview(id, preview) {
  const current = getRow(id)
  if (!current) return null
  const now = new Date().toISOString()
  if (!preview) {
    db.prepare("UPDATE bookmark SET preview_status = 'failed', updated_at = ? WHERE id = ?").run(now, id)
    return toClient(getRow(id))
  }
  const title = preview.title && current.title === placeholderTitle(current.url) ? preview.title : current.title
  const description = current.description || preview.description || ''
  db.prepare(`
    UPDATE bookmark SET title = ?, description = ?, image = ?, site_name = ?, preview_status = 'done', updated_at = ?
    WHERE id = ?
  `).run(title, description, preview.image ?? current.image, preview.siteName ?? current.site_name, now, id)
  return toClient(getRow(id))
}

// Al arrancar: una vista previa 'pending' que quedó a medias por un reinicio
// no va a terminar nunca; se marca como fallida para que el usuario pueda
// reintentarla en vez de ver una tarjeta cargando para siempre.
export function failStalePreviews() {
  db.prepare("UPDATE bookmark SET preview_status = 'failed' WHERE preview_status = 'pending'").run()
}

export function deleteBookmark(id) {
  const row = getRow(id)
  db.prepare('DELETE FROM bookmark WHERE id = ?').run(id)
  return row
}

export function restoreBookmark(row) {
  db.prepare(`
    INSERT OR IGNORE INTO bookmark (id, room, url, title, description, image, site_name, tags, favorite, seen, preview_status, added_by_name, added_by_color, created_at, updated_at)
    VALUES (@id, @room, @url, @title, @description, @image, @site_name, @tags, @favorite, @seen, @preview_status, @added_by_name, @added_by_color, @created_at, @updated_at)
  `).run({ ...row, preview_status: row.preview_status === 'pending' ? 'failed' : row.preview_status })
  return toClient(getRow(row.id))
}
