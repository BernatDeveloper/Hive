import { useEffect, useMemo, useRef, useState } from 'react'
import './calendar.css'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg, DatesSetArg, EventClickArg, EventDropArg, EventMountArg } from '@fullcalendar/core'
import type { DateClickArg, EventResizeDoneArg } from '@fullcalendar/interaction'
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

// Sustituye al texto "Todo el día" del eje de la vista día, que en un eje
// estrecho se partía en dos líneas. El nombre accesible y el tooltip se
// conservan.
const AllDayIcon = () => (
  <span className="calendar-allday" role="img" aria-label="Todo el día" title="Todo el día">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="4.9" y1="4.9" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.1" y2="19.1"/>
      <line x1="4.9" y1="19.1" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.1" y2="4.9"/>
    </svg>
  </span>
)

interface Props {
  events: Event[]
  primaryColor?: string
  conflict: Event | null
  onCreateEvent: (data: Partial<Event>) => void
  onUpdateEvent: (data: EventSavePayload, scope?: RecurrenceScope) => void
  onDeleteEvent: (id: string, scope?: RecurrenceScope) => void
  onDismissConflict: () => void
  // Abrir un evento desde fuera (búsqueda global): navega a su fecha y abre
  // el modal de edición. `onJumpHandled` limpia el "pedido" en el padre para
  // no reabrirlo en cada re-render.
  jumpToEvent?: Event | null
  onJumpHandled?: () => void
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

// Animación al soltar en otra celda (vista mes): mientras se arrastra, un clon
// flotante del evento sigue al cursor; al soltar en una celda válida
// FullCalendar lo borra al instante y pinta el evento en su celda nueva — un
// salto brusco desde donde se soltó. Se recuerda dónde estaba el clon y el
// evento real se desliza desde ahí hasta su sitio (técnica FLIP), igual que
// la vuelta animada de un arrastre que no cambia nada. En vista día no hace
// falta: allí la vista previa ya se dibuja en el destino, sin clon flotante.
const SETTLE_MS = 350

// FullCalendar no expone el id del evento en el DOM; lo etiquetamos para
// poder encontrar su elemento tras soltarlo.
function tagEventEl(arg: EventMountArg) {
  arg.el.dataset.eventId = arg.event.id
}

// El clon flotante que sigue al cursor (ElementMirror de FullCalendar):
// position fixed y visible. En vista día no existe o está oculto.
function findDragClone(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null
  return [...root.querySelectorAll<HTMLElement>('.fc-event-dragging')]
    .find(el => el.style.position === 'fixed' && el.style.display !== 'none') ?? null
}

function settleFrom(el: HTMLElement, from: { left: number; top: number }) {
  const to = el.getBoundingClientRect()
  const dx = from.left - to.left
  const dy = from.top - to.top
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
  // Por encima de las celdas posteriores mientras cruza la rejilla.
  const layer = el.closest<HTMLElement>('.fc-daygrid-event-harness') ?? el
  const prevZ = layer.style.zIndex
  layer.style.zIndex = '10'
  el.style.transition = 'none'
  el.style.transform = `translate(${dx}px, ${dy}px)`
  el.getBoundingClientRect() // fija la posición de partida antes de animar
  el.style.transition = `transform ${SETTLE_MS}ms ease`
  el.style.transform = ''
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    el.style.transition = ''
    layer.style.zIndex = prevZ
    el.removeEventListener('transitionend', finish)
  }
  el.addEventListener('transitionend', finish)
  // Respaldo por si `transitionend` no llega nunca (justo lo que dejaba
  // colgado el arrastre de FullCalendar — ver .fc .fc-event en calendar.css).
  setTimeout(finish, SETTLE_MS + 100)
}

export default function Calendar({ events, primaryColor = '#3B82F6', conflict, onCreateEvent, onUpdateEvent, onDeleteEvent, onDismissConflict, jumpToEvent, onJumpHandled }: Props) {
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [swipeDir, setSwipeDir] = useState<'next' | 'prev' | null>(null)
  const isMobile = useIsMobile()
  const calendarRef = useRef<FullCalendar>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  // Evita que el swipe de mes/día (más abajo) dispare navegación justo
  // después de soltar un evento arrastrado — se marca al empezar el
  // arrastre (bastante antes de soltar) y se resetea en el siguiente toque,
  // no en el "stop" del propio drag: FullCalendar procesa su propio drag en
  // el mismo touchend nativo, que llega ANTES que nuestro onTouchEnd de
  // React (delegado en la raíz), así que un reset ahí ya llegaría tarde.
  const draggingEventRef = useRef(false)
  // Dónde estaba el clon flotante en el instante de soltar (ver SETTLE_MS).
  const dropFromRef = useRef<{ left: number; top: number } | null>(null)

  // Resultado de la búsqueda global: salta a la vista día de ese evento y lo
  // abre para editar, como si se hubiera tocado en el calendario. Abrir el
  // modal es estado derivado de la prop (se aplica durante el render, mismo
  // patrón que el resto de la app); navegar la vista toca `calendarRef`
  // (imperativo) y por eso sigue en un efecto aparte.
  const [appliedJumpEventId, setAppliedJumpEventId] = useState<string | null>(null)
  if (jumpToEvent && jumpToEvent.id !== appliedJumpEventId) {
    setAppliedJumpEventId(jumpToEvent.id)
    setModal({ open: true, event: jumpToEvent })
  }

  useEffect(() => {
    if (!jumpToEvent) return
    calendarRef.current?.getApi().changeView('timeGridDay', localDateKey(jumpToEvent.start))
  }, [jumpToEvent])

  useEffect(() => {
    if (jumpToEvent) onJumpHandled?.()
  }, [jumpToEvent]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // FullCalendar no marca el botón "Hoy" como activo por su cuenta (no es un
  // selector de vista como Mes/Día) — lo hacemos a mano reutilizando la
  // misma clase que ya usa para esos dos, así hereda su estilo tal cual.
  function handleDatesSet(arg: DatesSetArg) {
    const btn = mainRef.current?.querySelector('.fc-today-button')
    if (!btn) return
    const now = new Date()
    const isToday = now >= arg.view.currentStart && now < arg.view.currentEnd
    btn.classList.toggle('fc-button-active', isToday)
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
    // Un toque que empieza sobre un evento nunca debe contar como swipe de
    // mes/día, aunque FullCalendar acabe sin reconocerlo como arrastre de
    // verdad (p. ej. soltarlo sin moverlo de celda) — eventDragStart es la
    // señal "sí hubo arrastre", esto cubre también el caso "lo intenté".
    draggingEventRef.current = !!(e.target as HTMLElement).closest?.('.fc-event')
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || draggingEventRef.current) return
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

  // Arrastrar un evento (con el ratón, o manteniéndolo pulsado en táctil —
  // `editable` activa ambos gestos en FullCalendar sin configuración
  // adicional) mueve su fecha/hora; redimensionar su borde cambia la
  // duración. Mismo payload que EventModal al editar: hace falta mandar el
  // evento entero (el servidor valida título/fechas), no solo lo que cambió.
  // Una instancia de serie se desengancha sola (`scope: 'single'`) en vez de
  // mover la serie entera sin preguntar — igual de antes-que-sorprender que
  // el resto de la app.
  // Devuelve si el cambio se aceptó (y se mandó al servidor).
  function commitEventChange(fcEvent: EventDropArg['event'], revert: () => void): boolean {
    const original = events.find(e => e.id === fcEvent.id)
    if (!original || !fcEvent.start) { revert(); return false }
    const allDay = fcEvent.allDay
    const start = allDay ? formatLocalDate(fcEvent.start) : fcEvent.start.toISOString()
    const endDate = fcEvent.end ?? fcEvent.start
    const end = allDay ? formatLocalDate(endDate) : endDate.toISOString()
    // Soltar en la misma celda o fuera de la rejilla ni siquiera llega aquí
    // (FullCalendar no dispara eventDrop sin mutación válida; ver el
    // comentario de `transition` en .fc .fc-event, calendar.css). Esto solo
    // cubre el caso raro de una celda distinta que acaba en las mismas
    // fechas: nada que guardar, y revert() cierra la interacción como
    // FullCalendar espera de cualquier eventDrop/eventResize no aceptado.
    if (start === original.start && end === original.end) { revert(); return false }
    const scope: RecurrenceScope | undefined = original.recurrence_id ? 'single' : undefined
    onUpdateEvent({
      id: original.id,
      title: original.title,
      start,
      end,
      description: original.description,
      color: original.color,
      recurrence_rule: original.recurrence_rule,
      recurrence_id: original.recurrence_id,
      reminder_offset: original.reminder_offset,
      ...(scope ? {} : { expected_updated_at: original.updated_at }),
    }, scope)
    return true
  }

  // Al empezar a arrastrar, escucha el "soltar" en fase de CAPTURA en window:
  // llega antes que los mouseup/touchend que FullCalendar escucha en
  // document, así que el clon flotante aún está donde lo soltó el usuario.
  function handleEventDragStart() {
    draggingEventRef.current = true
    dropFromRef.current = null
    const releaseEvents = ['pointerup', 'mouseup', 'touchend'] as const
    const capture = () => {
      for (const t of releaseEvents) window.removeEventListener(t, capture, true)
      const clone = findDragClone(mainRef.current)
      if (!clone) return
      const r = clone.getBoundingClientRect()
      dropFromRef.current = { left: r.left, top: r.top }
    }
    for (const t of releaseEvents) window.addEventListener(t, capture, true)
  }

  function handleEventDrop(info: EventDropArg) {
    const from = dropFromRef.current
    dropFromRef.current = null
    if (!commitEventChange(info.event, info.revert) || !from) return
    const id = info.event.id
    // FullCalendar pinta el evento en su celda nueva justo después de este
    // callback (microtarea); requestAnimationFrame va después de eso y antes
    // de que el navegador pinte — no se llega a ver el evento ya colocado.
    requestAnimationFrame(() => {
      const el = mainRef.current?.querySelector<HTMLElement>(
        `.fc-event[data-event-id="${CSS.escape(id)}"]:not(.fc-event-mirror):not(.fc-event-dragging)`
      )
      if (el) settleFrom(el, from)
    })
  }

  function handleEventResize(info: EventResizeDoneArg) {
    commitEventChange(info.event, info.revert)
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

  // Memoizado: el adaptador de React llama a calendar.resetOptions() en cada
  // render de Calendar, y FullCalendar compara `events` elemento a elemento
  // por identidad — sin memo, objetos nuevos en cada render le obligaban a
  // re-parsear todos los eventos aunque nada hubiera cambiado.
  const fcEvents = useMemo(() => events.map(e => {
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
  }), [events, primaryColor]) // eslint-disable-line react-hooks/exhaustive-deps

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
        ref={mainRef}
        className={`calendar-main${swipeDir ? ` calendar-swiping-${swipeDir}` : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onAnimationEnd={() => setSwipeDir(null)}
      >
        <FullCalendar
          ref={calendarRef}
          datesSet={handleDatesSet}
          // Color por defecto para cualquier "evento" sin color propio — la
          // vista previa (mirror) de seleccionar un hueco nuevo no tiene
          // evento real detrás, así que cae aquí. Los eventos reales siguen
          // mandando su propio color por evento (ver fcEvents más abajo),
          // que gana sobre esto — así el mirror de ARRASTRAR uno existente
          // en vista día ya no se pinta con el primario (antes forzado por
          // CSS en .fc-event-mirror, que no distinguía los dos casos).
          eventColor={primaryColor}
          eventTextColor={readableTextColor(primaryColor)}
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
          // Arrastrar para mover/redimensionar un evento (ratón o, en
          // táctil, mantener pulsado — gesto por defecto de FullCalendar,
          // sin configuración extra). `eventDragStart`/`eventResizeStart`
          // marcan `draggingEventRef` para que el swipe de mes/día (más
          // abajo) no dispare justo después de soltar.
          editable
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventDragStart={handleEventDragStart}
          eventResizeStart={() => { draggingEventRef.current = true }}
          eventDidMount={tagEventEl}
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
          allDayContent={() => <AllDayIcon />}
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
