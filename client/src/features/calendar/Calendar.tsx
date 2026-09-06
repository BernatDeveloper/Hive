import { useState } from 'react'
import './calendar.css'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg, EventClickArg } from '@fullcalendar/core'
import esLocale from '@fullcalendar/core/locales/es'
import type { Event, RecurrenceScope } from '../../types'
import EventModal from './EventModal'
import EventsPanel from './EventsPanel'
import { readableTextColor } from '../../shared/color'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  events: Event[]
  roomName: string
  primaryColor?: string
  paletteColors: string[]
  onCreateEvent: (data: Partial<Event>) => void
  onUpdateEvent: (data: Partial<Event>, scope?: RecurrenceScope) => void
  onDeleteEvent: (id: string, scope?: RecurrenceScope) => void
}

interface ModalState {
  open: boolean
  event?: Partial<Event>
  start?: string
  end?: string
}

export default function Calendar({ events, roomName, primaryColor = '#0071E3', paletteColors, onCreateEvent, onUpdateEvent, onDeleteEvent }: Props) {
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [mobileView, setMobileView] = useState<'calendar' | 'events'>('calendar')
  const isMobile = useIsMobile()

  function handleSelect(info: DateSelectArg) {
    setModal({ open: true, start: info.startStr, end: info.endStr })
  }

  function handleEventClick(info: EventClickArg) {
    const event = events.find(e => e.id === info.event.id)
    if (event) setModal({ open: true, event })
  }

  function save(data: Partial<Event>, scope?: RecurrenceScope) {
    if (data.id) {
      onUpdateEvent(data, scope)
    } else {
      onCreateEvent(data)
    }
    setModal({ open: false })
  }

  function remove(id: string, scope?: RecurrenceScope) {
    onDeleteEvent(id, scope)
    setModal({ open: false })
  }

  function eventColor(e: Event): string {
    return e.color ?? primaryColor
  }

  const fcEvents = events.map(e => {
    const bg = eventColor(e)
    return {
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      backgroundColor: bg,
      borderColor: 'transparent',
      textColor: readableTextColor(bg),
      extendedProps: { description: e.description },
    }
  })

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
            roomName={roomName}
            primaryColor={primaryColor}
            paletteColors={paletteColors}
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
              // Por defecto FullCalendar exige pulsación larga para
              // seleccionar en táctil (para no chocar con el scroll de
              // vistas con desplazamiento interno); dayGridMonth no lo
              // necesita, así que un toque normal ya selecciona el día.
              selectLongPressDelay={0}
              select={handleSelect}
              eventClick={handleEventClick}
              events={fcEvents}
              locale="es"
              locales={[esLocale]}
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
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
          paletteColors={paletteColors}
          primaryColor={primaryColor}
          onSave={save}
          onDelete={remove}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}
