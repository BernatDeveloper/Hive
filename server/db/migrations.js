import { db } from './connection.js'

// SQLite no tiene `ADD COLUMN IF NOT EXISTS` — comprobamos con
// `PRAGMA table_info(<tabla>)` antes de cada `ALTER TABLE ADD COLUMN`. Una DB
// nueva ya nace con la columna desde createSchema() (CREATE TABLE IF NOT
// EXISTS no toca una tabla ya existente), así que esto es idempotente: en una
// DB nueva no hace nada, en una DB con datos reales de antes de la columna la
// añade una sola vez.
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
  if (cols.length === 0) return // la tabla no existe (aún): nada que migrar
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export function runMigrations() {
  addColumnIfMissing('note', 'pinned', 'INTEGER NOT NULL DEFAULT 0')
  // Marcadores: quién y cuándo editó por última vez el contenido (título,
  // descripción, etiquetas). Distinto de updated_at, que también se mueve con
  // la vista previa o con marcar favorito/visto.
  addColumnIfMissing('bookmark', 'last_editor_name', 'TEXT')
  addColumnIfMissing('bookmark', 'last_editor_color', 'TEXT')
  addColumnIfMissing('bookmark', 'edited_at', 'TEXT')
  // Listas: quién hizo la última modificación (de la lista o de sus ítems) y
  // cuándo. null = sin registro (listas de antes de esta columna).
  addColumnIfMissing('list', 'last_editor_name', 'TEXT')
  addColumnIfMissing('list', 'last_editor_color', 'TEXT')
  addColumnIfMissing('list', 'edited_at', 'TEXT')
}
