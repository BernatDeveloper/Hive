import { createSchema } from './schema.js'
import { runMigrations } from './migrations.js'

// Crea/migra el esquema. Llamar una vez al arrancar, antes de servir tráfico.
export function initDb() {
  createSchema()
  runMigrations()
}

export * from './rooms.js'
export * from './events.js'
export * from './lists.js'
export * from './notes.js'
export * from './push.js'
