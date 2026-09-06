import {
  createRoom, verifyRoomAccess, updateRoomStyle,
  getEvents, getLists, getListItems, getNotes,
} from '../db/index.js'
import { isNonEmptyString, isAuthedFor, markAuthed, broadcast } from './helpers.js'

export function registerRoomHandlers(io, socket) {
  socket.on('create-room', ({ name, password } = {}) => {
    try {
      if (!isNonEmptyString(name) || !isNonEmptyString(password)) return
      const result = createRoom(name, password)
      if (!result.ok) {
        socket.emit('room-error', result.error)
      } else {
        markAuthed(socket, name)
        socket.emit('room-created', { name })
      }
    } catch (e) {
      console.error('[create-room]', e)
      socket.emit('room-error', 'No se pudo crear la sala')
    }
  })

  socket.on('join-room', ({ name, password } = {}) => {
    try {
      if (!isNonEmptyString(name) || !isNonEmptyString(password)) return
      const result = verifyRoomAccess(name, password)
      if (!result.ok) {
        socket.emit('access-denied', result.error)
        return
      }
      markAuthed(socket, name)
      socket.emit('access-granted', {
        room: result.room,
        events: getEvents(name),
        lists: getLists(name),
        listItems: getListItems(name),
        notes: getNotes(name),
      })
    } catch (e) {
      console.error('[join-room]', e)
      socket.emit('access-denied', 'No se pudo acceder a la sala')
    }
  })

  socket.on('update-room-style', ({ name, styles } = {}) => {
    try {
      if (!isNonEmptyString(name)) return
      if (!isAuthedFor(socket, name)) return
      if (typeof styles !== 'object' || styles === null) return
      const updatedRoom = updateRoomStyle(name, styles)
      broadcast(io, name, 'style-updated', updatedRoom)
    } catch (e) {
      console.error('[update-room-style]', e)
      socket.emit('room-error', 'No se pudo actualizar el estilo de la sala')
    }
  })
}
