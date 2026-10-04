import {
  createRoom, verifyRoomAccess, updateRoomStyle, updateRoomTimezone, roomExists, countRooms,
  getEvents, getLists, getListItems, getNotes, getBookmarks,
} from '../db/index.js'
import { logger } from '../lib/logger.js'
import { createRateLimiter } from '../lib/rateLimit.js'
import { createConcurrencyLimiter } from '../lib/concurrency.js'
import { LIMITS } from '../config/limits.js'
import { ipOf } from '../http/ip.js'
import { isAuthedFor, markAuthed, broadcast } from './helpers.js'
import { safeOn } from './handler.js'
import { emitPresence, setPresence } from './presence.js'
import { MAX, MIN_PASSWORD, str, isObject } from './validate.js'

// Fuerza bruta: máx. 10 intentos de auth por IP y minuto.
const authLimiter = createRateLimiter({ windowMs: 60_000, max: 10 })
const RATE_LIMITED = 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'

// Crear salas es raro; un script que las crea en bucle llenaría la base de datos.
const createRoomLimiter = createRateLimiter({ windowMs: 3_600_000, max: LIMITS.createRoomsPerHourPerIp })

// Acota cuántos scrypt corren a la vez (ver lib/concurrency.js).
const hashSlot = createConcurrencyLimiter({
  concurrency: LIMITS.passwordHashConcurrency,
  maxQueue: LIMITS.passwordHashQueue,
})
const BUSY = 'El servidor está muy ocupado. Inténtalo de nuevo en unos segundos.'

const clientIp = socket => ipOf(socket.handshake.headers, socket.handshake.address).ip

function tooManyAttempts(socket) {
  const { allowed } = authLimiter(clientIp(socket))
  if (!allowed) {
    logger.warn(`rate-limit auth ip=${clientIp(socket)}`)
    socket.data.strike?.() // sumar a las faltas de la IP (sanciones en sockets/guard.js)
  }
  return !allowed
}

// Ejecuta una operación con scrypt en un hueco acotado. Con la cola llena
// devuelve null (el llamador responde "ocupado"); cualquier otro error sigue.
async function inHashSlot(task) {
  try {
    return await hashSlot.run(task)
  } catch (err) {
    if (err.code === 'BUSY') return null
    throw err
  }
}

export function registerRoomHandlers(io, socket) {
  safeOn(socket, 'create-room', 'room-error', 'No se pudo crear la sala', async ({ name, password, timezone }) => {
    if (tooManyAttempts(socket)) return socket.emit('room-error', RATE_LIMITED)
    if (!str(name, MAX.roomName) || !str(password, MAX.password)) return
    if (password.length < MIN_PASSWORD) {
      return socket.emit('room-error', `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`)
    }
    // Antes de gastar cupo: un nombre ya cogido no cuenta como "sala creada".
    if (roomExists(name)) return socket.emit('room-error', 'El nombre de sala ya existe')

    const { ip, reliable } = ipOf(socket.handshake.headers, socket.handshake.address)
    // Con una IP no fiable (proxy sin declarar) el cupo sería para toda la app.
    if (reliable && !createRoomLimiter(ip).allowed) {
      socket.data.strike?.()
      return socket.emit('room-error', 'Has creado demasiadas salas. Espera un rato antes de crear otra.')
    }
    if (countRooms() >= LIMITS.maxRooms) {
      return socket.emit('room-error', 'No se pueden crear más salas en este momento.')
    }

    const result = await inHashSlot(() => createRoom(name, password, timezone))
    if (result === null) return socket.emit('room-error', BUSY)
    if (!result.ok) {
      socket.emit('room-error', result.error)
      return
    }
    markAuthed(socket, name)
    socket.emit('room-created', { name })
  })

  safeOn(socket, 'join-room', 'access-denied', 'No se pudo acceder a la sala', async ({ name, password, editor_name, editor_color, device_id }) => {
    if (tooManyAttempts(socket)) return socket.emit('access-denied', RATE_LIMITED)
    if (!str(name, MAX.roomName) || !str(password, MAX.password)) return
    const result = await inHashSlot(() => verifyRoomAccess(name, password))
    if (result === null) return socket.emit('access-denied', BUSY)
    if (!result.ok) {
      socket.emit('access-denied', result.error)
      return
    }
    markAuthed(socket, name)
    setPresence(name, socket.id, editor_name, editor_color, device_id)
    socket.emit('access-granted', {
      room: result.room,
      events: getEvents(name),
      lists: getLists(name),
      listItems: getListItems(name),
      notes: getNotes(name),
      bookmarks: getBookmarks(name),
    })
    emitPresence(io, name) // el socket ya está en la room → cuenta correcta
  })

  // La clave de sala aquí es `name`, no `room` — no encaja en safeAuthedOn.
  safeOn(socket, 'update-room-style', 'room-error', 'No se pudo actualizar el estilo de la sala', ({ name, styles }) => {
    if (!str(name, MAX.roomName) || !isAuthedFor(socket, name)) return
    if (!isObject(styles)) return
    const updatedRoom = updateRoomStyle(name, styles)
    broadcast(io, name, 'style-updated', updatedRoom)
  })

  // Evento propio (no se mezcla con update-room-style): cambia la zona de la
  // sala, que solo afecta al instante en que disparan los recordatorios push.
  safeOn(socket, 'update-room-timezone', 'room-error', 'No se pudo actualizar la zona horaria', ({ name, timezone }) => {
    if (!str(name, MAX.roomName) || !isAuthedFor(socket, name)) return
    if (!str(timezone, MAX.timezone)) return
    const updated = updateRoomTimezone(name, timezone)
    broadcast(io, name, 'room-timezone-updated', updated)
  })
}
