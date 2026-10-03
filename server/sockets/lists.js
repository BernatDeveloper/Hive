import {
  createList, updateListTitle, deleteList, cloneList,
  createListItem, toggleListItem, updateListItemText, clearCompletedItems, deleteListItem,
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

  safeAuthedOn(socket, 'update-list', 'list-error', { message: 'No se pudo renombrar la lista' }, ({ room, id, title }) => {
    if (!str(id, MAX.id)) return
    const safeTitle = typeof title === 'string' ? title.trim() : ''
    if (!safeTitle || safeTitle.length > MAX.listTitle) return
    const list = updateListTitle(id, safeTitle)
    if (!list) return
    broadcast(io, room, 'list-updated', list)
  })

  safeAuthedOn(socket, 'delete-list', 'list-error', { message: 'No se pudo eliminar la lista' }, ({ room, id }, ack) => {
    if (!str(id, MAX.id)) return
    const { list, items } = deleteList(id)
    if (!list) return
    broadcast(io, room, 'list-deleted', id)
    ack?.({ undoToken: stash(room, { kind: 'list', list, items }), label: `Lista «${list.title}»` })
  })

  // Duplica una lista con sus ítems (sin marcar) — plantilla rápida.
  safeAuthedOn(socket, 'clone-list', 'list-error', { message: 'No se pudo clonar la lista' }, ({ room, id }) => {
    if (!str(id, MAX.id)) return
    const result = cloneList(id)
    if (!result) return
    broadcast(io, room, 'list-cloned', result)
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

  safeAuthedOn(socket, 'update-list-item', 'list-error', { message: 'No se pudo actualizar el ítem' }, ({ room, id, text }) => {
    if (!str(id, MAX.id)) return
    const safeText = typeof text === 'string' ? text.trim() : ''
    if (!safeText || safeText.length > MAX.listItemText) return
    const item = updateListItemText(id, safeText)
    broadcast(io, room, 'list-item-updated', item)
  })

  safeAuthedOn(socket, 'delete-list-item', 'list-error', { message: 'No se pudo eliminar el ítem' }, ({ room, id }, ack) => {
    if (!str(id, MAX.id)) return
    const item = deleteListItem(id)
    if (!item) return
    broadcast(io, room, 'list-item-deleted', id)
    ack?.({ undoToken: stash(room, { kind: 'list-item', item }), label: `«${item.text}»` })
  })

  // "Vaciar completados": borra de golpe todos los ítems ya marcados de una
  // lista. Deshacer restaura el lote entero con un único token (igual patrón
  // que el borrado de una lista completa).
  safeAuthedOn(socket, 'clear-completed-items', 'list-error', { message: 'No se pudieron vaciar los completados' }, ({ room, listId }, ack) => {
    if (!str(listId, MAX.id)) return
    const items = clearCompletedItems(listId)
    if (items.length === 0) return ack?.({})
    broadcast(io, room, 'list-items-deleted', { ids: items.map(i => i.id) })
    ack?.({
      undoToken: stash(room, { kind: 'list-items', items }),
      label: `${items.length} completado${items.length === 1 ? '' : 's'}`,
    })
  })
}
