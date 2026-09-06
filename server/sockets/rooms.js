import {
  createRoom, verifyRoomAccess, updateRoomStyle,
  getEvents, getLists, getListItems, getNotes,
} from '../db/index.js'
import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { createRateLimiter } from '../lib/rateLimit.js'
import { isAuthedFor, markAuthed, broadcast } from './helpers.js'
import { safeOn } from './handler.js'
import { MAX, str, isObject } from './validate.js'

// Fuerza bruta: máx. 10 intentos de auth por IP y minuto.
const authLimiter = createRateLimiter({ windowMs: 60_000, max: 10 })
const RATE_LIMITED = 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'

function clientIp(socket) {
  const xff = socket.handshake.headers['x-forwarded-for']
  if (config.trustProxy && typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim()
  }
  return socket.handshake.address
}

function tooManyAttempts(socket) {
  const { allowed } = authLimiter(clientIp(socket))
  if (!allowed) logger.warn(`rate-limit auth ip=${clientIp(socket)}`)
  return !allowed
}

export function registerRoomHandlers(io, socket) {
  safeOn(socket, 'create-room', 'room-error', 'No se pudo crear la sala', ({ name, password }) => {
    if (tooManyAttempts(socket)) return socket.emit('room-error', RATE_LIMITED)
    if (!str(name, MAX.roomName) || !str(password, MAX.password)) return
    const result = createRoom(name, password)
    if (!result.ok) {
      socket.emit('room-error', result.error)
      return
    }
    markAuthed(socket, name)
    socket.emit('room-created', { name })
  })

  safeOn(socket, 'join-room', 'access-denied', 'No se pudo acceder a la sala', ({ name, password }) => {
    if (tooManyAttempts(socket)) return socket.emit('access-denied', RATE_LIMITED)
    if (!str(name, MAX.roomName) || !str(password, MAX.password)) return
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

  // La clave de sala aquí es `name`, no `room` — no encaja en safeAuthedOn.
  safeOn(socket, 'update-room-style', 'room-error', 'No se pudo actualizar el estilo de la sala', ({ name, styles }) => {
    if (!str(name, MAX.roomName) || !isAuthedFor(socket, name)) return
    if (!isObject(styles)) return
    const updatedRoom = updateRoomStyle(name, styles)
    broadcast(io, name, 'style-updated', updatedRoom)
  })
}
