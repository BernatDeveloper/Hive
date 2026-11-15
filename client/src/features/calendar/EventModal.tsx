import { useState } from 'react'
import '../../shared/modal.css'
import type { Event, RecurrenceRule, RecurrenceScope } from '../../types'
import { RECURRENCE_LABELS, RECURRENCE_OPTIONS, REMINDER_OPTIONS } from './options'
import { formatRelativeTime } from '../../shared/relativeTime'
import ColorPickerPopover from '../../shared/ColorPickerPopover'
import type { ColorOption } from '../../shared/ColorPickerPopover'
import { EVENT_COLORS } from './eventColors'
import { useSwipeToDismiss } from '../../shared/useSwipeToDismiss'
import SelectPopover from '../../shared/SelectPopover'
import {
  todayDateStr, addDaysToDateStr, isoToLocalDate, isoToLocalTime,
  dayOfWeekName, formatDateShort, buildEventDates,
} from './dateUtils'

// Payload de guardado de un evento único existente: además de los campos del
// evento, lleva la versión sobre la que se abrió el modal, para que el
// servidor pueda detectar una edición concurrente (ver useEvents/Calendar).
export type EventSavePayload = Partial<Event> & { expected_updated_at?: string }

interface Props {
  event?: Partial<Event>
  start?: string
  end?: string
  onSave: (event: EventSavePayload, scope?: RecurrenceScope) => void
  onDelete: (id: string, scope?: RecurrenceScope) => void
  onClose: () => void
}

const SCOPE_OPTIONS: { value: RecurrenceScope; label: string }[] = [
  { value: 'single', label: 'Solo este' },
  { value: 'future', label: 'Este y los siguientes' },
  { value: 'all', label: 'Toda la serie' },
]

const REC_ENTRIES = Object.entries(RECURRENCE_OPTIONS) as [RecurrenceRule, (typeof RECURRENCE_OPTIONS)[RecurrenceRule]][]

// Selector de hora en 24h propio: el <input type="time"> nativo muestra
// AM/PM o 24h según el idioma/región del sistema operativo, algo que no se
// puede forzar de forma fiable desde la web — así queda garantizado siempre.
const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: String(i).padStart(2, '0'), label: String(i).padStart(2, '0') }))
const MINUTES = Array.from({ length: 60 }, (_, i) => ({ value: String(i).padStart(2, '0'), label: String(i).padStart(2, '0') }))

function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [h, m] = value.split(':')
  return (
    <div className="time-select">
      <SelectPopover options={HOURS} value={h} onChange={v => onChange(`${v}:${m}`)} triggerLabel={`${label} — hora`} />
      <span className="time-select-colon">:</span>
      <SelectPopover options={MINUTES} value={m} onChange={v => onChange(`${h}:${v}`)} triggerLabel={`${label} — minutos`} />
    </div>
  )
}

const IconCalendar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)

// El texto de <input type="date"/"month"> nativo lo formatea el navegador
// según SU locale (a menudo inglés, mm/dd/aaaa) — ni `lang="es"` en el HTML
// ni nada en CSS lo fuerza de forma fiable (mismo motivo por el que el
// selector de hora es propio, no un <input type="time">). Se deja el valor
// (ISO, YYYY-MM-DD/YYYY-MM) invisible pero intacto, y se superpone el texto
// ya formateado en dd/mm/aaaa — el click sigue cayendo en el campo nativo
// (abre su selector/calendario), solo cambia lo que se lee.
function formatDateDisplay(type: 'date' | 'month', value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m) return ''
  return type === 'month' ? `${m}/${y}` : (d ? `${d}/${m}/${y}` : '')
}

// <input type="date"/"month"> nativo: el icono del calendario es un SVG fijo
// del navegador que no se puede recolorear a un hex arbitrario. Se oculta
// (opacidad 0, pero sigue ahí y es clicable) y se superpone un icono propio
// coloreado con var(--text), alineado al mismo hueco (ver .date-field en
// calendar.css, que fija tamaño/margen del indicador nativo para que
// coincida exactamente con la posición del icono superpuesto).
function DateField({ type, value, onChange }: { type: 'date' | 'month'; value: string; onChange: (v: string) => void }) {
  return (
    <div className="date-field">
      <input type={type} value={value} onChange={e => onChange(e.target.value)} />
      <span className="date-field-value" aria-hidden="true">{formatDateDisplay(type, value)}</span>
      <span className="date-field-icon"><IconCalendar /></span>
    </div>
  )
}

export default function EventModal({ event, start, end, onSave, onDelete, onClose }: Props) {
  const isEdit = !!event?.id
  const isSeries = !!event?.recurrence_id
  const swipe = useSwipeToDismiss(onClose)

  const [title, setTitle] = useState(event?.title ?? '')
  // Solo se activan al intentar guardar sin arreglar el problema — se
  // desactivan solas en cuanto el dato deja de ser inválido (ver JSX), no
  // hace falta limpiarlas a mano en cada onChange.
  const [titleTouched, setTitleTouched] = useState(false)
  const [timeTouched, setTimeTouched] = useState(false)
  const [description, setDescription] = useState(event?.description ?? '')
  const [color, setColor] = useState<string | null>(event?.color ?? null)
  const [recurrence, setRecurrence] = useState<RecurrenceRule>('none')
  const [scope, setScope] = useState<RecurrenceScope>('all')
  const [reminderOffset, setReminderOffset] = useState<number | null>(event?.reminder_offset ?? null)

  // Date state — shared by single and recurring modes
  const rawStart = event?.start ?? start ?? ''
  const rawEnd   = event?.end   ?? end   ?? ''
  const hasExistingTime = rawStart.includes('T')
  const [startDate, setStartDate] = useState(
    hasExistingTime ? isoToLocalDate(rawStart) : (rawStart.slice(0, 10) || todayDateStr())
  )
  const [endDate, setEndDate] = useState(() => {
    if (hasExistingTime) return isoToLocalDate(rawEnd || rawStart)
    const rawEndDate = rawEnd.slice(0, 10)
    // FullCalendar da/espera el fin de los eventos de día completo como
    // fecha EXCLUSIVA (el día siguiente al último día); en el input se
    // muestra el último día real (inclusivo), por eso restamos uno aquí.
    if (!rawEndDate) return rawStart.slice(0, 10) || todayDateStr()
    return addDaysToDateStr(rawEndDate, -1)
  })
  const [startTime, setStartTime] = useState(hasExistingTime ? isoToLocalTime(rawStart) : '09:00')
  const [endTime,   setEndTime]   = useState(hasExistingTime ? isoToLocalTime(rawEnd || rawStart) : '10:00')
  const [showTime,  setShowTime]  = useState(hasExistingTime)

  const isRecurring  = !isEdit && recurrence !== 'none'
  const isMonthBased = recurrence === 'monthly-first' || recurrence === 'monthly-last'
  const recurrenceOn = recurrence !== 'none'

  function toggleRecurrence() {
    setRecurrence(prev => prev === 'none' ? 'daily' : 'none')
  }

  function recurrenceHint(): string {
    if (!isRecurring || !startDate) return ''
    const dom = parseInt(startDate.split('-')[2])
    switch (recurrence) {
      case 'daily':         return 'Todos los días durante 1 año.'
      case 'weekly':        return `Cada ${dayOfWeekName(startDate)} durante 2 años.`
      case 'monthly':       return `El día ${dom} de cada mes durante 3 años.`
      case 'monthly-first': return 'El primer día de cada mes durante 3 años.'
      case 'monthly-last':  return 'El último día de cada mes durante 3 años.'
      case 'annual':        return `El ${formatDateShort(startDate)} de cada año durante 10 años.`
      default: return ''
    }
  }

  function save() {
    setTitleTouched(true)
    if (!title.trim()) return
    if (isSeries) {
      onSave({
        id: event?.id,
        title: title.trim(),
        start: event!.start,
        end:   event!.end,
        description: description.trim(),
        color,
        recurrence_rule: event?.recurrence_rule ?? null,
        recurrence_id:   event?.recurrence_id   ?? null,
        reminder_offset: reminderOffset,
      }, scope)
      return
    }
    if (!startDate) return
    setTimeTouched(true)
    if (showTime && startTime >= endTime) return

    const { start: finalStart, end: finalEnd } = buildEventDates({ startDate, endDate, startTime, endTime, showTime, isRecurring })

    onSave({
      id: event?.id,
      title: title.trim(),
      start: finalStart,
      end:   finalEnd,
      description: description.trim(),
      color,
      recurrence_rule: isEdit
        ? (event?.recurrence_rule ?? null)
        : (recurrence === 'none' ? null : recurrence),
      recurrence_id: event?.recurrence_id ?? null,
      reminder_offset: reminderOffset,
      // Solo tiene sentido al editar (no hay versión previa que proteger al
      // crear). El servidor la ignora si el evento resulta ser parte de una
      // serie (esas ramas siguen en last-write-wins).
      ...(isEdit ? { expected_updated_at: event?.updated_at } : {}),
    })
  }

  const hint = recurrenceHint()
  const showTitleError = titleTouched && !title.trim()
  const showTimeError = timeTouched && showTime && startTime >= endTime

  // Paleta fija de colores de evento (igual para todas las salas, sin
  // personalización) + "Por defecto" para heredar el primario de la sala.
  const colorOptions: ColorOption[] = [{ value: null, name: 'Por defecto' }, ...EVENT_COLORS]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={swipe.style} onClick={e => e.stopPropagation()}>
        <div className="modal-drag-handle" {...swipe.handleProps} />
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3>{isEdit ? 'Editar evento' : 'Nuevo evento'}</h3>

        {isEdit && event?.last_editor_name && (
          <p className="event-attribution">
            Editado por <strong>{event.last_editor_name}</strong>
            {event.updated_at && <> · {formatRelativeTime(event.updated_at)}</>}
          </p>
        )}

        {/* Color */}
        <ColorPickerPopover
          options={colorOptions}
          value={color}
          onChange={setColor}
          triggerLabel="Elegir color del evento"
        />

        {/* Title */}
        <input
          placeholder="Título *"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={showTitleError ? 'input-error' : undefined}
          aria-invalid={showTitleError}
          autoFocus
        />
        {showTitleError && <p className="field-error">El título es obligatorio.</p>}

        {/* Date / recurrence section */}
        {isSeries ? (
          <div className="event-series-notice">
            <div className="event-series-head">
              🔄 <strong>{event?.recurrence_rule ? RECURRENCE_LABELS[event.recurrence_rule] : 'Serie'}</strong>
            </div>
            <small>Aplicar cambios a:</small>
            <div className="event-scope">
              {SCOPE_OPTIONS.map(opt => (
                <label key={opt.value} className={`event-scope-opt${scope === opt.value ? ' event-scope-opt--on' : ''}`}>
                  <input
                    type="radio"
                    name="event-scope"
                    checked={scope === opt.value}
                    onChange={() => setScope(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Recurrence toggle — only when creating */}
            {!isEdit && (
              <>
                <div className="modal-toggle-row">
                  <label>Repetición</label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={recurrenceOn}
                    className={`toggle-switch${recurrenceOn ? ' toggle-switch--on' : ''}`}
                    onClick={toggleRecurrence}
                    aria-label="Activar repetición"
                  >
                    <span className="toggle-switch-thumb" />
                  </button>
                </div>
                {recurrenceOn && (
                  <div className="recurrence-grid">
                    {REC_ENTRIES.filter(([key]) => key !== 'none').map(([key, opt]) => (
                      <button
                        key={key}
                        type="button"
                        className={`rec-opt${recurrence === key ? ' rec-opt--on' : ''}`}
                        onClick={() => setRecurrence(key)}
                      >
                        <span className="rec-opt-label">{opt.label}</span>
                        {opt.sub && <span className="rec-opt-sub">{opt.sub}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Date fields */}
            {isRecurring ? (
              /* Recurring: single date or month picker */
              isMonthBased ? (
                <>
                  <label>Mes de inicio</label>
                  <DateField
                    type="month"
                    value={startDate.slice(0, 7)}
                    onChange={v => setStartDate(v + '-01')}
                  />
                </>
              ) : (
                <>
                  <label>
                    {recurrence === 'annual'  ? 'Día y mes' :
                     recurrence === 'monthly' ? 'Día del mes' :
                                                'Fecha de inicio'}
                  </label>
                  <DateField type="date" value={startDate} onChange={setStartDate} />
                </>
              )
            ) : (
              /* Single event: start + end dates */
              <>
                <label>Fecha inicio</label>
                <DateField type="date" value={startDate} onChange={setStartDate} />
                <label>Fecha fin</label>
                <DateField type="date" value={endDate} onChange={setEndDate} />
              </>
            )}

            {/* Time toggle + time inputs */}
            <button
              type="button"
              className="time-toggle"
              onClick={() => setShowTime(v => !v)}
            >
              {showTime ? '✕ Quitar hora' : '+ Añadir hora'}
            </button>

            {showTime && (
              <>
                <div className="recur-time-row">
                  <div className="recur-time-field">
                    <label>De</label>
                    <TimeSelect label="De" value={startTime} onChange={setStartTime} />
                  </div>
                  <div className="recur-time-field">
                    <label>A</label>
                    <TimeSelect label="A" value={endTime} onChange={setEndTime} />
                  </div>
                </div>
                {showTimeError && <p className="field-error">La hora de fin debe ser posterior a la de inicio.</p>}
              </>
            )}

            {/* Recurrence hint */}
            {isRecurring && hint && <p className="recur-hint">{hint}</p>}
          </>
        )}

        {/* Reminder */}
        <label>Recordatorio</label>
        <SelectPopover
          options={REMINDER_OPTIONS}
          value={reminderOffset}
          onChange={setReminderOffset}
          triggerLabel="Recordatorio"
        />

        {/* Description */}
        <textarea
          placeholder="Descripción (opcional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
        />

        <div className="modal-actions modal-actions--stacked">
          <button className="btn-primary" onClick={save}>Guardar</button>
          {isEdit && (
            <button
              className="btn-danger"
              onClick={() => onDelete(event!.id!, isSeries ? scope : undefined)}
            >
              {isSeries
                ? (scope === 'single' ? 'Eliminar este' : scope === 'future' ? 'Eliminar estos' : 'Eliminar serie')
                : 'Eliminar'}
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
