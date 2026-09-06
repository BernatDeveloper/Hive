import { useEffect, useState, type ReactNode } from 'react'
import { socket } from './client'
import { ConnectionContext, type ConnectionStatus } from './connection-context'

// Rastrea el estado de la conexión y lo expone por contexto. Es la costura
// sobre la que se apoya la Tarea C (aviso de "sin conexión" + reintentos).
export function SocketProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>(
    socket.connected ? 'connected' : 'connecting'
  )

  useEffect(() => {
    function onConnect() { setStatus('connected') }
    function onDisconnect() { setStatus('disconnected') }
    function onConnectError() { setStatus('disconnected') }
    function onReconnectAttempt() { setStatus('connecting') }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.io.on('reconnect_attempt', onReconnectAttempt)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.io.off('reconnect_attempt', onReconnectAttempt)
    }
  }, [])

  return (
    <ConnectionContext.Provider value={status}>
      {children}
    </ConnectionContext.Provider>
  )
}
