import {
  createList, updateListTitle, deleteList, cloneList, touchList, getListAttribution, countItemsInList,
  createListItem, toggleListItem, updateListItemText, clearCompletedItems, deleteListItem,
} from '../db/index.js'
import { stash } from '../services/undo.js'
import { broadcast } from './helpers.js'
import { safeAuthedOn } from './handler.js'
import { MAX, str } from './validate.js'
import { withinQuota } from './quota.js'

export function registerListHandlers(io, socket) {
  // Marca la lista como modificada por quien hizo el cambio y lo difunde
  // (`list-updated` con la lista ya con su atribución). Va DESPUÉS del evento
  // del propio cambio. La identidad (editor_name/editor_color) es informativa y
  // spoofeable, como en el resto de módulos.
  function markModified(room, listId, payload) {
    const list = touchList(room, listId, { name: payload.editor_name, color: payload.editor_color })
    if (list) broadcast(io, room, 'list-updated', list)
  }

  safeAuthedOn(socket, 'create-list', 'list-error', { message: 'No se pudo crear la lista' }, ({ room, title, editor_name, editor_color }) => {
    const safeTitle = typeof title === 'string' ? title.trim() : ''
    if (!safeTitle || safeTitle.length > MAX.listTitle) return
    if (!withinQuota(socket, 'list-error', 'list', room)) return
    const list = createList(room, safeTitle, { name: editor_name, color: editor_color })
    broadcast(io, room, 'list-created', list)
  })

  safeAuthedOn(socket, 'update-list', 'list-error', { message: 'No se pudo renombrar la lista' }, ({ room, id, title, editor_name, editor_color }) => {
    if (!str(id, MAX.id)) return
    const safeTitle = typeof title === 'string' ? title.trim() : ''
    if (!safeTitle || safeTitle.length > MAX.listTitle) return
    const list = updateListTitle(id, safeTitle, { name: editor_name, color: editor_color })
    if (!list || list.room !== room) return
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
  safeAuthedOn(socket, 'clone-list', 'list-error', { message: 'No se pudo clonar la lista' }, ({ room, id, editor_name, editor_color }) => {
    if (!str(id, MAX.id)) return
    if (!withinQuota(socket, 'list-error', 'list', room)) return
    if (!withinQuota(socket, 'list-error', 'list_item', room, countItemsInList(id))) return
    const result = cloneList(id, { name: editor_name, color: editor_color })
    if (!result) return
    broadcast(io, room, 'list-cloned', result)
  })

  safeAuthedOn(socket, 'create-list-item', 'list-error', { message: 'No se pudo añadir el ítem' }, (payload) => {
    const { room, listId, text } = payload
    if (!str(listId, MAX.id)) return
    const safeText = typeof text === 'string' ? text.trim() : ''
    if (!safeText || safeText.length > MAX.listItemText) return
    if (!withinQuota(socket, 'list-error', 'list_item', room)) return
    const item = createListItem(listId, room, safeText)
    broadcast(io, room, 'list-item-created', item)
    markModified(room, listId, payload)
  })

  safeAuthedOn(socket, 'toggle-list-item', 'list-error', { message: 'No se pudo actualizar el ítem' }, (payload) => {
    const { room, id, checked } = payload
    if (!str(id, MAX.id)) return
    const item = toggleListItem(id, Boolean(checked))
    if (!item) return
    broadcast(io, room, 'list-item-updated', item)
    markModified(room, item.list_id, payload)
  })

  safeAuthedOn(socket, 'update-list-item', 'list-error', { message: 'No se pudo actualizar el ítem' }, (payload) => {
    const { room, id, text } = payload
    if (!str(id, MAX.id)) return
    const safeText = typeof text === 'string' ? text.trim() : ''
    if (!safeText || safeText.length > MAX.listItemText) return
    const item = updateListItemText(id, safeText)
    if (!item) return
    broadcast(io, room, 'list-item-updated', item)
    markModified(room, item.list_id, payload)
  })

  safeAuthedOn(socket, 'delete-list-item', 'list-error', { message: 'No se pudo eliminar el ítem' }, (payload, ack) => {
    const { room, id } = payload
    if (!str(id, MAX.id)) return
    // La atribución de ANTES del borrado se guarda en el tombstone: al
    // deshacer, la lista vuelve a figurar como la dejó quien la tocó antes.
    const existing = deleteListItem(id)
    if (!existing) return
    const listPrev = getListAttribution(room, existing.list_id)
    broadcast(io, room, 'list-item-deleted', id)
    markModified(room, existing.list_id, payload)
    ack?.({ undoToken: stash(room, { kind: 'list-item', item: existing, listPrev }), label: `«${existing.text}»` })
  })

  // "Vaciar completados": borra de golpe todos los ítems ya marcados de una
  // lista. Deshacer restaura el lote entero con un único token (igual patrón
  // que el borrado de una lista completa).
  safeAuthedOn(socket, 'clear-completed-items', 'list-error', { message: 'No se pudieron vaciar los completados' }, (payload, ack) => {
    const { room, listId } = payload
    if (!str(listId, MAX.id)) return
    const listPrev = getListAttribution(room, listId)
    const items = clearCompletedItems(listId)
    if (items.length === 0) return ack?.({})
    broadcast(io, room, 'list-items-deleted', { ids: items.map(i => i.id) })
    markModified(room, listId, payload)
    ack?.({
      undoToken: stash(room, { kind: 'list-items', items, listId, listPrev }),
      label: `${items.length} completado${items.length === 1 ? '' : 's'}`,
    })
  })
}
