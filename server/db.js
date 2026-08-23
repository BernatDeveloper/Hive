import Database from 'better-sqlite3'
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

let db

const VALID_CATEGORIES = new Set(['otro', 'personal', 'trabajo', 'social', 'cumpleanos', 'vacaciones', 'salud'])
const VALID_REMINDER_OFFSETS = new Set([5, 15, 30, 60, 120, 1440, 2880])

function sanitizeCategory(category) {
  return VALID_CATEGORIES.has(category) ? category : 'otro'
}

function sanitizeReminderOffset(offset) {
  return VALID_REMINDER_OFFSETS.has(offset) ? offset : null
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const hashBuffer = Buffer.from(hash, 'hex')
  const newHash = scryptSync(password, salt, 64)
  return timingSafeEqual(hashBuffer, newHash)
}

export function initDb() {
  const dbPath = process.env.DB_PATH || './calendario.db'
  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')

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

  // Migrate existing event table to add new columns if missing
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

  db.exec('CREATE INDEX IF NOT EXISTS idx_event_reminder ON event(reminder_sent, start)')
}

export function createRoom(name, password) {
  if (db.prepare('SELECT name FROM room WHERE name = ?').get(name)) {
    return { ok: false, error: 'El nombre de sala ya existe' }
  }
  const hash = hashPassword(password)
  db.prepare(
    `INSERT INTO room (name, password_hash, created_at) VALUES (?, ?, datetime('now'))`
  ).run(name, hash)
  return { ok: true }
}

export function verifyRoomAccess(name, password) {
  const room = db.prepare('SELECT * FROM room WHERE name = ?').get(name)
  if (!room) return { ok: false, error: 'La sala no existe' }
  if (!verifyPassword(password, room.password_hash)) {
    return { ok: false, error: 'Contraseña incorrecta' }
  }
  const styles = db.prepare('SELECT * FROM room_style WHERE room = ?').get(name)
  return {
    ok: true,
    room: {
      name: room.name,
      created_at: room.created_at,
      primary_color: styles?.primary_color ?? null,
      background_color: styles?.background_color ?? null,
      text_color: styles?.text_color ?? null,
      sidebar_color: styles?.sidebar_color ?? null,
    }
  }
}

export function updateRoomStyle(name, styles) {
  const { primary_color, background_color, text_color, sidebar_color } = styles
  db.prepare(`
    INSERT OR REPLACE INTO room_style (room, primary_color, background_color, text_color, sidebar_color)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, primary_color, background_color, text_color, sidebar_color)
  return { name, primary_color, background_color, text_color, sidebar_color }
}

export function getEvents(room) {
  return db.prepare('SELECT * FROM event WHERE room = ?').all(room)
}

export function getEventById(id) {
  return db.prepare('SELECT * FROM event WHERE id = ?').get(id)
}

export function createEvent(room, event) {
  const id = crypto.randomUUID()
  const newEvent = {
    id, room, description: '',
    recurrence_rule: null, recurrence_id: null,
    ...event,
    category: sanitizeCategory(event.category),
    reminder_offset: sanitizeReminderOffset(event.reminder_offset),
  }
  db.prepare(`
    INSERT INTO event (id, room, title, start, end, description, category, recurrence_rule, recurrence_id, reminder_offset, updated_at)
    VALUES (@id, @room, @title, @start, @end, @description, @category, @recurrence_rule, @recurrence_id, @reminder_offset, datetime('now'))
  `).run(newEvent)
  return newEvent
}

export function createEventsBatch(room, instances) {
  const insert = db.prepare(`
    INSERT INTO event (id, room, title, start, end, description, category, recurrence_rule, recurrence_id, reminder_offset, updated_at)
    VALUES (@id, @room, @title, @start, @end, @description, @category, @recurrence_rule, @recurrence_id, @reminder_offset, datetime('now'))
  `)
  const withRoom = instances.map(ev => ({
    ...ev,
    room,
    category: sanitizeCategory(ev.category),
    reminder_offset: sanitizeReminderOffset(ev.reminder_offset),
  }))
  db.transaction(evs => { for (const ev of evs) insert.run(ev) })(withRoom)
  return withRoom
}

export function updateEvent(event) {
  const safe = {
    ...event,
    category: sanitizeCategory(event.category),
    reminder_offset: sanitizeReminderOffset(event.reminder_offset),
  }
  db.prepare(`
    UPDATE event
    SET title = @title, start = @start, end = @end,
        description = @description, category = @category,
        reminder_offset = @reminder_offset, updated_at = datetime('now')
    WHERE id = @id
  `).run(safe)
  return db.prepare('SELECT * FROM event WHERE id = ?').get(event.id)
}

export function updateSeries(event) {
  const safe = {
    ...event,
    category: sanitizeCategory(event.category),
    reminder_offset: sanitizeReminderOffset(event.reminder_offset),
  }
  db.prepare(`
    UPDATE event
    SET title = @title, description = @description, category = @category,
        reminder_offset = @reminder_offset, updated_at = datetime('now')
    WHERE recurrence_id = @recurrence_id
  `).run(safe)
  return db.prepare('SELECT * FROM event WHERE recurrence_id = ?').all(event.recurrence_id)
}

export function deleteEvent(id) {
  db.prepare('DELETE FROM event WHERE id = ?').run(id)
}

export function deleteSeries(recurrenceId) {
  db.prepare('DELETE FROM event WHERE recurrence_id = ?').run(recurrenceId)
}

// --- Recurrence generation ---

function localDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 12) // local noon
}

function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(dateStr, n) {
  const d = localDate(dateStr)
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}

function addMonths(dateStr, n) {
  const d = localDate(dateStr)
  d.setMonth(d.getMonth() + n)
  return fmtDate(d)
}

function firstOfMonth(dateStr, n) {
  const d = localDate(dateStr)
  d.setMonth(d.getMonth() + n)
  d.setDate(1)
  return fmtDate(d)
}

function lastOfMonth(dateStr, n) {
  const d = localDate(dateStr)
  d.setMonth(d.getMonth() + n + 1)
  d.setDate(0)
  return fmtDate(d)
}

export function generateRecurrenceInstances(baseEvent, rule) {
  const recurrenceId = crypto.randomUUID()
  const hasTime = baseEvent.start.includes('T')
  const startPart = baseEvent.start.slice(0, 10)
  const startTime = hasTime ? baseEvent.start.slice(10) : ''
  const endPart = baseEvent.end.slice(0, 10)
  const endTime = hasTime ? baseEvent.end.slice(10) : ''
  const diffDays = Math.round((localDate(endPart) - localDate(startPart)) / 86400000)

  const startDates = []
  switch (rule) {
    case 'daily':
      for (let i = 0; i < 365; i++) startDates.push(addDays(startPart, i))
      break
    case 'weekly':
      for (let i = 0; i < 104; i++) startDates.push(addDays(startPart, i * 7))
      break
    case 'monthly':
      for (let i = 0; i < 36; i++) startDates.push(addMonths(startPart, i))
      break
    case 'monthly-first':
      for (let i = 0; i < 36; i++) startDates.push(firstOfMonth(startPart, i))
      break
    case 'monthly-last':
      for (let i = 0; i < 36; i++) startDates.push(lastOfMonth(startPart, i))
      break
    case 'annual':
      for (let i = 0; i < 10; i++) {
        const d = localDate(startPart)
        d.setFullYear(d.getFullYear() + i)
        startDates.push(fmtDate(d))
      }
      break
  }

  return {
    recurrenceId,
    instances: startDates.map(s => ({
      id: crypto.randomUUID(),
      title: baseEvent.title,
      start: s + startTime,
      end: addDays(s, diffDays) + endTime,
      description: baseEvent.description ?? '',
      category: baseEvent.category ?? 'otro',
      recurrence_rule: rule,
      recurrence_id: recurrenceId,
      reminder_offset: baseEvent.reminder_offset ?? null,
    }))
  }
}

// --- Lists ---

export function getLists(room) {
  return db.prepare('SELECT * FROM list WHERE room = ? ORDER BY created_at ASC').all(room)
}

export function getListItems(room) {
  return db.prepare('SELECT * FROM list_item WHERE room = ? ORDER BY created_at ASC')
    .all(room)
    .map(i => ({ ...i, checked: Boolean(i.checked) }))
}

export function createList(room, title) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO list (id, room, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, room, title, now, now)
  return { id, room, title, created_at: now }
}

export function deleteList(id) {
  db.prepare('DELETE FROM list WHERE id = ?').run(id)
}

export function createListItem(listId, room, text) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO list_item (id, list_id, room, text, checked, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
  ).run(id, listId, room, text, now, now)
  return { id, list_id: listId, room, text, checked: false }
}

export function toggleListItem(id, checked) {
  const now = new Date().toISOString()
  db.prepare('UPDATE list_item SET checked = ?, updated_at = ? WHERE id = ?')
    .run(checked ? 1 : 0, now, id)
  const item = db.prepare('SELECT * FROM list_item WHERE id = ?').get(id)
  return { ...item, checked: Boolean(item.checked) }
}

export function deleteListItem(id) {
  db.prepare('DELETE FROM list_item WHERE id = ?').run(id)
}

// --- Notes ---

export function getNotes(room) {
  return db.prepare('SELECT * FROM note WHERE room = ? ORDER BY updated_at DESC').all(room)
}

export function createNote(room, title) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO note (id, room, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, room, title, '', now, now)
  return { id, room, title, body: '', created_at: now, updated_at: now }
}

export function updateNote(note) {
  const now = new Date().toISOString()
  db.prepare('UPDATE note SET title = ?, body = ?, updated_at = ? WHERE id = ?')
    .run(note.title, note.body, now, note.id)
  return db.prepare('SELECT * FROM note WHERE id = ?').get(note.id)
}

export function deleteNote(id) {
  db.prepare('DELETE FROM note WHERE id = ?').run(id)
}

// --- Push notifications ---

export function savePushSubscription(room, subscription) {
  const { endpoint, keys } = subscription
  db.prepare(`
    INSERT INTO push_subscription (id, room, endpoint, p256dh, auth, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      room = excluded.room, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(crypto.randomUUID(), room, endpoint, keys.p256dh, keys.auth, new Date().toISOString())
}

export function deletePushSubscription(endpoint) {
  db.prepare('DELETE FROM push_subscription WHERE endpoint = ?').run(endpoint)
}

export function getRoomSubscriptions(room) {
  return db.prepare('SELECT endpoint, p256dh, auth FROM push_subscription WHERE room = ?').all(room)
}

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

// --- Cleanup ---

export function cleanInactiveRooms() {
  const inactiveRooms = db.prepare(`
    SELECT r.name FROM room r
    LEFT JOIN event e ON e.room = r.name
    LEFT JOIN list_item li ON li.room = r.name
    LEFT JOIN note n ON n.room = r.name
    GROUP BY r.name
    HAVING COALESCE(MAX(e.updated_at), MAX(li.updated_at), MAX(n.updated_at), r.created_at) < datetime('now', '-1 year')
  `).all().map(r => r.name)

  if (inactiveRooms.length === 0) return

  const deleteEvents = db.prepare('DELETE FROM event WHERE room = ?')
  const deleteRoom = db.prepare('DELETE FROM room WHERE name = ?')
  // Cinturón y tirantes: borramos los eventos explícitamente aunque la FK
  // con ON DELETE CASCADE ya lo haría, por si la DB es anterior a esa FK.
  const cleanup = db.transaction((names) => {
    for (const name of names) {
      deleteEvents.run(name)
      deleteRoom.run(name)
    }
  })
  cleanup(inactiveRooms)

  console.log(`Cleanup: ${inactiveRooms.length} inactive rooms deleted`)
}
