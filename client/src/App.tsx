import { useState } from 'react'
import RoomEntry from './features/auth/RoomEntry'
import Dashboard from './features/dashboard/Dashboard'
import type { Room, Event, List, ListItem, Note } from './types'

export default function App() {
  const [room, setRoom] = useState<Room | null>(null)
  const [initialEvents, setInitialEvents] = useState<Event[]>([])
  const [initialLists, setInitialLists] = useState<List[]>([])
  const [initialListItems, setInitialListItems] = useState<ListItem[]>([])
  const [initialNotes, setInitialNotes] = useState<Note[]>([])

  if (!room) {
    return (
      <RoomEntry
        onEnter={(r, ev, lists, listItems, notes) => {
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
      onLeave={() => setRoom(null)}
      onUpdateRoom={setRoom}
    />
  )
}
