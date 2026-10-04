import { db } from './connection.js'
import { createSchema } from './schema.js'
import { runMigrations } from './migrations.js'
import { failStalePreviews } from './bookmarks.js'

// Crea/migra el esquema. Llamar una vez al arrancar, antes de servir tráfico.
export function initDb() {
  createSchema()
  runMigrations()
  failStalePreviews() // una descarga de vista previa cortada por un reinicio no se reanuda sola
}

// Apagado ordenado: fuerza el checkpoint del WAL a la DB principal antes de
// cerrar, para no depender de que el próximo arranque lo haga por nosotros.
export function closeDb() {
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
}

export * from './rooms.js'
export * from './events.js'
export * from './lists.js'
export * from './notes.js'
export * from './bookmarks.js'
export * from './push.js'
export * from './members.js'
export * from './quotas.js'
