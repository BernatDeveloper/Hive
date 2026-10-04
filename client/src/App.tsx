import { useCallback, useEffect, useState } from 'react'
import './app.css'
import './features/auth/auth.css'
import RoomEntry from './features/auth/RoomEntry'
import Dashboard from './features/dashboard/Dashboard'
import { ConnectionBanner, socket, rememberRoom, forgetRoom, getStoredRoom, awaitAuthResponse, buildJoinPayload } from './socket'
import { useServiceWorkerUpdate } from './pwa'
import type { Room, Event, List, ListItem, Note, Bookmark } from './types'

interface AccessGranted {
  room: Room
  events: Event[]
  lists: List[]
  listItems: ListItem[]
  notes: Note[]
  bookmarks: Bookmark[]
}

export default function App() {
  const [room, setRoom] = useState<Room | null>(null)
  const { ready: updateReady, apply: applyUpdate } = useServiceWorkerUpdate()
  const [initialEvents, setInitialEvents] = useState<Event[]>([])
  const [initialLists, setInitialLists] = useState<List[]>([])
  const [initialListItems, setInitialListItems] = useState<ListItem[]>([])
  const [initialNotes, setInitialNotes] = useState<Note[]>([])
  const [initialBookmarks, setInitialBookmarks] = useState<Bookmark[]>([])
  const [entryNotice, setEntryNotice] = useState<string | null>(null)
  // Sala guardada de una visita anterior (leída UNA sola vez, al montar) — si
  // existe, reintenta entrar sola antes de mostrar la pantalla de inicio, así
  // una recarga no obliga a volver a teclear nombre + contraseña.
  // 'checking' solo dura lo que tarda la respuesta del servidor.
  const [storedRoom] = useState(() => getStoredRoom())
  const [checkingStoredRoom, setCheckingStoredRoom] = useState(() => storedRoom !== null)

  // Identidad estable: Dashboard la usa como dependencia de un listener de
  // socket persistente y no debe re-registrarse en cada render.
  const handleLeave = useCallback((message?: string) => {
    setRoom(null)
    setEntryNotice(message ?? null)
  }, [])

  useEffect(() => {
    if (!storedRoom) return

    const cancel = awaitAuthResponse({
      'access-granted': (payload) => {
        const p = payload as AccessGranted
        rememberRoom(storedRoom.name, storedRoom.password)
        setRoom(p.room)
        setInitialEvents(p.events)
        setInitialLists(p.lists)
        setInitialListItems(p.listItems)
        setInitialNotes(p.notes)
        setInitialBookmarks(p.bookmarks)
        setCheckingStoredRoom(false)
      },
      'access-denied': (msg) => {
        forgetRoom()
        setEntryNotice(typeof msg === 'string' ? msg : null)
        setCheckingStoredRoom(false)
      },
    }, () => {
      // Sin respuesta de red: puede ser un corte temporal, no una sala
      // inválida — se deja la sala guardada intacta y simplemente se
      // muestra la pantalla de entrada normal (el usuario puede reintentar).
      setCheckingStoredRoom(false)
    })
    socket.emit('join-room', buildJoinPayload(storedRoom.name, storedRoom.password))
    return cancel
  }, [storedRoom])

  if (checkingStoredRoom) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <p className="auth-subtitle-hero">Entrando a tu sala…</p>
        </div>
      </div>
    )
  }

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
          onEnter={(r, ev, lists, listItems, notes, bookmarks) => {
            setEntryNotice(null)
            setRoom(r)
            setInitialEvents(ev)
            setInitialLists(lists)
            setInitialListItems(listItems)
            setInitialNotes(notes)
            setInitialBookmarks(bookmarks)
          }}
        />
      ) : (
        <Dashboard
          room={room}
          initialEvents={initialEvents}
          initialLists={initialLists}
          initialListItems={initialListItems}
          initialNotes={initialNotes}
          initialBookmarks={initialBookmarks}
          onLeave={handleLeave}
          onUpdateRoom={setRoom}
        />
      )}
    </>
  )
}
