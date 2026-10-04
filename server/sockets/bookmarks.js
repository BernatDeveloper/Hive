import {
  createBookmark, updateBookmark, getBookmark, setPreviewPending, applyPreview, deleteBookmark,
} from '../db/index.js'
import { fetchLinkPreview, parseHttpUrl } from '../services/linkPreview.js'
import { stash } from '../services/undo.js'
import { logger } from '../lib/logger.js'
import { createRateLimiter } from '../lib/rateLimit.js'
import { broadcast } from './helpers.js'
import { safeAuthedOn } from './handler.js'
import { MAX, str } from './validate.js'

// Cada alta o reintento hace que el servidor descargue una página ajena:
// limitamos tanto cuántas descargas corren a la vez como cuántas puede pedir
// un mismo socket por minuto.
const MAX_CONCURRENT_PREVIEWS = 4
const checkRate = createRateLimiter({ windowMs: 60_000, max: 30 })
let running = 0
const waiting = []

async function withPreviewSlot(task) {
  if (running >= MAX_CONCURRENT_PREVIEWS) await new Promise(resolve => waiting.push(resolve))
  running++
  try {
    return await task()
  } finally {
    running--
    waiting.shift()?.()
  }
}

// Descarga la vista previa en segundo plano y difunde la tarjeta ya completa
// (o marcada como fallida). Nunca lanza: si algo va mal, la tarjeta queda con
// el dominio como título y un botón de reintentar.
async function loadPreview(io, room, bookmark) {
  let preview = null
  try {
    preview = await withPreviewSlot(() => fetchLinkPreview(bookmark.url))
  } catch (err) {
    logger.debug(`bookmark preview ${bookmark.url}: ${err.message}`)
  }
  const updated = applyPreview(bookmark.id, preview)
  if (updated) broadcast(io, room, 'bookmark-updated', updated)
}

// Normaliza igual que el cliente (client/src/features/bookmarks/bookmarkUtils.ts): sin esquema se asume https.
function normalizeUrl(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > MAX.bookmarkUrl) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = parseHttpUrl(withScheme)
  // Un host sin punto ("hola", "localhost") no es un enlace que se guarde.
  if (!url || (!url.hostname.includes('.') && !url.hostname.includes(':'))) return null
  return url.href.length <= MAX.bookmarkUrl ? url.href : null
}

export function registerBookmarkHandlers(io, socket) {
  safeAuthedOn(socket, 'create-bookmark', 'bookmark-error', { message: 'No se pudo guardar el enlace' }, ({ room, url, editor_name, editor_color }) => {
    const href = normalizeUrl(url)
    if (!href) return socket.emit('bookmark-error', { message: 'Ese enlace no parece válido' })
    if (!checkRate(socket.id).allowed) {
      return socket.emit('bookmark-error', { message: 'Demasiados enlaces seguidos, espera un momento' })
    }
    const bookmark = createBookmark(room, href, editor_name, editor_color)
    broadcast(io, room, 'bookmark-created', bookmark)
    void loadPreview(io, room, bookmark)
  })

  // Edición parcial (título, nota, etiquetas, favorito, visto): solo se tocan
  // los campos que vienen. Sin control de versión (last-write-wins).
  safeAuthedOn(socket, 'update-bookmark', 'bookmark-error', { message: 'No se pudo actualizar el marcador' }, ({ room, id, ...fields }) => {
    if (!str(id, MAX.id)) return
    const patch = {}
    if (typeof fields.title === 'string') patch.title = fields.title.slice(0, MAX.bookmarkTitle)
    if (typeof fields.description === 'string') patch.description = fields.description.slice(0, MAX.bookmarkDescription)
    if (Array.isArray(fields.tags)) patch.tags = fields.tags.slice(0, 50)
    if (typeof fields.favorite === 'boolean') patch.favorite = fields.favorite
    if (typeof fields.seen === 'boolean') patch.seen = fields.seen
    const current = getBookmark(id)
    if (!current || current.room !== room) return
    const updated = updateBookmark(id, patch)
    if (updated) broadcast(io, room, 'bookmark-updated', updated)
  })

  // Reintenta la vista previa de una tarjeta que falló (o que se quiere
  // refrescar). Lo que el usuario escribió a mano no se pisa (ver applyPreview).
  safeAuthedOn(socket, 'refresh-bookmark', 'bookmark-error', { message: 'No se pudo recargar la vista previa' }, ({ room, id }) => {
    if (!str(id, MAX.id)) return
    const current = getBookmark(id)
    if (!current || current.room !== room || current.preview_status === 'pending') return
    if (!checkRate(socket.id).allowed) {
      return socket.emit('bookmark-error', { message: 'Demasiados intentos seguidos, espera un momento' })
    }
    const pending = setPreviewPending(id)
    broadcast(io, room, 'bookmark-updated', pending)
    void loadPreview(io, room, pending)
  })

  safeAuthedOn(socket, 'delete-bookmark', 'bookmark-error', { message: 'No se pudo eliminar el marcador' }, ({ room, id }, ack) => {
    if (!str(id, MAX.id)) return
    const current = getBookmark(id)
    if (!current || current.room !== room) return
    const row = deleteBookmark(id)
    if (!row) return
    broadcast(io, room, 'bookmark-deleted', id)
    ack?.({ undoToken: stash(room, { kind: 'bookmark', bookmark: row }), label: `Marcador «${row.title}»` })
  })
}
