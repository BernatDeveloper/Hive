import { restoreEvents, restoreList, restoreListItem, restoreNote } from '../db/index.js'
import { pop } from '../services/undo.js'
import { broadcast } from './helpers.js'
import { safeAuthedOn } from './handler.js'
import { MAX, str } from './validate.js'

const itemForClient = it => ({ ...it, checked: Boolean(it.checked) })

export function registerUndoHandlers(io, socket) {
  safeAuthedOn(socket, 'undo-delete', 'undo-error', { message: 'No se pudo deshacer' }, ({ room, token }, ack) => {
    if (!str(token, MAX.id)) return ack?.({ ok: false })
    const entry = pop(token, room)
    if (!entry) return ack?.({ ok: false, expired: true })

    if (entry.kind === 'events') {
      restoreEvents(entry.rows)
      broadcast(io, room, 'events-created', entry.rows)
    } else if (entry.kind === 'list') {
      restoreList(entry.list, entry.items)
      broadcast(io, room, 'list-created', { id: entry.list.id, room: entry.list.room, title: entry.list.title, created_at: entry.list.created_at })
      for (const it of entry.items) broadcast(io, room, 'list-item-created', itemForClient(it))
    } else if (entry.kind === 'list-item') {
      restoreListItem(entry.item)
      broadcast(io, room, 'list-item-created', itemForClient(entry.item))
    } else if (entry.kind === 'list-items') {
      for (const it of entry.items) {
        restoreListItem(it)
        broadcast(io, room, 'list-item-created', itemForClient(it))
      }
    } else if (entry.kind === 'note') {
      restoreNote(entry.note)
      broadcast(io, room, 'note-created', entry.note)
    }

    ack?.({ ok: true })
  })
}
