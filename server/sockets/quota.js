import { hasRoomFor } from '../db/index.js'
import { LIMITS } from '../config/limits.js'

const NAMES = {
  event: 'eventos',
  list: 'listas',
  list_item: 'ítems de lista',
  note: 'notas',
  bookmark: 'marcadores',
  push_subscription: 'dispositivos con avisos',
}

// true = cabe; false = se ha avisado al emisor por su evento de error y el
// handler debe abandonar sin escribir nada.
export function withinQuota(socket, errorEvent, kind, room, adding = 1) {
  if (hasRoomFor(kind, room, adding)) return true
  const max = LIMITS.maxPerRoom[kind].toLocaleString('es-ES')
  socket.emit(errorEvent, { message: `Esta sala ha alcanzado su límite de ${NAMES[kind]} (${max}).` })
  return false
}
