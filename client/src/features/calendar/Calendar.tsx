import { useEffect, useState } from 'react'
import './calendar.css'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg, EventClickArg } from '@fullcalendar/core'
import esLocale from '@fullcalendar/core/locales/es'
import { socket } from '../../socket'
import type { Event } from '../../types'
import EventModal from './EventModal'
import EventsPanel from './EventsPanel'
import { CATEGORIES } from './categories'
import { useEventReminders } from '../../hooks/useEventReminders'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  room: string
  initialEvents: Event[]
  primaryColor?: string
}

interface ModalState {
  open: boolean
  event?: Partial<Event>
  start?: string
  end?: string
}

export default function Calendar({ room, initialEvents, primaryColor = '#0071E3' }: Props) {
  const [events, setEvents] = useState<Event[]>(initialEvents)
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [mobileView, setMobileView] = useState<'calendar' | 'events'>('calendar')
  const isMobile = useIsMobile()

  useEventReminders(events, room)

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

    socket.on('event-created', onCreated)
    socket.on('event-updated', onUpdated)
    socket.on('event-deleted', onDeleted)
    socket.on('events-created', onBatchCreated)
    socket.on('series-updated', onSeriesUpdated)
    socket.on('series-deleted', onSeriesDeleted)
    return () => {
      socket.off('event-created', onCreated)
      socket.off('event-updated', onUpdated)
      socket.off('event-deleted', onDeleted)
      socket.off('events-created', onBatchCreated)
      socket.off('series-updated', onSeriesUpdated)
      socket.off('series-deleted', onSeriesDeleted)
    }
  }, [])

  function handleSelect(info: DateSelectArg) {
    setModal({ open: true, start: info.startStr, end: info.endStr })
  }

  function handleEventClick(info: EventClickArg) {
    const event = events.find(e => e.id === info.event.id)
    if (event) setModal({ open: true, event })
  }

  function save(data: Partial<Event>) {
    if (data.id) {
      socket.emit('update-event', { room, event: data })
    } else {
      socket.emit('create-event', { room, event: data })
    }
    setModal({ open: false })
  }

  function remove(id: string) {
    socket.emit('delete-event', { room, id })
    setModal({ open: false })
  }

  function eventColor(e: Event): string {
    return (!e.category || e.category === 'otro')
      ? primaryColor
      : CATEGORIES[e.category].color
  }

  const fcEvents = events.map(e => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    extendedProps: { description: e.description, category: e.category },
  }))

  return (
    <div className="calendar-container">
      {isMobile && (
        <div className="calendar-view-toggle">
          <button
            className={mobileView === 'calendar' ? 'active' : ''}
            onClick={() => setMobileView('calendar')}
          >
            Calendario
          </button>
          <button
            className={mobileView === 'events' ? 'active' : ''}
            onClick={() => setMobileView('events')}
          >
            Eventos
          </button>
        </div>
      )}

      <div className="calendar-layout">
        {(!isMobile || mobileView === 'events') && (
          <EventsPanel
            events={events}
            primaryColor={primaryColor}
            onNewEvent={() => setModal({ open: true })}
            onEventClick={ev => setModal({ open: true, event: ev })}
          />
        )}

        {(!isMobile || mobileView === 'calendar') && (
          <div className="calendar-main">
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              selectable
              selectMirror
              select={handleSelect}
              eventClick={handleEventClick}
              events={fcEvents}
              eventDidMount={(info) => {
                const ev = events.find(e => e.id === info.event.id)
                const color = ev ? eventColor(ev) : primaryColor
                info.el.style.setProperty('background-color', color, 'important')
                info.el.style.setProperty('border-color', 'transparent', 'important')
                info.el.style.setProperty('color', '#fff', 'important')
              }}
              locale="es"
              locales={[esLocale]}
              height="100%"
              headerToolbar={{
                left: 'prev,next',
                center: 'title',
                right: 'today',
              }}
              buttonText={{ today: 'Hoy' }}
            />
          </div>
        )}
      </div>

      {modal.open && (
        <EventModal
          event={modal.event}
          start={modal.start}
          end={modal.end}
          onSave={save}
          onDelete={remove}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}
