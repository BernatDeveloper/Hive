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
import { readableTextColor } from '../../shared/color'
import { useIsMobile } from '../../hooks/useIsMobile'
import { formatLocalDate, localDateKey } from './dateUtils'

const IconPlus = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

interface Props {
  events: Event[]
  primaryColor?: string
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

// Deslizar hacia la izquierda/derecha cambia de mes (vista mes) o de día
// (vista día) — equivalente táctil de los botones "<"/">". Un gesto cuenta
// como swipe horizontal solo si se mueve más en X que en Y y supera el
// umbral; si no, se deja pasar tal cual (scroll vertical normal de la vista
// día, o un toque/clic que ya gestiona FullCalendar).
const SWIPE_THRESHOLD_PX = 50

export default function Calendar({ events, primaryColor = '#3B82F6', conflict, onCreateEvent, onUpdateEvent, onDeleteEvent, onDismissConflict }: Props) {
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [swipeDir, setSwipeDir] = useState<'next' | 'prev' | null>(null)
  const isMobile = useIsMobile()
  const calendarRef = useRef<FullCalendar>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

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
      // Sin `end`: EventModal lo hace caer a `start` (mismo día, inclusivo).
      // Pasar aquí `end: dateStr` sería el mismo día otra vez, pero
      // EventModal interpreta cualquier `end` de día completo como
      // EXCLUSIVO (igual que FullCalendar) y le resta un día — saldría el
      // día anterior al pulsado.
      setModal({ open: true, start: dateStr })
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

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < SWIPE_THRESHOLD_PX) return
    const api = calendarRef.current?.getApi()
    if (dx < 0) {
      api?.next()
      setSwipeDir('next')
    } else {
      api?.prev()
      setSwipeDir('prev')
    }
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

      <div
        className={`calendar-main${swipeDir ? ` calendar-swiping-${swipeDir}` : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onAnimationEnd={() => setSwipeDir(null)}
      >
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          // Seleccionable solo en vista día (crear arrastrando un hueco de
          // hora); en vista mes un clic en el día navega en vez de
          // seleccionar — ver handleDateClick/handleEventClick.
          selectable={false}
          views={{ timeGridDay: { selectable: true } }}
          selectMirror
          select={handleSelect}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          // El enlace "+N más" de un día con muchos eventos lleva a su vista
          // día, en vez de abrir el popover propio de FullCalendar — mismo
          // patrón que cualquier otro clic sobre el día.
          moreLinkClick="day"
          // Por defecto, en vista mes FullCalendar pinta los eventos CON
          // hora como "elemento de lista" (punto + texto, sin relleno) y
          // solo los de día completo como bloque de color. Forzamos bloque
          // siempre, para que el color se vea igual en mes y día.
          eventDisplay="block"
          // Si un día no tiene hueco para todos sus eventos, colapsa en un
          // enlace: "+N más" en escritorio, "···" en móvil (sin número, para
          // no competir por espacio en la celda).
          dayMaxEventRows
          moreLinkContent={isMobile ? () => '···' : undefined}
          events={fcEvents}
          locale="es"
          locales={[esLocale]}
          // Solo el título en la etiqueta del evento, con o sin hora — la
          // posición en la rejilla de la vista día ya transmite la hora, y
          // en vista mes solo añadía ruido.
          displayEventTime={false}
          // En móvil, "diciembre de 2026" no cabe en una línea junto a los
          // botones del header y se parte en dos, descuadrando todo el
          // toolbar — una versión corta ("dic 2026") siempre cabe.
          titleFormat={isMobile ? { month: 'short', year: 'numeric' } : { month: 'long', year: 'numeric' }}
          height="100%"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridDay',
          }}
          buttonText={{ today: 'Hoy' }}
        />

        <button
          type="button"
          className="calendar-fab"
          onClick={() => setModal({ open: true })}
          aria-label="Nuevo evento"
        >
          <IconPlus />
        </button>
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
