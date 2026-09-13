// Presencia con identidad (Fase 9): quién está en cada sala, no solo cuántos.
// room -> Map<socketId, { name, color }>. En memoria — se reconstruye con
// cada join, no sobrevive a un reinicio (igual que antes con el conteo).

import { isAuthedFor } from './helpers.js'
import { safeOn } from './handler.js'
import { str, isObject, MAX } from './validate.js'

const presenceByRoom = new Map()

const HEX = /^#[0-9a-fA-F]{6}$/
const MAX_NAME = 40
const DEFAULT_NAME = 'Invitado'
const DEFAULT_COLOR = '#0071e3'

// Identidad informativa y spoofeable (ver MEJORAS-2.md Fase 9): sin
// registro, así que cualquier valor ausente o con forma inválida cae a un
// valor por defecto en vez de rechazar el join.
function sanitizeIdentity(name, color) {
  const safeName = typeof name === 'string' && name.trim().length > 0
    ? name.trim().slice(0, MAX_NAME)
    : DEFAULT_NAME
  const safeColor = typeof color === 'string' && HEX.test(color) ? color.toLowerCase() : DEFAULT_COLOR
  return { name: safeName, color: safeColor }
}

export function setPresence(room, socketId, name, color) {
  if (!presenceByRoom.has(room)) presenceByRoom.set(room, new Map())
  presenceByRoom.get(room).set(socketId, sanitizeIdentity(name, color))
}

function peopleOf(room) {
  return [...(presenceByRoom.get(room)?.values() ?? [])]
}

function removePresence(room, socketId) {
  const people = presenceByRoom.get(room)
  if (!people) return
  people.delete(socketId)
  if (people.size === 0) presenceByRoom.delete(room)
}

export function emitPresence(io, room) {
  io.to(room).emit('presence', { people: peopleOf(room) })
}

export function registerPresenceHandlers(io, socket) {
  // El cliente lo pide al montar el Dashboard: el `presence` que el servidor
  // difunde justo tras `access-granted` puede llegar antes de que su listener
  // esté listo.
  socket.on('get-presence', () => {
    for (const room of socket.data.authedRooms ?? []) {
      socket.emit('presence', { people: peopleOf(room) })
    }
  })

  // `disconnecting` se dispara con el socket aún dentro de sus rooms.
  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room === socket.id) continue
      removePresence(room, socket.id)
      emitPresence(io, room)
    }
  })

  // Refresco en vivo (MEJORAS-3): al renombrarse en Ajustes, actualiza la
  // entrada de presencia de este socket y la redifunde. No persiste nada —
  // la identidad "de verdad" vive en localStorage del cliente. La clave de
  // sala aquí es `name`, no `room` — mismo caso que update-room-style/-timezone.
  safeOn(socket, 'update-identity', 'room-error', 'No se pudo actualizar la identidad', ({ name, identity }) => {
    if (!str(name, MAX.roomName) || !isAuthedFor(socket, name)) return
    if (!isObject(identity)) return
    setPresence(name, socket.id, identity.name, identity.color)
    emitPresence(io, name)
  })
}
