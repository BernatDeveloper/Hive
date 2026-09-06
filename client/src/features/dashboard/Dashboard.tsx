import { useState } from 'react'
import './dashboard.css'
import { forgetRoom } from '../../socket'
import type { Room, Event, List, ListItem, Note } from '../../types'
import ModuleGrid from './ModuleGrid'
import type { ModuleId } from './ModuleGrid'
import Calendar from '../calendar/Calendar'
import Lists from '../lists/Lists'
import Notes from '../notes/Notes'
import RoomSettings from '../settings/RoomSettings'
import { useRoomStyle } from '../settings/useRoomStyle'
import { useEvents } from '../calendar/useEvents'
import { useLists } from '../lists/useLists'
import { useNotes } from '../notes/useNotes'
import { useRoomLost } from './useRoomLost'

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

export default function Dashboard({ room, initialEvents, initialLists, initialListItems, initialNotes, onLeave, onUpdateRoom }: Props) {
  const [activeModule, setActiveModule] = useState<ModuleId | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const { colors, cssVars, roomWithColors, eventColors } = useRoomStyle(room, onUpdateRoom)
  const cal = useEvents(room.name, initialEvents)
  const lists = useLists(room.name, initialLists, initialListItems)
  const notes = useNotes(room.name, initialNotes)
  useRoomLost(onLeave)

  function leave() {
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
          <button className="btn-ghost btn-icon" onClick={() => setShowSettings(true)} aria-label="Ajustes">
            <IconSettings />
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {activeModule === null && <ModuleGrid onSelect={setActiveModule} />}
        {activeModule === 'calendar' && (
          <Calendar
            events={cal.events}
            primaryColor={colors.primary_color ?? '#0071E3'}
            paletteColors={eventColors}
            onCreateEvent={cal.createEvent}
            onUpdateEvent={cal.updateEvent}
            onDeleteEvent={cal.deleteEvent}
          />
        )}
        {activeModule === 'lists' && (
          <Lists
            lists={lists.lists}
            listItems={lists.listItems}
            onCreateList={lists.createList}
            onDeleteList={lists.deleteList}
            onCreateItem={lists.createItem}
            onToggleItem={lists.toggleItem}
            onDeleteItem={lists.deleteItem}
          />
        )}
        {activeModule === 'notes' && (
          <Notes
            notes={notes.notes}
            onCreateNote={notes.createNote}
            onUpdateNote={notes.updateNote}
            onDeleteNote={notes.deleteNote}
          />
        )}
      </main>

      {showSettings && (
        <RoomSettings room={roomWithColors} onClose={() => setShowSettings(false)} onLeave={leave} />
      )}
    </div>
  )
}
