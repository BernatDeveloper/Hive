import { useState } from 'react'
import './auth.css'
import { socket } from '../../socket'
import type { Room, Event, List, ListItem, Note } from '../../types'
import HomeScreen from './HomeScreen'
import CreateRoomForm from './CreateRoomForm'
import JoinRoomForm from './JoinRoomForm'

interface Props {
  onEnter: (room: Room, events: Event[], lists: List[], listItems: ListItem[], notes: Note[]) => void
}

type Mode = 'home' | 'create' | 'join'

export default function RoomEntry({ onEnter }: Props) {
  const [mode, setMode] = useState<Mode>('home')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function goTo(m: Mode) {
    setError('')
    setLoading(false)
    setMode(m)
  }

  function handleCreate(name: string, password: string) {
    setLoading(true)
    setError('')

    function onRoomCreated() {
      socket.off('room-error', onRoomError)
      socket.emit('join-room', { name, password })
      socket.once('access-granted', ({ room, events, lists, listItems, notes }: { room: Room; events: Event[]; lists: List[]; listItems: ListItem[]; notes: Note[] }) => {
        onEnter(room, events, lists, listItems, notes)
      })
    }

    function onRoomError(msg: string) {
      socket.off('room-created', onRoomCreated)
      setLoading(false)
      setError(msg)
    }

    socket.once('room-created', onRoomCreated)
    socket.once('room-error', onRoomError)
    socket.emit('create-room', { name, password })
  }

  function handleJoin(name: string, password: string) {
    setLoading(true)
    setError('')

    function onAccess({ room, events, lists, listItems, notes }: { room: Room; events: Event[]; lists: List[]; listItems: ListItem[]; notes: Note[] }) {
      socket.off('access-denied', onDenied)
      onEnter(room, events, lists, listItems, notes)
    }

    function onDenied(msg: string) {
      socket.off('access-granted', onAccess)
      setLoading(false)
      setError(msg)
    }

    socket.once('access-granted', onAccess)
    socket.once('access-denied', onDenied)
    socket.emit('join-room', { name, password })
  }

  if (mode === 'home') {
    return <HomeScreen onCreate={() => goTo('create')} onJoin={() => goTo('join')} />
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
