import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db } from './connection.js'
import { runMigrations } from './migrations.js'

// Este fichero NO llama a createSchema(): crea a mano la tabla `note` con el
// esquema ANTERIOR (sin la columna que runMigrations() debe añadir). Los
// demás tests arrancan con createSchema() ya al día (vía initDb()), así que
// nunca ejercitan de verdad el camino de actualización de una DB existente
// — esto reproduce justo ese escenario (el bug real: una hive.db de
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

test('runMigrations añade la atribución de edición a una tabla bookmark anterior', () => {
  db.exec(`
    CREATE TABLE bookmark (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image TEXT,
      site_name TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      favorite INTEGER NOT NULL DEFAULT 0,
      seen INTEGER NOT NULL DEFAULT 0,
      preview_status TEXT NOT NULL DEFAULT 'pending',
      added_by_name TEXT,
      added_by_color TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  db.prepare("INSERT INTO bookmark (id, room, url, title, created_at, updated_at) VALUES ('b1', 'r1', 'https://x.com', 'X', 'now', 'now')").run()

  runMigrations()

  const cols = db.prepare('PRAGMA table_info(bookmark)').all().map(c => c.name)
  for (const c of ['last_editor_name', 'last_editor_color', 'edited_at']) assert.ok(cols.includes(c), c)
  // una fila anterior a la migración lee NULL (= "nunca editado")
  const row = db.prepare('SELECT last_editor_name, edited_at FROM bookmark WHERE id = ?').get('b1')
  assert.equal(row.last_editor_name, null)
  assert.equal(row.edited_at, null)
})

test('runMigrations no falla si la tabla aún no existe', () => {
  db.exec('DROP TABLE bookmark')
  assert.doesNotThrow(() => runMigrations())
})

test('runMigrations añade la atribución de última modificación a una tabla list anterior', () => {
  db.exec(`
    CREATE TABLE list (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  db.prepare("INSERT INTO list (id, room, title, created_at, updated_at) VALUES ('l1', 'r1', 'L', 'now', 'now')").run()

  runMigrations()

  const cols = db.prepare('PRAGMA table_info(list)').all().map(c => c.name)
  for (const c of ['last_editor_name', 'last_editor_color', 'edited_at']) assert.ok(cols.includes(c), c)
  // una lista anterior a la migración lee NULL (= "sin registro de modificación")
  const row = db.prepare('SELECT last_editor_name, edited_at FROM list WHERE id = ?').get('l1')
  assert.equal(row.last_editor_name, null)
  assert.equal(row.edited_at, null)
})
