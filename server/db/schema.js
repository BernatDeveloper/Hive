import { db } from './connection.js'

// Crea las tablas con el esquema completo. El proyecto no está desplegado y no
// tiene datos reales, así que el esquema vive entero aquí — sin ALTER TABLE.
// `runMigrations()` (migrations.js) queda reservado para el día que haga falta
// migrar una DB con datos.
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
      sidebar_color TEXT,
      event_colors TEXT
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
      color TEXT,
      recurrence_rule TEXT,
      recurrence_id TEXT,
      reminder_offset INTEGER,
      reminder_sent INTEGER DEFAULT 0,
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

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_event_reminder     ON event(reminder_sent, start);
    CREATE INDEX IF NOT EXISTS idx_event_room         ON event(room);
    CREATE INDEX IF NOT EXISTS idx_list_room          ON list(room);
    CREATE INDEX IF NOT EXISTS idx_list_item_room     ON list_item(room);
    CREATE INDEX IF NOT EXISTS idx_list_item_list     ON list_item(list_id);
    CREATE INDEX IF NOT EXISTS idx_note_room          ON note(room);
    CREATE INDEX IF NOT EXISTS idx_push_sub_room      ON push_subscription(room);
  `)
}
