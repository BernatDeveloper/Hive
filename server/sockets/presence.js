// Presencia con identidad (Fase 9) + miembros de la sala.
// - En vivo (memoria): room -> Map<socketId, { name, color, deviceId }>. Se
//   reconstruye con cada join, no sobrevive a un reinicio.
// - Persistido (tabla room_member): cada dispositivo que ha entrado alguna
//   vez, para poder listar también a quien no está conectado.
// `presence` difunde la lista completa: conectados primero, luego el resto.

import { upsertRoomMember, touchRoomMember, getRoomMembers } from '../db/index.js'
import { isAuthedFor } from './helpers.js'
import { safeOn } from './handler.js'
import { str, isObject, MAX } from './validate.js'

const presenceByRoom = new Map()

const HEX = /^#[0-9a-fA-F]{6}$/
// Id aleatorio por dispositivo (client: getDeviceId). Opcional: un cliente
// sin él sigue teniendo presencia en vivo, solo que no queda como miembro.
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/
const MAX_NAME = 40
const DEFAULT_NAME = 'Invitado'
const DEFAULT_COLOR = '#0071e3'

// Identidad informativa y spoofeable (ver docs/historial/MEJORAS-2.md, Fase 9): sin
// registro, así que cualquier valor ausente o con forma inválida cae a un
// valor por defecto en vez de rechazar el join.
function sanitizeIdentity(name, color) {
  const safeName = typeof name === 'string' && name.trim().length > 0
    ? name.trim().slice(0, MAX_NAME)
    : DEFAULT_NAME
  const safeColor = typeof color === 'string' && HEX.test(color) ? color.toLowerCase() : DEFAULT_COLOR
  return { name: safeName, color: safeColor }
}

export function setPresence(room, socketId, name, color, deviceId) {
  const identity = sanitizeIdentity(name, color)
  const safeDeviceId = typeof deviceId === 'string' && DEVICE_ID.test(deviceId) ? deviceId : null
  if (!presenceByRoom.has(room)) presenceByRoom.set(room, new Map())
  presenceByRoom.get(room).set(socketId, { ...identity, deviceId: safeDeviceId })
  if (safeDeviceId) upsertRoomMember(room, safeDeviceId, identity.name, identity.color)
}

function removePresence(room, socketId) {
  const people = presenceByRoom.get(room)
  if (!people) return null
  const entry = people.get(socketId) ?? null
  people.delete(socketId)
  if (people.size === 0) presenceByRoom.delete(room)
  return entry
}

// Lista para `presence`: un dispositivo cuenta una vez aunque tenga varias
// pestañas; los sockets sin deviceId cuentan uno a uno (como antes). Pura,
// sin DB — exportada para testearla aislada.
export function buildPeople(sockets, members) {
  const online = []
  const onlineDevices = new Set()
  for (const s of sockets) {
    if (s.deviceId) {
      if (onlineDevices.has(s.deviceId)) continue
      onlineDevices.add(s.deviceId)
    }
    online.push({ name: s.name, color: s.color, online: true, last_seen_at: null })
  }
  online.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  const offline = members
    .filter(m => !onlineDevices.has(m.device_id))
    .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))
    .map(m => ({ name: m.name, color: m.color, online: false, last_seen_at: m.last_seen_at }))
  return [...online, ...offline]
}

function peopleOf(room) {
  return buildPeople([...(presenceByRoom.get(room)?.values() ?? [])], getRoomMembers(room))
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
      const entry = removePresence(room, socket.id)
      const stillHere = entry?.deviceId &&
        [...(presenceByRoom.get(room)?.values() ?? [])].some(p => p.deviceId === entry.deviceId)
      if (entry?.deviceId && !stillHere) touchRoomMember(room, entry.deviceId)
      emitPresence(io, room)
    }
  })

  // Refresco en vivo (docs/historial/MEJORAS-3.md): al renombrarse en Ajustes, actualiza la
  // entrada de presencia de este socket (y su fila de miembro, si tiene
  // deviceId) y la redifunde. La clave de sala aquí es `name`, no `room` —
  // mismo caso que update-room-style/-timezone.
  safeOn(socket, 'update-identity', 'room-error', 'No se pudo actualizar la identidad', ({ name, identity }) => {
    if (!str(name, MAX.roomName) || !isAuthedFor(socket, name)) return
    if (!isObject(identity)) return
    const deviceId = presenceByRoom.get(name)?.get(socket.id)?.deviceId
    setPresence(name, socket.id, identity.name, identity.color, deviceId)
    emitPresence(io, name)
  })
}
