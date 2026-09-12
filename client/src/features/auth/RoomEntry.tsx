import { useEffect, useRef, useState } from 'react'
import './auth.css'
import { socket, rememberRoom, forgetRoom, awaitAuthResponse } from '../../socket'
import type { Room, Event, List, ListItem, Note } from '../../types'
import HomeScreen from './HomeScreen'
import CreateRoomForm from './CreateRoomForm'
import JoinRoomForm from './JoinRoomForm'

interface Props {
  onEnter: (room: Room, events: Event[], lists: List[], listItems: ListItem[], notes: Note[]) => void
  notice?: string | null
}

type Mode = 'home' | 'create' | 'join'

interface AccessGranted {
  room: Room
  events: Event[]
  lists: List[]
  listItems: ListItem[]
  notes: Note[]
}

export default function RoomEntry({ onEnter, notice }: Props) {
  const [mode, setMode] = useState<Mode>('home')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const cancelRef = useRef<(() => void) | null>(null)

  // Al desmontar (o cambiar de pantalla) se abortan los listeners pendientes.
  useEffect(() => () => cancelRef.current?.(), [])

  function goTo(m: Mode) {
    cancelRef.current?.()
    setError('')
    setLoading(false)
    setMode(m)
  }

  function fail(msg: string) {
    setLoading(false)
    setError(msg)
  }

  function enter(name: string, password: string, payload: AccessGranted) {
    rememberRoom(name, password)
    onEnter(payload.room, payload.events, payload.lists, payload.listItems, payload.notes)
  }

  function handleCreate(name: string, password: string) {
    setLoading(true)
    setError('')

    cancelRef.current = awaitAuthResponse({
      'room-created': () => {
        // Segunda ronda: unirse a la sala recién creada (timeout propio).
        cancelRef.current = awaitAuthResponse({
          'access-granted': (payload) => enter(name, password, payload as AccessGranted),
          'access-denied': (msg) => fail(msg as string),
        }, fail)
        socket.emit('join-room', { name, password })
      },
      'room-error': (msg) => fail(msg as string),
    }, fail)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    socket.emit('create-room', { name, password, timezone })
  }

  function handleJoin(name: string, password: string) {
    setLoading(true)
    setError('')

    cancelRef.current = awaitAuthResponse({
      'access-granted': (payload) => enter(name, password, payload as AccessGranted),
      'access-denied': (msg) => { forgetRoom(); fail(msg as string) },
    }, fail)
    socket.emit('join-room', { name, password })
  }

  if (mode === 'home') {
    return <HomeScreen onCreate={() => goTo('create')} onJoin={() => goTo('join')} notice={notice} />
  }

  if (mode === 'create') {
    return (
      <CreateRoomForm
        onBack={() => goTo('home')}
        onSubmit={handleCreate}
        error={error}
        loading={loading}
      />
    )
  }

  return (
    <JoinRoomForm
      onBack={() => goTo('home')}
      onSubmit={handleJoin}
      error={error}
      loading={loading}
    />
  )
}
