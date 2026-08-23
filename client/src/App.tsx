import { useCallback, useState } from 'react'
import RoomEntry from './features/auth/RoomEntry'
import Dashboard from './features/dashboard/Dashboard'
import type { Room, Event, List, ListItem, Note } from './types'

export default function App() {
  const [room, setRoom] = useState<Room | null>(null)
  const [initialEvents, setInitialEvents] = useState<Event[]>([])
  const [initialLists, setInitialLists] = useState<List[]>([])
  const [initialListItems, setInitialListItems] = useState<ListItem[]>([])
  const [initialNotes, setInitialNotes] = useState<Note[]>([])
  const [entryNotice, setEntryNotice] = useState<string | null>(null)

  // Identidad estable: Dashboard la usa como dependencia de un listener de
  // socket persistente y no debe re-registrarse en cada render.
  const handleLeave = useCallback((message?: string) => {
    setRoom(null)
    setEntryNotice(message ?? null)
  }, [])

  if (!room) {
    return (
      <RoomEntry
        notice={entryNotice}
        onEnter={(r, ev, lists, listItems, notes) => {
          setEntryNotice(null)
          setRoom(r)
          setInitialEvents(ev)
          setInitialLists(lists)
          setInitialListItems(listItems)
          setInitialNotes(notes)
        }}
      />
    )
  }

  return (
    <Dashboard
      room={room}
      initialEvents={initialEvents}
      initialLists={initialLists}
      initialListItems={initialListItems}
      initialNotes={initialNotes}
      onLeave={handleLeave}
      onUpdateRoom={setRoom}
    />
  )
}
