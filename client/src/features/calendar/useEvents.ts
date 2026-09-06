import { useEffect, useState } from 'react'
import { socket, emitWrite, emitWriteAck } from '../../socket'
import type { Event, RecurrenceScope, UndoOffer } from '../../types'

// Estado de eventos del calendario: eventos únicos y series recurrentes.
// Refresca la lista entera desde `access-granted` (reconexión).
export function useEvents(room: string, initial: Event[]) {
  const [events, setEvents] = useState<Event[]>(initial)

  useEffect(() => {
    // Dedupe en las altas: `undo-delete` re-emite event(s)-created para restaurar.
    function onCreated(e: Event) { setEvents(prev => prev.some(x => x.id === e.id) ? prev : [...prev, e]) }
    function onUpdated(e: Event) { setEvents(prev => prev.map(ev => ev.id === e.id ? e : ev)) }
    function onDeleted(id: string) { setEvents(prev => prev.filter(ev => ev.id !== id)) }
    function onBatchCreated(batch: Event[]) {
      setEvents(prev => {
        const have = new Set(prev.map(e => e.id))
        return [...prev, ...batch.filter(e => !have.has(e.id))]
      })
    }
    function onSeriesUpdated({ events: updated }: { events: Event[] }) {
      setEvents(prev => prev.map(e => updated.find(u => u.id === e.id) ?? e))
    }
    function onSeriesDeleted({ recurrence_id }: { recurrence_id: string }) {
      setEvents(prev => prev.filter(e => e.recurrence_id !== recurrence_id))
    }
    function onEventsDeleted({ ids }: { ids: string[] }) {
      const gone = new Set(ids)
      setEvents(prev => prev.filter(e => !gone.has(e.id)))
    }
    function onGranted(payload: { events: Event[] }) { setEvents(payload.events) }

    socket.on('event-created', onCreated)
    socket.on('event-updated', onUpdated)
    socket.on('event-deleted', onDeleted)
    socket.on('events-created', onBatchCreated)
    socket.on('series-updated', onSeriesUpdated)
    socket.on('series-deleted', onSeriesDeleted)
    socket.on('events-deleted', onEventsDeleted)
    socket.on('access-granted', onGranted)
    return () => {
      socket.off('event-created', onCreated)
      socket.off('event-updated', onUpdated)
      socket.off('event-deleted', onDeleted)
      socket.off('events-created', onBatchCreated)
      socket.off('series-updated', onSeriesUpdated)
      socket.off('series-deleted', onSeriesDeleted)
      socket.off('events-deleted', onEventsDeleted)
      socket.off('access-granted', onGranted)
    }
  }, [])

  return {
    events,
    createEvent: (data: Partial<Event>) => emitWrite('create-event', { room, event: data }),
    updateEvent: (data: Partial<Event>, scope?: RecurrenceScope) =>
      emitWrite('update-event', { room, event: data, scope }),
    deleteEvent: (id: string, scope?: RecurrenceScope): Promise<UndoOffer> =>
      emitWriteAck<UndoOffer>('delete-event', { room, id, scope }, {}),
  }
}
