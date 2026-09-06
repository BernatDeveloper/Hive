import { useEffect, useState } from 'react'
import { socket } from './client'

// Nº de dispositivos conectados a la sala actual (>= 1). El servidor emite
// `presence` al entrar/salir cualquiera.
export function usePresence() {
  const [count, setCount] = useState(1)

  useEffect(() => {
    function onPresence(data: { count: number }) { setCount(Math.max(1, data.count)) }
    function onDisconnect() { setCount(1) }
    function requestPresence() { socket.emit('get-presence') }

    socket.on('presence', onPresence)
    socket.on('disconnect', onDisconnect)
    socket.on('connect', requestPresence)
    requestPresence() // el broadcast tras access-granted pudo llegar antes de montar

    return () => {
      socket.off('presence', onPresence)
      socket.off('disconnect', onDisconnect)
      socket.off('connect', requestPresence)
    }
  }, [])

  return count
}
