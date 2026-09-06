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

  // Depende de reminder_sent, por eso va aquí y no en createSchema().
  db.exec('CREATE INDEX IF NOT EXISTS idx_event_reminder ON event(reminder_sent, start)')
}
