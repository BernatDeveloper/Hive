import {
  createList, deleteList,
  createListItem, toggleListItem, deleteListItem,
} from '../db/index.js'
import { isNonEmptyString, isAuthedFor, broadcast } from './helpers.js'
import { safeOn } from './handler.js'

export function registerListHandlers(io, socket) {
  safeOn(socket, 'create-list', 'list-error', { message: 'No se pudo crear la lista' }, ({ room, title }) => {
    if (!isNonEmptyString(room)) return
    if (!isAuthedFor(socket, room)) return
    const safeTitle = typeof title === 'string' ? title.trim() : ''
    if (!safeTitle) return
    const list = createList(room, safeTitle)
    broadcast(io, room, 'list-created', list)
  })

  safeOn(socket, 'delete-list', 'list-error', { message: 'No se pudo eliminar la lista' }, ({ room, id }) => {
    if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
    if (!isAuthedFor(socket, room)) return
    deleteList(id)
    broadcast(io, room, 'list-deleted', id)
  })

  safeOn(socket, 'create-list-item', 'list-error', { message: 'No se pudo añadir el ítem' }, ({ room, listId, text }) => {
    if (!isNonEmptyString(room) || !isNonEmptyString(listId)) return
    if (!isAuthedFor(socket, room)) return
    const safeText = typeof text === 'string' ? text.trim() : ''
    if (!safeText) return
    const item = createListItem(listId, room, safeText)
    broadcast(io, room, 'list-item-created', item)
  })

  safeOn(socket, 'toggle-list-item', 'list-error', { message: 'No se pudo actualizar el ítem' }, ({ room, id, checked }) => {
    if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
    if (!isAuthedFor(socket, room)) return
    const item = toggleListItem(id, Boolean(checked))
    broadcast(io, room, 'list-item-updated', item)
  })

  safeOn(socket, 'delete-list-item', 'list-error', { message: 'No se pudo eliminar el ítem' }, ({ room, id }) => {
    if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
    if (!isAuthedFor(socket, room)) return
    deleteListItem(id)
    broadcast(io, room, 'list-item-deleted', id)
  })
}
