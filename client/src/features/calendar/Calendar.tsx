import { useRef, useState } from 'react'
import './calendar.css'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg, EventClickArg } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { Event, RecurrenceScope } from '../../types'
import EventModal from './EventModal'
import type { EventSavePayload } from './EventModal'
import EventsPanel from './EventsPanel'
import { readableTextColor } from '../../shared/color'
import { useIsMobile } from '../../hooks/useIsMobile'
import { formatLocalDate, localDateKey } from './dateUtils'

interface Props {
  events: Event[]
  roomName: string
  primaryColor?: string
  paletteColors: string[]
  conflict: Event | null
  onCreateEvent: (data: Partial<Event>) => void
  onUpdateEvent: (data: EventSavePayload, scope?: RecurrenceScope) => void
  onDeleteEvent: (id: string, scope?: RecurrenceScope) => void
  onDismissConflict: () => void
}

interface ModalState {
  open: boolean
  event?: Partial<Event>
  start?: string
  end?: string
}

export default function Calendar({ events, roomName, primaryColor = '#0071E3', paletteColors, conflict, onCreateEvent, onUpdateEvent, onDeleteEvent, onDismissConflict }: Props) {
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [mobileView, setMobileView] = useState<'calendar' | 'events'>('calendar')
  const isMobile = useIsMobile()
  const calendarRef = useRef<FullCalendar>(null)

  function handleSelect(info: DateSelectArg) {
    setModal({ open: true, start: info.startStr, end: info.endStr })
  }

  // Navega a la vista día de esa fecha (estilo Google Calendar); si ese día
  // no tiene ningún evento, además abre directamente el modal de uno nuevo —
  // si ya tenía eventos, solo navega y el usuario toca el que quiera editar.
  function goToDay(dateStr: string) {
    calendarRef.current?.getApi().changeView('timeGridDay', dateStr)
    const hasEvents = events.some(e => localDateKey(e.start) === dateStr)
    if (!hasEvents) {
      setModal({ open: true, start: dateStr, end: dateStr })
    }
  }

  // Clic en el hueco vacío de un día en vista mes (en vista día no hace
  // falta: crear ahí ya pasa por `select`, con hora incluida).
  function handleDateClick(info: DateClickArg) {
    if (info.view.type === 'dayGridMonth') {
      goToDay(info.dateStr)
    }
  }

  function handleEventClick(info: EventClickArg) {
    if (info.view.type === 'dayGridMonth') {
      if (info.event.start) goToDay(formatLocalDate(info.event.start))
      return
    }
    const event = events.find(e => e.id === info.event.id)
    if (event) setModal({ open: true, event })
  }

  // El modal ya se cerró (guardado optimista) cuando puede llegar el aviso de
  // conflicto — reabrirlo con la versión del servidor es la forma de aplicar
  // "cargar la versión actual" aquí (a diferencia de Notas, cuyo editor no se
  // cierra al guardar).
  function viewConflict() {
    if (!conflict) return
    setModal({ open: true, event: conflict })
    onDismissConflict()
  }

  function save(data: EventSavePayload, scope?: RecurrenceScope) {
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
      {conflict && (
        <div className="event-conflict-banner" role="alert">
          <span>Otra persona cambió «{conflict.title}» mientras lo editabas.</span>
          <button className="btn-secondary" onClick={viewConflict}>Ver cambios</button>
          <button className="btn-ghost btn-icon" onClick={onDismissConflict} aria-label="Descartar aviso">✕</button>
        </div>
      )}

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
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              // Seleccionable solo en vista día (crear arrastrando un hueco
              // de hora); en vista mes un clic en el día navega en vez de
              // seleccionar — ver handleDateClick/handleEventClick.
              selectable={false}
              views={{ timeGridDay: { selectable: true } }}
              selectMirror
              select={handleSelect}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              // El enlace "+N más" de un día con muchos eventos lleva a su
              // vista día, en vez de abrir el popover propio de FullCalendar
              // — mismo patrón que cualquier otro clic sobre el día.
              moreLinkClick="day"
              events={fcEvents}
              locale="es"
              locales={[esLocale]}
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              height="100%"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridDay',
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
