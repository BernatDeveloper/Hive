import { useCallback, useState } from 'react'
import './app.css'
import RoomEntry from './features/auth/RoomEntry'
import Dashboard from './features/dashboard/Dashboard'
import { ConnectionBanner } from './socket'
import { useServiceWorkerUpdate } from './pwa'
import type { Room, Event, List, ListItem, Note } from './types'

export default function App() {
  const [room, setRoom] = useState<Room | null>(null)
  const { ready: updateReady, apply: applyUpdate } = useServiceWorkerUpdate()
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

  return (
    <>
      <ConnectionBanner />
      {updateReady && (
        <div className="update-banner" role="status">
          <span>Hay una versión nueva de la app.</span>
          <button className="btn-primary" onClick={applyUpdate}>Recargar</button>
        </div>
      )}
      {!room ? (
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
      ) : (
        <Dashboard
          room={room}
          initialEvents={initialEvents}
          initialLists={initialLists}
          initialListItems={initialListItems}
          initialNotes={initialNotes}
          onLeave={handleLeave}
          onUpdateRoom={setRoom}
        />
      )}
    </>
  )
}
