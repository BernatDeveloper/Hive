import { db } from '../db/connection.js'
import { logger } from '../lib/logger.js'

const ROOM_INACTIVITY_YEARS = 2
const EVENT_MAX_AGE_YEARS = 3

// Borra salas sin actividad (evento / ítem de lista / nota) en más de 2 años.
// TODAS las señales de actividad deben ser anteriores al umbral: usar
// COALESCE(MAX(x), '') por tabla (no COALESCE(a, b, c), que devuelve el primer
// valor no nulo y podría quedarse con una señal vieja mientras ignora una
// reciente en otra tabla — eso marcaría como inactiva una sala viva). La
// cadena vacía ordena antes que cualquier fecha, así que una tabla sin filas
// para esa sala no la protege de las demás condiciones.
export function cleanInactiveRooms() {
  const inactiveRooms = db.prepare(`
    SELECT r.name FROM room r
    LEFT JOIN event e ON e.room = r.name
    LEFT JOIN list_item li ON li.room = r.name
    LEFT JOIN note n ON n.room = r.name
    GROUP BY r.name
    HAVING COALESCE(MAX(e.updated_at),  '') < datetime('now', '-${ROOM_INACTIVITY_YEARS} years')
       AND COALESCE(MAX(li.updated_at), '') < datetime('now', '-${ROOM_INACTIVITY_YEARS} years')
       AND COALESCE(MAX(n.updated_at),  '') < datetime('now', '-${ROOM_INACTIVITY_YEARS} years')
       AND r.created_at                     < datetime('now', '-${ROOM_INACTIVITY_YEARS} years')
  `).all().map(r => r.name)

  if (inactiveRooms.length === 0) return

  const deleteEvents = db.prepare('DELETE FROM event WHERE room = ?')
  const deleteRoom = db.prepare('DELETE FROM room WHERE name = ?')
  // Cinturón y tirantes: borramos los eventos explícitamente aunque la FK
  // con ON DELETE CASCADE ya lo haría, por si la DB es anterior a esa FK.
  const cleanup = db.transaction((names) => {
    for (const name of names) {
      deleteEvents.run(name)
      deleteRoom.run(name)
    }
  })
  cleanup(inactiveRooms)

  logger.info(`Cleanup: ${inactiveRooms.length} inactive rooms deleted`)
}

// Borra instancias de evento cuyo `end` quedó hace más de 3 años.
//
// CRÍTICO: DELETE directo por fecha sobre filas individuales. NUNCA agrupar
// por `recurrence_id` ni llamar a deleteSeries/deleteSeriesFuture — cada
// instancia de una serie recurrente es una fila independiente (comparten
// recurrence_id pero no fecha), así que un WHERE por `end` borra solo las
// instancias viejas y deja intactas las futuras de la misma serie (p. ej. el
// cumpleaños anual de 2022 se borra; el de 2026 se conserva). Un borrado que
// tocara recurrence_id se llevaría por delante instancias futuras.
//
// La comparación de strings es válida porque `end` empieza por "YYYY-MM-DD"
// tanto en eventos de día completo como con hora.
export function cleanOldEvents() {
  const threshold = new Date(Date.now() - EVENT_MAX_AGE_YEARS * 365 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10) // "YYYY-MM-DD"
  const info = db.prepare('DELETE FROM event WHERE end < ?').run(threshold)
  if (info.changes > 0) logger.info(`Cleanup: ${info.changes} eventos antiguos borrados`)
}

export function startCleanupScheduler() {
  cleanInactiveRooms() // primera pasada al arrancar
  cleanOldEvents()
  setInterval(() => {
    cleanInactiveRooms()
    cleanOldEvents()
  }, 24 * 60 * 60 * 1000)
}
