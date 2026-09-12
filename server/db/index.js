import { db } from './connection.js'
import { createSchema } from './schema.js'
import { runMigrations } from './migrations.js'

// Crea/migra el esquema. Llamar una vez al arrancar, antes de servir tráfico.
export function initDb() {
  createSchema()
  runMigrations()
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
export * from './push.js'
