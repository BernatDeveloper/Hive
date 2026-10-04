import { randomUUID } from 'node:crypto'
import { db } from './connection.js'

import { sanitizeEditorName, sanitizeEditorColor } from './editor.js'

const MAX_TAGS = 10
const MAX_TAG_LENGTH = 30

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
  last_editor_name: row.last_editor_name ?? null,
  last_editor_color: row.last_editor_color ?? null,
  edited_at: row.edited_at ?? null,
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
//
// Atribución: si cambia el CONTENIDO (título, descripción o etiquetas) se
// guarda quién lo editó y cuándo (`editor` = { name, color }, identidad de
// dispositivo: informativa y spoofeable). Marcar favorito/visto no cuenta como
// editar — si no, cada clic en la estrella taparía quién tocó el contenido de
// verdad — y tampoco un "guardado" que deja todo igual.
export function updateBookmark(id, patch, editor = {}) {
  const current = getRow(id)
  if (!current) return null
  const sets = []
  const values = []
  const now = new Date().toISOString()
  const nextTitle = typeof patch.title === 'string' ? (patch.title.trim() || placeholderTitle(current.url)) : current.title
  const nextDescription = typeof patch.description === 'string' ? patch.description.trim() : current.description
  const nextTags = patch.tags !== undefined ? JSON.stringify(sanitizeTags(patch.tags)) : JSON.stringify(parseTags(current.tags))
  const contentChanged = nextTitle !== current.title
    || nextDescription !== current.description
    || nextTags !== JSON.stringify(parseTags(current.tags))
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
  values.push(now)
  if (contentChanged) {
    sets.push('last_editor_name = ?', 'last_editor_color = ?', 'edited_at = ?')
    values.push(sanitizeEditorName(editor.name), sanitizeEditorColor(editor.color), now)
  }
  db.prepare(`UPDATE bookmark SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
  return toClient(getRow(id))
}

// Aplica `transform(tags)` a las etiquetas de TODOS los marcadores de la sala
// (devuelve el nuevo array, o null si ese marcador no cambia). Una sola
// transacción. Devuelve los marcadores que cambiaron y sus etiquetas
// anteriores (para poder deshacer).
function changeTagsInRoom(room, transform, editor = {}) {
  const changed = []
  const previous = []
  db.transaction(() => {
    const rows = db.prepare('SELECT id, tags, last_editor_name, last_editor_color, edited_at FROM bookmark WHERE room = ?').all(room)
    const update = db.prepare('UPDATE bookmark SET tags = ?, updated_at = ?, last_editor_name = ?, last_editor_color = ?, edited_at = ? WHERE id = ?')
    const now = new Date().toISOString()
    const editorName = sanitizeEditorName(editor.name)
    const editorColor = sanitizeEditorColor(editor.color)
    for (const row of rows) {
      const before = parseTags(row.tags)
      const after = transform(before)
      if (!after || (after.length === before.length && after.every((t, i) => t === before[i]))) continue
      update.run(JSON.stringify(after), now, editorName, editorColor, now, row.id)
      // Lo anterior (etiquetas Y atribución) para poder deshacer.
      previous.push({ id: row.id, tags: before, last_editor_name: row.last_editor_name, last_editor_color: row.last_editor_color, edited_at: row.edited_at })
      changed.push(row.id)
    }
  })()
  return { bookmarks: changed.map(id => toClient(getRow(id))), previous }
}

// Renombra una etiqueta en toda la sala. Si `to` ya existe en un marcador, se
// unen (sin duplicar). Ambas se sanean igual que al guardar.
export function renameTag(room, from, to, editor = {}) {
  const f = sanitizeTags([from])[0]
  const t = sanitizeTags([to])[0]
  if (!f || !t || f === t) return { bookmarks: [], previous: [] }
  return changeTagsInRoom(room, tags =>
    tags.includes(f) ? [...new Set(tags.map(x => (x === f ? t : x)))] : null, editor)
}

// Quita una etiqueta de todos los marcadores de la sala. `tag` en el
// resultado es la forma saneada (para el texto de "deshacer").
export function deleteTag(room, tag, editor = {}) {
  const t = sanitizeTags([tag])[0]
  if (!t) return { bookmarks: [], previous: [], tag: null }
  return { ...changeTagsInRoom(room, tags => (tags.includes(t) ? tags.filter(x => x !== t) : null), editor), tag: t }
}

// Deshacer: devuelve a cada marcador las etiquetas que tenía. Si alguno se
// borró entretanto, se salta.
export function restoreBookmarkTags(previous) {
  const restored = []
  db.transaction(() => {
    const update = db.prepare('UPDATE bookmark SET tags = ?, updated_at = ?, last_editor_name = ?, last_editor_color = ?, edited_at = ? WHERE id = ?')
    const now = new Date().toISOString()
    for (const { id, tags, last_editor_name, last_editor_color, edited_at } of previous) {
      const changes = update.run(JSON.stringify(sanitizeTags(tags)), now, last_editor_name ?? null, last_editor_color ?? null, edited_at ?? null, id).changes
      if (changes > 0) restored.push(id)
    }
  })()
  return restored.map(id => toClient(getRow(id)))
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
    INSERT OR IGNORE INTO bookmark (id, room, url, title, description, image, site_name, tags, favorite, seen, preview_status, added_by_name, added_by_color, created_at, updated_at, last_editor_name, last_editor_color, edited_at)
    VALUES (@id, @room, @url, @title, @description, @image, @site_name, @tags, @favorite, @seen, @preview_status, @added_by_name, @added_by_color, @created_at, @updated_at, @last_editor_name, @last_editor_color, @edited_at)
  `).run({ ...row, preview_status: row.preview_status === 'pending' ? 'failed' : row.preview_status })
  return toClient(getRow(row.id))
}
