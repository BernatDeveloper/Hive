import { useState } from 'react'
import '../../shared/modal.css'
import type { Event, RecurrenceRule, RecurrenceScope } from '../../types'
import { RECURRENCE_LABELS, RECURRENCE_OPTIONS, REMINDER_OPTIONS } from './options'
import { readableTextColor } from '../../shared/color'
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
  paletteColors: string[]
  primaryColor: string
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
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [h, m] = value.split(':')
  return (
    <div className="time-select">
      <select aria-label={`${label} — hora`} value={h} onChange={e => onChange(`${e.target.value}:${m}`)}>
        {HOURS.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span className="time-select-colon">:</span>
      <select aria-label={`${label} — minutos`} value={m} onChange={e => onChange(`${h}:${e.target.value}`)}>
        {MINUTES.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  )
}

export default function EventModal({ event, start, end, paletteColors, primaryColor, onSave, onDelete, onClose }: Props) {
  const isEdit = !!event?.id
  const isSeries = !!event?.recurrence_id

  const [title, setTitle] = useState(event?.title ?? '')
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{isEdit ? 'Editar evento' : 'Nuevo evento'}</h3>

        {/* Color swatches */}
        <div className="event-colors">
          <button
            type="button"
            className={`event-color-swatch${color === null ? ' event-color-swatch--on' : ''}`}
            style={{ background: primaryColor, color: readableTextColor(primaryColor) }}
            onClick={() => setColor(null)}
            aria-label="Color por defecto"
            aria-pressed={color === null}
          >
            {color === null && '✓'}
          </button>
          {paletteColors.map(c => (
            <button
              key={c}
              type="button"
              className={`event-color-swatch${color === c ? ' event-color-swatch--on' : ''}`}
              style={{ background: c, color: readableTextColor(c) }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
            >
              {color === c && '✓'}
            </button>
          ))}
        </div>

        {/* Title */}
        <input
          placeholder="Título *"
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus
        />

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
                  <input
                    type="month"
                    value={startDate.slice(0, 7)}
                    onChange={e => setStartDate(e.target.value + '-01')}
                  />
                </>
              ) : (
                <>
                  <label>
                    {recurrence === 'annual'  ? 'Día y mes' :
                     recurrence === 'monthly' ? 'Día del mes' :
                                                'Fecha de inicio'}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </>
              )
            ) : (
              /* Single event: start + end dates */
              <>
                <label>Fecha inicio</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
                <label>Fecha fin</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
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
            )}

            {/* Recurrence hint */}
            {isRecurring && hint && <p className="recur-hint">{hint}</p>}
          </>
        )}

        {/* Reminder */}
        <label>Recordatorio</label>
        <select
          value={reminderOffset === null ? 'none' : String(reminderOffset)}
          onChange={e => setReminderOffset(e.target.value === 'none' ? null : Number(e.target.value))}
        >
          {REMINDER_OPTIONS.map(opt => (
            <option key={opt.label} value={opt.value === null ? 'none' : String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Description */}
        <textarea
          placeholder="Descripción (opcional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
        />

        <div className="modal-actions">
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
