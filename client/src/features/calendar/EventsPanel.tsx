import { useState } from 'react'
import type { Event, EventCategory } from '../../types'
import { CATEGORIES } from './categories'

interface Props {
  events: Event[]
  primaryColor?: string
  onNewEvent: () => void
  onEventClick: (event: Event) => void
}

type Filter = 'all' | EventCategory

const CAT_ENTRIES = Object.entries(CATEGORIES) as [EventCategory, (typeof CATEGORIES)[EventCategory]][]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function getDateLabel(dateStr: string): string {
  const date = dateStr.slice(0, 10)
  if (date === todayStr()) return 'Hoy'
  if (date === tomorrowStr()) return 'Mañana'
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

function getTimeStr(str: string): string {
  if (!str.includes('T')) return ''
  const t = str.slice(11, 16)
  return t === '00:00' ? '' : t
}

export default function EventsPanel({ events, primaryColor = '#0071E3', onNewEvent, onEventClick }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  const today = todayStr()
  const upcoming = events
    .filter(e => e.start.slice(0, 10) >= today)
    .filter(e => filter === 'all' || e.category === filter)
    .sort((a, b) => a.start.localeCompare(b.start))

  const grouped = new Map<string, Event[]>()
  for (const ev of upcoming) {
    const key = ev.start.slice(0, 10)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(ev)
  }

  return (
    <aside className="events-panel">
      <div className="events-panel-header">
        <span className="events-panel-title">Próximos</span>
        <button className="btn-primary events-panel-new" onClick={onNewEvent}>+ Nuevo</button>
      </div>

      <div className="events-panel-filters">
        <button
          className={`events-filter-chip${filter === 'all' ? ' events-filter-chip--on' : ''}`}
          onClick={() => setFilter('all')}
        >
          Todos
        </button>
        {CAT_ENTRIES.map(([key, cat]) => (
          <button
            key={key}
            className={`events-filter-chip${filter === key ? ' events-filter-chip--on' : ''}`}
            style={filter === key ? { background: cat.color, borderColor: cat.color, color: '#fff' } : {}}
            onClick={() => setFilter(filter === key ? 'all' : key)}
            title={cat.label}
          >
            {cat.icon}
          </button>
        ))}
      </div>

      <div className="events-panel-list">
        {grouped.size === 0 ? (
          <div className="events-panel-empty">Sin eventos próximos</div>
        ) : (
          Array.from(grouped.entries()).map(([dateKey, dayEvents]) => (
            <div key={dateKey} className="events-panel-day">
              <div className="events-panel-day-label">{getDateLabel(dateKey)}</div>
              {dayEvents.map(ev => {
                const dotColor = (!ev.category || ev.category === 'otro')
                  ? primaryColor
                  : CATEGORIES[ev.category].color
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
