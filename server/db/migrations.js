import { db } from './connection.js'

// Añade columnas nuevas a tablas ya existentes. Patrón: comprobar con
// PRAGMA table_info si la columna existe antes de hacer ALTER TABLE.
export function runMigrations() {
  const eventCols = db.prepare('PRAGMA table_info(event)').all().map(c => c.name)
  if (!eventCols.includes('category')) {
    db.exec("ALTER TABLE event ADD COLUMN category TEXT DEFAULT 'otro'")
  }
  if (!eventCols.includes('recurrence_rule')) {
    db.exec('ALTER TABLE event ADD COLUMN recurrence_rule TEXT')
  }
  if (!eventCols.includes('recurrence_id')) {
    db.exec('ALTER TABLE event ADD COLUMN recurrence_id TEXT')
  }
  if (!eventCols.includes('reminder_offset')) {
    db.exec('ALTER TABLE event ADD COLUMN reminder_offset INTEGER')
  }
  if (!eventCols.includes('reminder_sent')) {
    db.exec('ALTER TABLE event ADD COLUMN reminder_sent INTEGER DEFAULT 0')
  }
  if (!eventCols.includes('color')) {
    db.exec('ALTER TABLE event ADD COLUMN color TEXT')
    // Backfill: los eventos existentes conservan el color de su antigua
    // categoría (mapa replicado de client/src/features/calendar/categories.ts,
    // que se elimina). 'otro' → NULL → renderiza el primary_color de la sala.
    db.exec(`
      UPDATE event SET color = CASE category
        WHEN 'personal'   THEN '#30d158'
        WHEN 'trabajo'    THEN '#0071e3'
        WHEN 'social'     THEN '#bf5af2'
        WHEN 'cumpleanos' THEN '#ff375f'
        WHEN 'vacaciones' THEN '#ff9f0a'
        WHEN 'salud'      THEN '#ff453a'
        ELSE NULL
      END
      WHERE color IS NULL
    `)
  }

  const styleCols = db.prepare('PRAGMA table_info(room_style)').all().map(c => c.name)
  if (!styleCols.includes('event_colors')) {
    db.exec('ALTER TABLE room_style ADD COLUMN event_colors TEXT')
  }

  // Depende de reminder_sent, por eso va aquí y no en createSchema().
  db.exec('CREATE INDEX IF NOT EXISTS idx_event_reminder ON event(reminder_sent, start)')
}
