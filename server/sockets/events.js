import {
  createEvent, updateEvent, deleteEvent,
  createEventsBatch, getEventById,
  updateSeries, updateSeriesFuture, updateEventDetach,
  deleteSeries, deleteSeriesFuture,
  resetReminderSent,
} from '../db/index.js'
import { generateRecurrenceInstances } from '../services/recurrence.js'
import { broadcast } from './helpers.js'
import { safeAuthedOn } from './handler.js'
import { str, isValidEventInput, MAX } from './validate.js'

const SCOPES = new Set(['single', 'future', 'all'])
// 'all' por defecto = comportamiento anterior (clientes que no mandan scope).
const scopeOf = v => (SCOPES.has(v) ? v : 'all')

export function registerEventHandlers(io, socket) {
  safeAuthedOn(socket, 'create-event', 'event-error', { message: 'No se pudo crear el evento' }, ({ room, event }) => {
    if (!isValidEventInput(event)) return
    const safeEvent = { ...event, title: event.title.trim() }

    if (safeEvent.recurrence_rule && safeEvent.recurrence_rule !== 'none') {
      const { instances } = generateRecurrenceInstances(safeEvent, safeEvent.recurrence_rule)
      const created = createEventsBatch(room, instances)
      broadcast(io, room, 'events-created', created)
    } else {
      const created = createEvent(room, { ...safeEvent, recurrence_rule: null, recurrence_id: null })
      broadcast(io, room, 'event-created', created)
    }
  })

  safeAuthedOn(socket, 'update-event', 'event-error', { message: 'No se pudo actualizar el evento' }, ({ room, event, scope }) => {
    if (!isValidEventInput(event) || !str(event.id, MAX.id)) return
    const safeEvent = { ...event, title: event.title.trim() }

    const before = getEventById(safeEvent.id)
    if (!before) return
    const offsetChanged = (safeEvent.reminder_offset ?? null) !== before.reminder_offset
    const resetOne = (ev) => { resetReminderSent(ev.id); return { ...ev, reminder_sent: 0 } }

    // Evento único (o instancia con scope 'single'): edición normal.
    if (!before.recurrence_id) {
      let updated = updateEvent(safeEvent)
      if (updated.start !== before.start || offsetChanged) updated = resetOne(updated)
      broadcast(io, room, 'event-updated', updated)
      return
    }

    const s = scopeOf(scope)
    if (s === 'single') {
      let updated = updateEventDetach(safeEvent)
      if (updated.start !== before.start || offsetChanged) updated = resetOne(updated)
      broadcast(io, room, 'event-updated', updated)
    } else if (s === 'future') {
      let updated = updateSeriesFuture(safeEvent, before.recurrence_id, before.start)
      if (offsetChanged) updated = updated.map(resetOne)
      broadcast(io, room, 'series-updated', { events: updated })
    } else {
      let updated = updateSeries({ ...safeEvent, recurrence_id: before.recurrence_id })
      if (offsetChanged) updated = updated.map(resetOne)
      broadcast(io, room, 'series-updated', { events: updated })
    }
  })

  safeAuthedOn(socket, 'delete-event', 'event-error', { message: 'No se pudo eliminar el evento' }, ({ room, id, scope }) => {
    if (!str(id, MAX.id)) return
    const ev = getEventById(id)
    if (!ev) return

    if (!ev.recurrence_id) {
      deleteEvent(id)
      broadcast(io, room, 'event-deleted', id)
      return
    }

    const s = scopeOf(scope)
    if (s === 'single') {
      deleteEvent(id)
      broadcast(io, room, 'event-deleted', id)
    } else if (s === 'future') {
      const ids = deleteSeriesFuture(ev.recurrence_id, ev.start)
      broadcast(io, room, 'events-deleted', { ids })
    } else {
      deleteSeries(ev.recurrence_id)
      broadcast(io, room, 'series-deleted', { recurrence_id: ev.recurrence_id })
    }
  })
}
