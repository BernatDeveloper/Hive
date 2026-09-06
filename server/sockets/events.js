import {
  createEvent, updateEvent, deleteEvent,
  createEventsBatch, getEventById, updateSeries, deleteSeries,
  resetReminderSent,
} from '../db/index.js'
import { generateRecurrenceInstances } from '../services/recurrence.js'
import { broadcast } from './helpers.js'
import { safeAuthedOn } from './handler.js'
import { str, isValidEventInput, MAX } from './validate.js'

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

  safeAuthedOn(socket, 'update-event', 'event-error', { message: 'No se pudo actualizar el evento' }, ({ room, event }) => {
    if (!isValidEventInput(event) || !str(event.id, MAX.id)) return
    const safeEvent = { ...event, title: event.title.trim() }

    const before = getEventById(safeEvent.id)
    const offsetChanged = before && (safeEvent.reminder_offset ?? null) !== before.reminder_offset

    if (safeEvent.recurrence_id) {
      let updated = updateSeries(safeEvent)
      if (offsetChanged) {
        for (const ev of updated) resetReminderSent(ev.id)
        updated = updated.map(ev => ({ ...ev, reminder_sent: 0 }))
      }
      broadcast(io, room, 'series-updated', { events: updated })
    } else {
      let updated = updateEvent(safeEvent)
      if (before && (updated.start !== before.start || offsetChanged)) {
        resetReminderSent(safeEvent.id)
        updated = { ...updated, reminder_sent: 0 }
      }
      broadcast(io, room, 'event-updated', updated)
    }
  })

  safeAuthedOn(socket, 'delete-event', 'event-error', { message: 'No se pudo eliminar el evento' }, ({ room, id }) => {
    if (!str(id, MAX.id)) return
    const ev = getEventById(id)
    if (ev?.recurrence_id) {
      deleteSeries(ev.recurrence_id)
      broadcast(io, room, 'series-deleted', { recurrence_id: ev.recurrence_id })
    } else {
      deleteEvent(id)
      broadcast(io, room, 'event-deleted', id)
    }
  })
}
