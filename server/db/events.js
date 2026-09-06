import { randomUUID } from 'node:crypto'
import { db } from './connection.js'

const VALID_CATEGORIES = new Set(['otro', 'personal', 'trabajo', 'social', 'cumpleanos', 'vacaciones', 'salud'])
const VALID_REMINDER_OFFSETS = new Set([5, 15, 30, 60, 120, 1440, 2880])
const HEX = /^#[0-9a-fA-F]{6}$/

function sanitizeCategory(category) {
  return VALID_CATEGORIES.has(category) ? category : 'otro'
}

function sanitizeReminderOffset(offset) {
  return VALID_REMINDER_OFFSETS.has(offset) ? offset : null
}

// Color de evento: hex #rrggbb o null (null = hereda el primary_color de la sala).
function sanitizeColor(color) {
  return typeof color === 'string' && HEX.test(color) ? color.toLowerCase() : null
}

export function getEvents(room) {
  return db.prepare('SELECT * FROM event WHERE room = ?').all(room)
}

export function getEventById(id) {
  return db.prepare('SELECT * FROM event WHERE id = ?').get(id)
}

export function createEvent(room, event) {
  const id = randomUUID()
  const newEvent = {
    id, room, description: '',
    recurrence_rule: null, recurrence_id: null,
    ...event,
    category: sanitizeCategory(event.category),
    color: sanitizeColor(event.color),
    reminder_offset: sanitizeReminderOffset(event.reminder_offset),
  }
  db.prepare(`
    INSERT INTO event (id, room, title, start, end, description, category, color, recurrence_rule, recurrence_id, reminder_offset, updated_at)
    VALUES (@id, @room, @title, @start, @end, @description, @category, @color, @recurrence_rule, @recurrence_id, @reminder_offset, datetime('now'))
  `).run(newEvent)
  return db.prepare('SELECT * FROM event WHERE id = ?').get(id)
}

export function createEventsBatch(room, instances) {
  const insert = db.prepare(`
    INSERT INTO event (id, room, title, start, end, description, category, color, recurrence_rule, recurrence_id, reminder_offset, updated_at)
    VALUES (@id, @room, @title, @start, @end, @description, @category, @color, @recurrence_rule, @recurrence_id, @reminder_offset, datetime('now'))
  `)
  const withRoom = instances.map(ev => ({
    ...ev,
    room,
    category: sanitizeCategory(ev.category),
    color: sanitizeColor(ev.color),
    reminder_offset: sanitizeReminderOffset(ev.reminder_offset),
  }))
  db.transaction(evs => { for (const ev of evs) insert.run(ev) })(withRoom)
  // Todas comparten recurrence_id (generateRecurrenceInstances). Re-SELECT para
  // devolver la fila completa (con updated_at, reminder_sent).
  return db.prepare('SELECT * FROM event WHERE recurrence_id = ? ORDER BY start ASC').all(withRoom[0].recurrence_id)
}

export function updateEvent(event) {
  const safe = {
    ...event,
    category: sanitizeCategory(event.category),
    color: sanitizeColor(event.color),
    reminder_offset: sanitizeReminderOffset(event.reminder_offset),
  }
  db.prepare(`
    UPDATE event
    SET title = @title, start = @start, end = @end,
        description = @description, category = @category, color = @color,
        reminder_offset = @reminder_offset, updated_at = datetime('now')
    WHERE id = @id
  `).run(safe)
  return db.prepare('SELECT * FROM event WHERE id = ?').get(event.id)
}

function seriesFields(event) {
  return {
    ...event,
    category: sanitizeCategory(event.category),
    color: sanitizeColor(event.color),
    reminder_offset: sanitizeReminderOffset(event.reminder_offset),
  }
}

// scope 'all': aplica los metadatos a toda la serie.
export function updateSeries(event) {
  db.prepare(`
    UPDATE event
    SET title = @title, description = @description, category = @category, color = @color,
        reminder_offset = @reminder_offset, updated_at = datetime('now')
    WHERE recurrence_id = @recurrence_id
  `).run(seriesFields(event))
  return db.prepare('SELECT * FROM event WHERE recurrence_id = ?').all(event.recurrence_id)
}

// scope 'future': aplica los metadatos a las instancias desde `fromStart` (incl.)
// y les asigna un recurrence_id nuevo (parte la serie). Devuelve las afectadas.
export function updateSeriesFuture(event, recurrenceId, fromStart) {
  const newRid = randomUUID()
  db.prepare(`
    UPDATE event
    SET title = @title, description = @description, category = @category, color = @color,
        reminder_offset = @reminder_offset, recurrence_id = @newRid, updated_at = datetime('now')
    WHERE recurrence_id = @recurrence_id AND start >= @fromStart
  `).run({ ...seriesFields(event), recurrence_id: recurrenceId, newRid, fromStart })
  return db.prepare('SELECT * FROM event WHERE recurrence_id = ?').all(newRid)
}

// scope 'single': edita esa instancia y la desengancha de la serie.
export function updateEventDetach(event) {
  db.prepare(`
    UPDATE event
    SET title = @title, start = @start, end = @end,
        description = @description, category = @category, color = @color,
        reminder_offset = @reminder_offset,
        recurrence_id = NULL, recurrence_rule = NULL,
        updated_at = datetime('now')
    WHERE id = @id
  `).run(seriesFields(event))
  return db.prepare('SELECT * FROM event WHERE id = ?').get(event.id)
}

// Los delete* devuelven las filas borradas (para la ventana de "deshacer").
export function deleteEvent(id) {
  const row = db.prepare('SELECT * FROM event WHERE id = ?').get(id)
  db.prepare('DELETE FROM event WHERE id = ?').run(id)
  return row ? [row] : []
}

export function deleteSeries(recurrenceId) {
  const rows = db.prepare('SELECT * FROM event WHERE recurrence_id = ?').all(recurrenceId)
  db.prepare('DELETE FROM event WHERE recurrence_id = ?').run(recurrenceId)
  return rows
}

// scope 'future' al borrar: quita las instancias desde `fromStart` (incl.).
export function deleteSeriesFuture(recurrenceId, fromStart) {
  const rows = db.prepare('SELECT * FROM event WHERE recurrence_id = ? AND start >= ?').all(recurrenceId, fromStart)
  db.prepare('DELETE FROM event WHERE recurrence_id = ? AND start >= ?').run(recurrenceId, fromStart)
  return rows
}

const EVENT_COLS = 'id, room, title, start, end, description, category, color, recurrence_rule, recurrence_id, reminder_offset, reminder_sent, updated_at'

export function restoreEvents(rows) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO event (${EVENT_COLS})
    VALUES (@id, @room, @title, @start, @end, @description, @category, @color, @recurrence_rule, @recurrence_id, @reminder_offset, @reminder_sent, @updated_at)
  `)
  db.transaction(rs => { for (const r of rs) insert.run(r) })(rows)
  return rows
}

// --- Recordatorios (flag reminder_sent sobre la tabla event) ---

export function getPendingReminderEvents() {
  const now = Date.now()
  const horizon = new Date(now + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString()
  const past = new Date(now - 6 * 60 * 60 * 1000).toISOString()
  return db.prepare(`
    SELECT id, room, title, start, reminder_offset
    FROM event
    WHERE reminder_offset IS NOT NULL AND reminder_sent = 0
      AND start <= ? AND start >= ?
  `).all(horizon, past)
}

export function markReminderSent(id) {
  db.prepare('UPDATE event SET reminder_sent = 1 WHERE id = ?').run(id)
}

export function resetReminderSent(id) {
  db.prepare('UPDATE event SET reminder_sent = 0 WHERE id = ?').run(id)
}
