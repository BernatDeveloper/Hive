import { useEffect, useState } from 'react'
import { socket } from '../../socket'
import type { Event } from '../../types'

// Estado de eventos del calendario: eventos únicos y series recurrentes.
// Refresca la lista entera desde `access-granted` (reconexión).
export function useEvents(room: string, initial: Event[]) {
  const [events, setEvents] = useState<Event[]>(initial)

  useEffect(() => {
    function onCreated(e: Event) { setEvents(prev => [...prev, e]) }
    function onUpdated(e: Event) { setEvents(prev => prev.map(ev => ev.id === e.id ? e : ev)) }
    function onDeleted(id: string) { setEvents(prev => prev.filter(ev => ev.id !== id)) }
    function onBatchCreated(batch: Event[]) { setEvents(prev => [...prev, ...batch]) }
    function onSeriesUpdated({ events: updated }: { events: Event[] }) {
      setEvents(prev => prev.map(e => updated.find(u => u.id === e.id) ?? e))
    }
    function onSeriesDeleted({ recurrence_id }: { recurrence_id: string }) {
      setEvents(prev => prev.filter(e => e.recurrence_id !== recurrence_id))
    }
    function onGranted(payload: { events: Event[] }) { setEvents(payload.events) }

    socket.on('event-created', onCreated)
    socket.on('event-updated', onUpdated)
    socket.on('event-deleted', onDeleted)
    socket.on('events-created', onBatchCreated)
    socket.on('series-updated', onSeriesUpdated)
    socket.on('series-deleted', onSeriesDeleted)
    socket.on('access-granted', onGranted)
    return () => {
      socket.off('event-created', onCreated)
      socket.off('event-updated', onUpdated)
      socket.off('event-deleted', onDeleted)
      socket.off('events-created', onBatchCreated)
      socket.off('series-updated', onSeriesUpdated)
      socket.off('series-deleted', onSeriesDeleted)
      socket.off('access-granted', onGranted)
    }
  }, [])

  return {
    events,
    createEvent: (data: Partial<Event>) => socket.emit('create-event', { room, event: data }),
    updateEvent: (data: Partial<Event>) => socket.emit('update-event', { room, event: data }),
    deleteEvent: (id: string) => socket.emit('delete-event', { room, id }),
  }
}
