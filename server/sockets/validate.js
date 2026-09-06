// Validación de payloads de socket en el borde de cada handler. Manual, sin
// dependencias. Un payload inválido → el handler hace `return` (o emite su
// evento de error) y no persiste nada.

export const MAX = {
  id: 64,          // UUIDs generados en servidor (36); margen por si acaso
  roomName: 60,
  password: 200,
  eventTitle: 200,
  eventDescription: 4000,
  isoDate: 40,
  listTitle: 200,
  listItemText: 1000,
  noteTitle: 200,
  noteBody: 100_000,
  pushEndpoint: 1000,
  pushKey: 500,
}

const RECURRENCE_RULES = new Set([
  'none', 'daily', 'weekly', 'monthly', 'monthly-first', 'monthly-last', 'annual',
])

// string no vacío de longitud <= max
export function str(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= max
}

// string opcional (null/undefined permitido) de longitud <= max
export function optStr(v, max) {
  return v == null || (typeof v === 'string' && v.length <= max)
}

export function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// "YYYY-MM-DD" con o sin parte de hora, longitud acotada
export function isDateish(v) {
  return typeof v === 'string' && v.length <= MAX.isoDate && /^\d{4}-\d{2}-\d{2}/.test(v)
}

export function isRecurrenceRule(v) {
  return v == null || RECURRENCE_RULES.has(v)
}

// Forma de un evento entrante (create/update). No valida `id` (lo hace el handler).
export function isValidEventInput(event) {
  if (!isObject(event)) return false
  if (typeof event.title !== 'string' || event.title.trim().length === 0 || event.title.length > MAX.eventTitle) return false
  if (!isDateish(event.start) || !isDateish(event.end)) return false
  if (!optStr(event.description, MAX.eventDescription)) return false
  if (!isRecurrenceRule(event.recurrence_rule)) return false
  // color y reminder_offset los sanea db/events.js; recurrence_id se ignora salvo en update
  return true
}

// Forma de una PushSubscription (subscription.toJSON())
export function isValidPushSubscription(sub) {
  return isObject(sub)
    && str(sub.endpoint, MAX.pushEndpoint)
    && isObject(sub.keys)
    && str(sub.keys.p256dh, MAX.pushKey)
    && str(sub.keys.auth, MAX.pushKey)
}
