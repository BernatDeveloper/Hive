import { useSyncExternalStore, type ReactNode } from 'react'
import { socket } from './client'
import { ConnectionContext, type ConnectionStatus } from './connection-context'

// Estado de la conexión como un store a nivel de módulo, no como useState +
// useEffect: los listeners se registran al IMPORTAR este archivo, antes del
// primer render. Con un efecto, React se suscribe después de pintar, y si el
// servidor conectaba en ese hueco (muy fácil en local) el evento `connect` se
// perdía: el estado se quedaba en 'connecting' para siempre y a los 3s salía
// el aviso "Sin conexión" estando conectado.
let status: ConnectionStatus = socket.connected ? 'connected' : 'connecting'
const listeners = new Set<() => void>()

function setStatus(next: ConnectionStatus) {
  if (next === status) return
  status = next
  for (const listener of listeners) listener()
}

socket.on('connect', () => setStatus('connected'))
socket.on('disconnect', () => setStatus('disconnected'))
socket.on('connect_error', () => setStatus('disconnected'))
socket.io.on('reconnect_attempt', () => setStatus('connecting'))

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const getSnapshot = () => status

// Expone el estado de la conexión por contexto (lo usa ConnectionBanner).
export function SocketProvider({ children }: { children: ReactNode }) {
  const current = useSyncExternalStore(subscribe, getSnapshot)
  return (
    <ConnectionContext.Provider value={current}>
      {children}
    </ConnectionContext.Provider>
  )
}
