import { useState } from 'react'
import type { Event } from '../../types'

interface Props {
  events: Event[]
  primaryColor?: string
  paletteColors: string[]
  onNewEvent: () => void
  onEventClick: (event: Event) => void
}

// 'all' o un hex de la paleta de la sala.
type Filter = 'all' | string

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr() {
  return localDateStr(new Date())
}

function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return localDateStr(d)
}

// Evento con hora: guardado como instante UTC ("...Z"), hay que pasarlo a fecha/hora locales.
// Evento de día completo: fecha flotante "YYYY-MM-DD", se usa tal cual.
function localDateKey(str: string): string {
  return str.includes('T') ? localDateStr(new Date(str)) : str
}

function getDateLabel(dateKey: string): string {
  if (dateKey === todayStr()) return 'Hoy'
  if (dateKey === tomorrowStr()) return 'Mañana'
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

function getTimeStr(str: string): string {
  if (!str.includes('T')) return ''
  const d = new Date(str)
  const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return t === '00:00' ? '' : t
}

export default function EventsPanel({ events, primaryColor = '#0071E3', paletteColors, onNewEvent, onEventClick }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  // La paleta puede haber cambiado: si el color filtrado ya no existe, "Todos".
  const activeFilter = filter !== 'all' && !paletteColors.includes(filter) ? 'all' : filter

  const today = todayStr()
  const upcoming = events
    .filter(e => localDateKey(e.start) >= today)
    .filter(e => activeFilter === 'all' || e.color === activeFilter)
    .sort((a, b) => a.start.localeCompare(b.start))

  const grouped = new Map<string, Event[]>()
  for (const ev of upcoming) {
    const key = localDateKey(ev.start)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(ev)
  }

  return (
    <aside className="events-panel">
      <div className="events-panel-header">
        <span className="events-panel-title">Próximos</span>
        <button className="btn-primary events-panel-new" onClick={onNewEvent}>+ Nuevo</button>
      </div>

      {paletteColors.length > 0 && (
        <div className="events-panel-filters">
          <button
            className={`events-filter-chip${activeFilter === 'all' ? ' events-filter-chip--on' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todos
          </button>
          {paletteColors.map(c => (
            <button
              key={c}
              className={`events-filter-chip events-filter-chip--swatch${activeFilter === c ? ' events-filter-chip--on' : ''}`}
              style={{ background: c, borderColor: c }}
              onClick={() => setFilter(activeFilter === c ? 'all' : c)}
              title={`Filtrar por ${c}`}
              aria-label={`Filtrar por color ${c}`}
              aria-pressed={activeFilter === c}
            />
          ))}
        </div>
      )}

      <div className="events-panel-list">
        {grouped.size === 0 ? (
          <div className="events-panel-empty">Sin eventos próximos</div>
        ) : (
          Array.from(grouped.entries()).map(([dateKey, dayEvents]) => (
            <div key={dateKey} className="events-panel-day">
              <div className="events-panel-day-label">{getDateLabel(dateKey)}</div>
              {dayEvents.map(ev => {
                const dotColor = ev.color ?? primaryColor
                const time = getTimeStr(ev.start)
                return (
                  <button
                    key={ev.id}
                    className="events-panel-item"
                    onClick={() => onEventClick(ev)}
                  >
                    <span className="events-panel-dot" style={{ background: dotColor }} />
                    <span className="events-panel-item-info">
                      <span className="events-panel-item-title">{ev.title}</span>
                      <span className="events-panel-item-meta">
                        {time && <span>{time}</span>}
                        {ev.recurrence_id && <span className="events-panel-recur">🔄</span>}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
