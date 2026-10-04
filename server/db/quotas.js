import { db } from './connection.js'
import { LIMITS } from '../config/limits.js'

// Cuotas de datos: ni una sala ni el servidor pueden crecer sin límite. Evita
// que alguien con la contraseña de una sala (o un script con ella) llene el
// disco. Los topes (config/limits.js) son holgados para uso real.

// Lista cerrada: el nombre de tabla se interpola en el SQL, así que solo vale
// lo que está aquí (todas estas tablas tienen columna `room`).
const KINDS = new Set(['event', 'list', 'list_item', 'note', 'bookmark', 'push_subscription'])

export function countInRoom(kind, room) {
  if (!KINDS.has(kind)) throw new Error(`cuota desconocida: ${kind}`)
  return db.prepare(`SELECT COUNT(*) AS n FROM ${kind} WHERE room = ?`).get(room).n
}

// ¿Caben `adding` filas más de este tipo en la sala?
export function hasRoomFor(kind, room, adding = 1) {
  return countInRoom(kind, room) + adding <= LIMITS.maxPerRoom[kind]
}

export function countRooms() {
  return db.prepare('SELECT COUNT(*) AS n FROM room').get().n
}

export function countItemsInList(listId) {
  return db.prepare('SELECT COUNT(*) AS n FROM list_item WHERE list_id = ?').get(listId).n
}
