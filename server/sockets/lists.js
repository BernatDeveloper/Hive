import {
  createList, deleteList,
  createListItem, toggleListItem, deleteListItem,
} from '../db/index.js'
import { isNonEmptyString, isAuthedFor, broadcast } from './helpers.js'

export function registerListHandlers(io, socket) {
  socket.on('create-list', ({ room, title } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      const safeTitle = typeof title === 'string' ? title.trim() : ''
      if (!safeTitle) return
      const list = createList(room, safeTitle)
      broadcast(io, room, 'list-created', list)
    } catch (e) {
      console.error('[create-list]', e)
      socket.emit('list-error', { message: 'No se pudo crear la lista' })
    }
  })

  socket.on('delete-list', ({ room, id } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
      if (!isAuthedFor(socket, room)) return
      deleteList(id)
      broadcast(io, room, 'list-deleted', id)
    } catch (e) {
      console.error('[delete-list]', e)
      socket.emit('list-error', { message: 'No se pudo eliminar la lista' })
    }
  })

  socket.on('create-list-item', ({ room, listId, text } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(listId)) return
      if (!isAuthedFor(socket, room)) return
      const safeText = typeof text === 'string' ? text.trim() : ''
      if (!safeText) return
      const item = createListItem(listId, room, safeText)
      broadcast(io, room, 'list-item-created', item)
    } catch (e) {
      console.error('[create-list-item]', e)
      socket.emit('list-error', { message: 'No se pudo añadir el ítem' })
    }
  })

  socket.on('toggle-list-item', ({ room, id, checked } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
      if (!isAuthedFor(socket, room)) return
      const item = toggleListItem(id, Boolean(checked))
      broadcast(io, room, 'list-item-updated', item)
    } catch (e) {
      console.error('[toggle-list-item]', e)
      socket.emit('list-error', { message: 'No se pudo actualizar el ítem' })
    }
  })

  socket.on('delete-list-item', ({ room, id } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
      if (!isAuthedFor(socket, room)) return
      deleteListItem(id)
      broadcast(io, room, 'list-item-deleted', id)
    } catch (e) {
      console.error('[delete-list-item]', e)
      socket.emit('list-error', { message: 'No se pudo eliminar el ítem' })
    }
  })
}
