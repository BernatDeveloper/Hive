import { db } from '../db/connection.js'

// Borra salas sin actividad (evento / ítem de lista / nota) en más de 1 año.
export function cleanInactiveRooms() {
  const inactiveRooms = db.prepare(`
    SELECT r.name FROM room r
    LEFT JOIN event e ON e.room = r.name
    LEFT JOIN list_item li ON li.room = r.name
    LEFT JOIN note n ON n.room = r.name
    GROUP BY r.name
    HAVING COALESCE(MAX(e.updated_at), MAX(li.updated_at), MAX(n.updated_at), r.created_at) < datetime('now', '-1 year')
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

  console.log(`Cleanup: ${inactiveRooms.length} inactive rooms deleted`)
}

export function startCleanupScheduler() {
  cleanInactiveRooms() // primera pasada al arrancar
  setInterval(cleanInactiveRooms, 24 * 60 * 60 * 1000)
}
