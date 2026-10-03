import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db } from './connection.js'
import { runMigrations } from './migrations.js'

// Este fichero NO llama a createSchema(): crea a mano la tabla `note` con el
// esquema ANTERIOR (sin la columna que runMigrations() debe añadir). Los
// demás tests arrancan con createSchema() ya al día (vía initDb()), así que
// nunca ejercitan de verdad el camino de actualización de una DB existente
// — esto reproduce justo ese escenario (el bug real: una calendario.db de
// antes de añadir note.pinned).
test('runMigrations añade columnas que faltan en una DB con esquema antiguo', () => {
  db.exec(`
    CREATE TABLE note (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Sin título',
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_editor_name TEXT,
      last_editor_color TEXT
    )
  `)

  const colsBefore = db.prepare('PRAGMA table_info(note)').all().map(c => c.name)
  assert.ok(!colsBefore.includes('pinned'))

  runMigrations()

  const noteCols = db.prepare('PRAGMA table_info(note)').all().map(c => c.name)
  assert.ok(noteCols.includes('pinned'))

  // Una fila ya existente (insertada sin tocar la columna nueva) debe leer un
  // valor por defecto sano (0), no NULL — si no, el join-room del usuario con
  // datos reales seguiría rompiendo aguas abajo.
  db.prepare('INSERT INTO note (id, room, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('n1', 'r1', 'T', '', 'now', 'now')
  assert.equal(db.prepare('SELECT pinned FROM note WHERE id = ?').get('n1').pinned, 0)
})

test('runMigrations es idempotente', () => {
  assert.doesNotThrow(() => { runMigrations(); runMigrations() })
})
