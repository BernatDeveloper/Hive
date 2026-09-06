import {
  createRoom, verifyRoomAccess, updateRoomStyle,
  getEvents, getLists, getListItems, getNotes,
} from '../db/index.js'
import { isNonEmptyString, isAuthedFor, markAuthed, broadcast } from './helpers.js'
import { safeOn } from './handler.js'

export function registerRoomHandlers(io, socket) {
  safeOn(socket, 'create-room', 'room-error', 'No se pudo crear la sala', ({ name, password }) => {
    if (!isNonEmptyString(name) || !isNonEmptyString(password)) return
    const result = createRoom(name, password)
    if (!result.ok) {
      socket.emit('room-error', result.error)
      return
    }
    markAuthed(socket, name)
    socket.emit('room-created', { name })
  })

  safeOn(socket, 'join-room', 'access-denied', 'No se pudo acceder a la sala', ({ name, password }) => {
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
  })

  safeOn(socket, 'update-room-style', 'room-error', 'No se pudo actualizar el estilo de la sala', ({ name, styles }) => {
    if (!isNonEmptyString(name)) return
    if (!isAuthedFor(socket, name)) return
    if (typeof styles !== 'object' || styles === null) return
    const updatedRoom = updateRoomStyle(name, styles)
    broadcast(io, name, 'style-updated', updatedRoom)
  })
}
