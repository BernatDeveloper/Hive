import { useState, useEffect, useRef } from 'react'
import './dashboard.css'
import { socket, forgetRoom } from '../../socket'
import type { Room, Event, List, ListItem, Note } from '../../types'
import { useIsMobile } from '../../hooks/useIsMobile'
import ModuleGrid from './ModuleGrid'
import type { ModuleId } from './ModuleGrid'
import Calendar from '../calendar/Calendar'
import Lists from '../lists/Lists'
import Notes from '../notes/Notes'
import RoomSettings from '../settings/RoomSettings'

interface Props {
  room: Room
  initialEvents: Event[]
  initialLists: List[]
  initialListItems: ListItem[]
  initialNotes: Note[]
  onLeave: (message?: string) => void
  onUpdateRoom: (room: Room) => void
}

const IconArrowLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
)

const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

function isColorDark(hex: string | null): boolean {
  if (!hex || hex.length < 7) return false
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

export default function Dashboard({ room, initialEvents, initialLists, initialListItems, initialNotes, onLeave, onUpdateRoom }: Props) {
  const [activeModule, setActiveModule] = useState<ModuleId | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [colors, setColors] = useState({
    primary_color: room.primary_color,
    background_color: room.background_color,
    text_color: room.text_color,
    sidebar_color: room.sidebar_color,
  })
  const [events, setEvents] = useState<Event[]>(initialEvents)
  const [lists, setLists] = useState<List[]>(initialLists)
  const [listItems, setListItems] = useState<ListItem[]>(initialListItems)
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const isMobile = useIsMobile()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onStyleUpdated(updatedRoom: Room) {
      setColors({
        primary_color: updatedRoom.primary_color,
        background_color: updatedRoom.background_color,
        text_color: updatedRoom.text_color,
        sidebar_color: updatedRoom.sidebar_color,
      })
      onUpdateRoom(updatedRoom)
    }
    socket.on('style-updated', onStyleUpdated)
    return () => { socket.off('style-updated', onStyleUpdated) }
  }, [onUpdateRoom])

  useEffect(() => {
    function onCreated(e: Event) { setEvents(prev => [...prev, e]) }
    function onUpdated(e: Event) { setEvents(prev => prev.map(ev => ev.id === e.id ? e : ev)) }
    function onDeleted(id: string) { setEvents(prev => prev.filter(ev => ev.id !== id)) }
    function onBatchCreated(batch: Event[]) { setEvents(prev => [...prev, ...batch]) }
    function onSeriesUpdated({ events: updated }: { events: Event[] }) {
      setEvents(prev => prev.map(e => updated.find(u => u.id === e.id) ?? e))
    }
    function onSeriesDeleted({ recurrence_id }: { recurrence_id: string }) {
      setEvents(prev => prev.filter(e => e.recurrence_id !== recurrence_id))
    }

    socket.on('event-created', onCreated)
    socket.on('event-updated', onUpdated)
    socket.on('event-deleted', onDeleted)
    socket.on('events-created', onBatchCreated)
    socket.on('series-updated', onSeriesUpdated)
    socket.on('series-deleted', onSeriesDeleted)
    return () => {
      socket.off('event-created', onCreated)
      socket.off('event-updated', onUpdated)
      socket.off('event-deleted', onDeleted)
      socket.off('events-created', onBatchCreated)
      socket.off('series-updated', onSeriesUpdated)
      socket.off('series-deleted', onSeriesDeleted)
    }
  }, [])

  // Re-sincronización tras reconexión: socket.ts re-emite join-room al
  // reconectar (ver rememberRoom/forgetRoom). Este listener persistente
  // captura esa respuesta (el access-granted inicial ya lo consumió
  // RoomEntry con socket.once) y refresca todo con la foto fresca del
  // servidor. Si la sala ya no existe (se limpió mientras el cliente
  // estaba desconectado), volvemos a la pantalla de entrada.
  useEffect(() => {
    function onGranted(payload: { room: Room; events: Event[]; lists: List[]; listItems: ListItem[]; notes: Note[] }) {
      setColors({
        primary_color: payload.room.primary_color,
        background_color: payload.room.background_color,
        text_color: payload.room.text_color,
        sidebar_color: payload.room.sidebar_color,
      })
      onUpdateRoom(payload.room)
      setEvents(payload.events)
      setLists(payload.lists)
      setListItems(payload.listItems)
      setNotes(payload.notes)
    }
    function onDenied() {
      forgetRoom()
      onLeave('La sala ya no está disponible. Puede que se haya eliminado por inactividad o que la contraseña haya cambiado.')
    }
    socket.on('access-granted', onGranted)
    socket.on('access-denied', onDenied)
    return () => {
      socket.off('access-granted', onGranted)
      socket.off('access-denied', onDenied)
    }
  }, [onUpdateRoom, onLeave])

  useEffect(() => {
    function onListCreated(list: List) { setLists(prev => [...prev, list]) }
    function onListDeleted(id: string) { setLists(prev => prev.filter(l => l.id !== id)) }
    function onItemCreated(item: ListItem) { setListItems(prev => [...prev, item]) }
    function onItemUpdated(item: ListItem) { setListItems(prev => prev.map(i => i.id === item.id ? item : i)) }
    function onItemDeleted(id: string) { setListItems(prev => prev.filter(i => i.id !== id)) }

    socket.on('list-created', onListCreated)
    socket.on('list-deleted', onListDeleted)
    socket.on('list-item-created', onItemCreated)
    socket.on('list-item-updated', onItemUpdated)
    socket.on('list-item-deleted', onItemDeleted)
    return () => {
      socket.off('list-created', onListCreated)
      socket.off('list-deleted', onListDeleted)
      socket.off('list-item-created', onItemCreated)
      socket.off('list-item-updated', onItemUpdated)
      socket.off('list-item-deleted', onItemDeleted)
    }
  }, [])

  useEffect(() => {
    function onNoteCreated(note: Note) { setNotes(prev => [note, ...prev]) }
    function onNoteUpdated(note: Note) { setNotes(prev => prev.map(n => n.id === note.id ? note : n)) }
    function onNoteDeleted(id: string) { setNotes(prev => prev.filter(n => n.id !== id)) }

    socket.on('note-created', onNoteCreated)
    socket.on('note-updated', onNoteUpdated)
    socket.on('note-deleted', onNoteDeleted)
    return () => {
      socket.off('note-created', onNoteCreated)
      socket.off('note-updated', onNoteUpdated)
      socket.off('note-deleted', onNoteDeleted)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const dark = isColorDark(colors.background_color)
  const cssVars = {
    '--primary': colors.primary_color ?? '#0071E3',
    '--bg': colors.background_color ?? '#F5F5F7',
    '--text': colors.text_color ?? '#1D1D1F',
    '--surface': colors.sidebar_color ?? '#FFFFFF',
    '--border': dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    '--surface-2': dark ? 'rgba(255,255,255,0.06)' : '#F2F2F7',
    '--muted': dark ? '#98989D' : '#6E6E73',
  } as React.CSSProperties

  const roomWithColors: Room = {
    ...room,
    primary_color: colors.primary_color,
    background_color: colors.background_color,
    text_color: colors.text_color,
    sidebar_color: colors.sidebar_color,
  }

  function openSettings() {
    setMenuOpen(false)
    setShowSettings(true)
  }

  function leave() {
    setMenuOpen(false)
    forgetRoom()
    onLeave()
  }

  return (
    <div className="dashboard" style={cssVars}>
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          {activeModule !== null && (
            <button
              className="btn-ghost btn-back-module"
              onClick={() => setActiveModule(null)}
              aria-label="Volver al dashboard"
            >
              <IconArrowLeft />
            </button>
          )}
          <span className="dashboard-room-name">{room.name}</span>
        </div>

        <div className="dashboard-header-right">
          {isMobile ? (
            <div className="hamburger-wrapper" ref={menuRef}>
              <button
                className="btn-hamburger"
                onClick={() => setMenuOpen(prev => !prev)}
                aria-label="Menú"
              >
                <span className={`hamburger-icon ${menuOpen ? 'hamburger-icon--open' : ''}`}>
                  <span /><span /><span />
                </span>
              </button>
              {menuOpen && (
                <div className="hamburger-menu">
                  <button onClick={openSettings}><IconSettings /> Ajustes</button>
                  <button onClick={leave}>Salir</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <button className="btn-ghost btn-icon" onClick={openSettings} aria-label="Ajustes">
                <IconSettings />
              </button>
              <button className="btn-secondary" onClick={leave}>Salir</button>
            </>
          )}
        </div>
      </header>

      <main className="dashboard-main">
        {activeModule === null && <ModuleGrid onSelect={setActiveModule} />}
        {activeModule === 'calendar' && (
          <Calendar
            room={room.name}
            events={events}
            primaryColor={colors.primary_color ?? '#0071E3'}
          />
        )}
        {activeModule === 'lists' && (
          <Lists room={room.name} lists={lists} listItems={listItems} />
        )}
        {activeModule === 'notes' && (
          <Notes room={room.name} notes={notes} />
        )}
      </main>

      {showSettings && (
        <RoomSettings room={roomWithColors} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
