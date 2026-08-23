import { useState } from 'react'
import '../../shared/modal.css'
import type { Event, EventCategory, RecurrenceRule } from '../../types'
import { CATEGORIES, RECURRENCE_LABELS, RECURRENCE_OPTIONS, REMINDER_OPTIONS } from './categories'

interface Props {
  event?: Partial<Event>
  start?: string
  end?: string
  onSave: (event: Partial<Event>) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function todayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Un evento con hora se guarda como instante UTC (ISO con "Z"); estas dos
// funciones lo vuelven a expresar en fecha/hora locales para los inputs.
function isoToLocalDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoToLocalTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dayOfWeekName(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long' })
}

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
}

const CAT_ENTRIES = Object.entries(CATEGORIES) as [EventCategory, (typeof CATEGORIES)[EventCategory]][]
const REC_ENTRIES = Object.entries(RECURRENCE_OPTIONS) as [RecurrenceRule, (typeof RECURRENCE_OPTIONS)[RecurrenceRule]][]

export default function EventModal({ event, start, end, onSave, onDelete, onClose }: Props) {
  const isEdit = !!event?.id
  const isSeries = !!event?.recurrence_id

  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [category, setCategory] = useState<EventCategory>(event?.category ?? 'otro')
  const [recurrence, setRecurrence] = useState<RecurrenceRule>('none')
  const [reminderOffset, setReminderOffset] = useState<number | null>(event?.reminder_offset ?? null)

  // Date state — shared by single and recurring modes
  const rawStart = event?.start ?? start ?? ''
  const rawEnd   = event?.end   ?? end   ?? ''
  const hasExistingTime = rawStart.includes('T')
  const [startDate, setStartDate] = useState(
    hasExistingTime ? isoToLocalDate(rawStart) : (rawStart.slice(0, 10) || todayDateStr())
  )
  const [endDate, setEndDate] = useState(
    hasExistingTime ? isoToLocalDate(rawEnd || rawStart) : (rawEnd.slice(0, 10) || rawStart.slice(0, 10) || todayDateStr())
  )
  const [startTime, setStartTime] = useState(hasExistingTime ? isoToLocalTime(rawStart) : '09:00')
  const [endTime,   setEndTime]   = useState(hasExistingTime ? isoToLocalTime(rawEnd || rawStart) : '10:00')
  const [showTime,  setShowTime]  = useState(hasExistingTime)

  const isRecurring  = !isEdit && recurrence !== 'none'
  const isMonthBased = recurrence === 'monthly-first' || recurrence === 'monthly-last'

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
        category,
        recurrence_rule: event?.recurrence_rule ?? null,
        recurrence_id:   event?.recurrence_id   ?? null,
        reminder_offset: reminderOffset,
      })
      return
    }
    if (!startDate) return
    if (showTime && startTime >= endTime) return

    // Con hora: instante real en UTC (ISO con "Z"). Día completo: fecha flotante, sin convertir.
    const build = (date: string, time: string) => showTime ? new Date(`${date}T${time}`).toISOString() : date
    const finalStart = build(startDate, startTime)
    const finalEnd   = isRecurring ? build(startDate, endTime) : build(endDate, endTime)

    onSave({
      id: event?.id,
      title: title.trim(),
      start: finalStart,
      end:   finalEnd,
      description: description.trim(),
      category,
      recurrence_rule: isEdit
        ? (event?.recurrence_rule ?? null)
        : (recurrence === 'none' ? null : recurrence),
      recurrence_id: event?.recurrence_id ?? null,
      reminder_offset: reminderOffset,
    })
  }

  const hint = recurrenceHint()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{isEdit ? 'Editar evento' : 'Nuevo evento'}</h3>

        {/* Category pills */}
        <div className="event-categories">
          {CAT_ENTRIES.map(([key, cat]) => {
            const isActive = category === key
            const isOtro   = key === 'otro'
            return (
              <button
                key={key}
                type="button"
                className={`event-cat-pill${isActive ? ' event-cat-pill--on' : ''}${isActive && isOtro ? ' event-cat-pill--none' : ''}`}
                style={isActive && !isOtro ? { background: cat.color, borderColor: cat.color } : {}}
                onClick={() => setCategory(key)}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            )
          })}
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
            🔄 <strong>{event?.recurrence_rule ? RECURRENCE_LABELS[event.recurrence_rule] : 'Serie'}</strong>
            <br />
            <small>Guardar y Eliminar afectan a <strong>todos</strong> los eventos de la serie.</small>
          </div>
        ) : (
          <>
            {/* Recurrence selector — only when creating */}
            {!isEdit && (
              <>
                <label>Repetición</label>
                <div className="recurrence-grid">
                  {REC_ENTRIES.map(([key, opt]) => (
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
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                  />
                </div>
                <div className="recur-time-field">
                  <label>A</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                  />
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
            <button className="btn-danger" onClick={() => onDelete(event!.id!)}>
              {isSeries ? 'Eliminar serie' : 'Eliminar'}
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
