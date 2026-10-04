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
      created_at TEXT DEFAULT (datetime('now')),
      timezone TEXT NOT NULL DEFAULT 'Europe/Madrid'
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
      color TEXT,
      recurrence_rule TEXT,
      recurrence_id TEXT,
      reminder_offset INTEGER,
      reminder_sent INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      last_editor_name TEXT,
      last_editor_color TEXT
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS list (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_editor_name TEXT,
      last_editor_color TEXT,
      edited_at TEXT,
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
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_editor_name TEXT,
      last_editor_color TEXT,
      FOREIGN KEY (room) REFERENCES room(name) ON DELETE CASCADE
    )
  `)

  // Marcadores: enlaces guardados (tutoriales, productos, artículos…). El
  // título/descripción/imagen se rellenan en segundo plano desde la propia
  // página (services/linkPreview.js); `preview_status` dice en qué punto está
  // ('pending' → 'done' | 'failed'). `tags` es un array JSON de strings.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookmark (
      id             TEXT PRIMARY KEY,
      room           TEXT NOT NULL REFERENCES room(name) ON DELETE CASCADE,
      url            TEXT NOT NULL,
      title          TEXT NOT NULL,
      description    TEXT NOT NULL DEFAULT '',
      image          TEXT,
      site_name      TEXT,
      tags           TEXT NOT NULL DEFAULT '[]',
      favorite       INTEGER NOT NULL DEFAULT 0,
      seen           INTEGER NOT NULL DEFAULT 0,
      preview_status TEXT NOT NULL DEFAULT 'pending',
      added_by_name  TEXT,
      added_by_color TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL,
      last_editor_name  TEXT,
      last_editor_color TEXT,
      edited_at         TEXT
    )
  `)

  // Miembros de la sala: cada dispositivo (identidad ligera, sin cuentas) que
  // ha entrado alguna vez. La presencia en vivo sigue en memoria
  // (sockets/presence.js); esto es lo que permite listar también a quien no
  // está conectado ahora mismo. PK (room, device_id) ya sirve de índice por sala.
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_member (
      room         TEXT NOT NULL REFERENCES room(name) ON DELETE CASCADE,
      device_id    TEXT NOT NULL,
      name         TEXT NOT NULL,
      color        TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (room, device_id)
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
    CREATE INDEX IF NOT EXISTS idx_bookmark_room      ON bookmark(room);
    CREATE INDEX IF NOT EXISTS idx_push_sub_room      ON push_subscription(room);
  `)
}
