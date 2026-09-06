import {
  createList, deleteList,
  createListItem, toggleListItem, deleteListItem,
} from '../db/index.js'
import { stash } from '../services/undo.js'
import { broadcast } from './helpers.js'
import { safeAuthedOn } from './handler.js'
import { MAX, str } from './validate.js'

export function registerListHandlers(io, socket) {
  safeAuthedOn(socket, 'create-list', 'list-error', { message: 'No se pudo crear la lista' }, ({ room, title }) => {
    const safeTitle = typeof title === 'string' ? title.trim() : ''
    if (!safeTitle || safeTitle.length > MAX.listTitle) return
    const list = createList(room, safeTitle)
    broadcast(io, room, 'list-created', list)
  })

  safeAuthedOn(socket, 'delete-list', 'list-error', { message: 'No se pudo eliminar la lista' }, ({ room, id }, ack) => {
    if (!str(id, MAX.id)) return
    const { list, items } = deleteList(id)
    if (!list) return
    broadcast(io, room, 'list-deleted', id)
    ack?.({ undoToken: stash(room, { kind: 'list', list, items }), label: `Lista «${list.title}»` })
  })

  safeAuthedOn(socket, 'create-list-item', 'list-error', { message: 'No se pudo añadir el ítem' }, ({ room, listId, text }) => {
    if (!str(listId, MAX.id)) return
    const safeText = typeof text === 'string' ? text.trim() : ''
    if (!safeText || safeText.length > MAX.listItemText) return
    const item = createListItem(listId, room, safeText)
    broadcast(io, room, 'list-item-created', item)
  })

  safeAuthedOn(socket, 'toggle-list-item', 'list-error', { message: 'No se pudo actualizar el ítem' }, ({ room, id, checked }) => {
    if (!str(id, MAX.id)) return
    const item = toggleListItem(id, Boolean(checked))
    broadcast(io, room, 'list-item-updated', item)
  })

  safeAuthedOn(socket, 'delete-list-item', 'list-error', { message: 'No se pudo eliminar el ítem' }, ({ room, id }, ack) => {
    if (!str(id, MAX.id)) return
    const item = deleteListItem(id)
    if (!item) return
    broadcast(io, room, 'list-item-deleted', id)
    ack?.({ undoToken: stash(room, { kind: 'list-item', item }), label: `«${item.text}»` })
  })
}
