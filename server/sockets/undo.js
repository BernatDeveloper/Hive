import {
  restoreEvents, restoreList, restoreListItem, restoreNote, restoreBookmark, restoreBookmarkTags, setListAttribution,
} from '../db/index.js'
import { pop } from '../services/undo.js'
import { broadcast } from './helpers.js'
import { safeAuthedOn } from './handler.js'
import { MAX, str } from './validate.js'

const itemForClient = it => ({ ...it, checked: Boolean(it.checked) })

// Al deshacer un borrado de ítems, la lista vuelve a figurar como la dejó
// quien la modificó ANTES (si no, quedaría "modificada" por quien borró).
function restoreListAttribution(io, room, listId, prev) {
  if (!prev) return
  const list = setListAttribution(room, listId, prev)
  if (list) broadcast(io, room, 'list-updated', list)
}

export function registerUndoHandlers(io, socket) {
  safeAuthedOn(socket, 'undo-delete', 'undo-error', { message: 'No se pudo deshacer' }, ({ room, token }, ack) => {
    if (!str(token, MAX.id)) return ack?.({ ok: false })
    const entry = pop(token, room)
    if (!entry) return ack?.({ ok: false, expired: true })

    if (entry.kind === 'events') {
      restoreEvents(entry.rows)
      broadcast(io, room, 'events-created', entry.rows)
    } else if (entry.kind === 'list') {
      broadcast(io, room, 'list-created', restoreList(entry.list, entry.items))
      for (const it of entry.items) broadcast(io, room, 'list-item-created', itemForClient(it))
    } else if (entry.kind === 'list-item') {
      restoreListItem(entry.item)
      broadcast(io, room, 'list-item-created', itemForClient(entry.item))
      restoreListAttribution(io, room, entry.item.list_id, entry.listPrev)
    } else if (entry.kind === 'list-items') {
      for (const it of entry.items) {
        restoreListItem(it)
        broadcast(io, room, 'list-item-created', itemForClient(it))
      }
      restoreListAttribution(io, room, entry.listId, entry.listPrev)
    } else if (entry.kind === 'note') {
      broadcast(io, room, 'note-created', restoreNote(entry.note))
    } else if (entry.kind === 'bookmark') {
      broadcast(io, room, 'bookmark-created', restoreBookmark(entry.bookmark))
    } else if (entry.kind === 'bookmark-tags') {
      broadcast(io, room, 'bookmarks-updated', { bookmarks: restoreBookmarkTags(entry.previous) })
    }

    ack?.({ ok: true })
  })
}
