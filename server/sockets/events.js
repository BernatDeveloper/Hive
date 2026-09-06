import {
  createEvent, updateEvent, deleteEvent,
  createEventsBatch, getEventById, updateSeries, deleteSeries,
  resetReminderSent,
} from '../db/index.js'
import { generateRecurrenceInstances } from '../services/recurrence.js'
import { isNonEmptyString, isAuthedFor, broadcast } from './helpers.js'

export function registerEventHandlers(io, socket) {
  socket.on('create-event', ({ room, event } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      if (typeof event !== 'object' || event === null) return
      if (!isNonEmptyString(event.start) || !isNonEmptyString(event.end)) return
      const title = typeof event.title === 'string' ? event.title.trim() : ''
      if (!title) return
      const safeEvent = { ...event, title }

      if (safeEvent.recurrence_rule && safeEvent.recurrence_rule !== 'none') {
        const { instances } = generateRecurrenceInstances(safeEvent, safeEvent.recurrence_rule)
        const created = createEventsBatch(room, instances)
        broadcast(io, room, 'events-created', created)
      } else {
        const created = createEvent(room, { ...safeEvent, recurrence_rule: null, recurrence_id: null })
        broadcast(io, room, 'event-created', created)
      }
    } catch (e) {
      console.error('[create-event]', e)
      socket.emit('event-error', { message: 'No se pudo crear el evento' })
    }
  })

  socket.on('update-event', ({ room, event } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      if (typeof event !== 'object' || event === null) return
      if (!isNonEmptyString(event.id)) return
      if (!isNonEmptyString(event.start) || !isNonEmptyString(event.end)) return
      const title = typeof event.title === 'string' ? event.title.trim() : ''
      if (!title) return
      const safeEvent = { ...event, title }

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
    } catch (e) {
      console.error('[update-event]', e)
      socket.emit('event-error', { message: 'No se pudo actualizar el evento' })
    }
  })

  socket.on('delete-event', ({ room, id } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
      if (!isAuthedFor(socket, room)) return
      const ev = getEventById(id)
      if (ev?.recurrence_id) {
        deleteSeries(ev.recurrence_id)
        broadcast(io, room, 'series-deleted', { recurrence_id: ev.recurrence_id })
      } else {
        deleteEvent(id)
        broadcast(io, room, 'event-deleted', id)
      }
    } catch (e) {
      console.error('[delete-event]', e)
      socket.emit('event-error', { message: 'No se pudo eliminar el evento' })
    }
  })
}
