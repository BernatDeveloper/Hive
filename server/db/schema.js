import { db } from './connection.js'

// Crea las tablas si no existen. Las columnas añadidas a posteriori sobre DBs
// ya existentes las gestiona runMigrations() (ALTER TABLE).
export function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS room (
      name TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS room_style (
      room TEXT PRIMARY KEY REFERENCES room(name) ON DELETE CASCADE,
      primary_color TEXT,
      background_color TEXT,
      text_color TEXT,
      sidebar_color TEXT
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS event (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL REFERENCES room(name) ON DELETE CASCADE,
      title TEXT NOT NULL,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'otro',
      recurrence_rule TEXT,
      recurrence_id TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS list (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (room) REFERENCES room(name) ON DELETE CASCADE
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS list_item (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL,
      room TEXT NOT NULL,
      text TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (list_id) REFERENCES list(id) ON DELETE CASCADE
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS note (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Sin título',
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (room) REFERENCES room(name) ON DELETE CASCADE
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscription (
      id         TEXT PRIMARY KEY,
      room       TEXT NOT NULL REFERENCES room(name) ON DELETE CASCADE,
      endpoint   TEXT UNIQUE NOT NULL,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  // El índice sobre reminder_sent vive en runMigrations(): esa columna se añade
  // por ALTER TABLE y en una DB nueva aún no existe al ejecutar este bloque.
}
