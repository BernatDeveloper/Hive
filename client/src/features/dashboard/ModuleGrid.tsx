import type { ReactNode } from 'react'
import './module-grid.css'

type ModuleId = 'calendar' | 'lists' | 'notes' | 'bookmarks'

interface Module {
  id: ModuleId
  icon: ReactNode
  title: string
  description: string
}

interface UpcomingModule {
  icon: ReactNode
  title: string
  description: string
}

const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)

const IconCheckSquare = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="9 11 12 14 22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
)

const IconFileText = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)

const IconBookmark = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>
)

const IconWallet = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 12V8a2 2 0 0 0-2-2H5a2 2 0 0 1 0-4h12"/>
    <path d="M3 5v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4"/>
    <path d="M21 12h-4a2 2 0 0 0 0 4h4z"/>
  </svg>
)

const MODULES: Module[] = [
  { id: 'calendar', icon: <IconCalendar />, title: 'Calendario', description: 'Eventos compartidos en tiempo real' },
  { id: 'lists', icon: <IconCheckSquare />, title: 'Listas', description: 'To-do, compra, planificación…' },
  { id: 'notes', icon: <IconFileText />, title: 'Notas', description: 'Bloc compartido de notas' },
  { id: 'bookmarks', icon: <IconBookmark />, title: 'Marcadores', description: 'Tutoriales, productos, artículos…' },
]

// Módulos anunciados pero aún sin construir: se muestran como tarjeta
// desactivada con la etiqueta "Próximamente" (no son botones, no navegan).
const UPCOMING: UpcomingModule[] = [
  { icon: <IconWallet />, title: 'Gastos', description: 'Control del dinero compartido' },
]

interface Props {
  onSelect: (id: ModuleId) => void
}

export default function ModuleGrid({ onSelect }: Props) {
  return (
    <div className="dashboard-grid-wrapper">
      <p className="dashboard-grid-title">Módulos</p>
      <div className="dashboard-grid">
        {MODULES.map(m => (
          <button
            key={m.id}
            className="module-card module-card--active"
            onClick={() => onSelect(m.id)}
          >
            <span className="module-icon">{m.icon}</span>
            <span className="module-title">{m.title}</span>
            <span className="module-desc">{m.description}</span>
          </button>
        ))}
        {UPCOMING.map(m => (
          <div key={m.title} className="module-card module-card--upcoming" aria-disabled="true">
            <span className="module-icon">{m.icon}</span>
            <span className="module-title">{m.title}</span>
            <span className="module-desc">{m.description}</span>
            <span className="module-badge">Próximamente</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export type { ModuleId }
