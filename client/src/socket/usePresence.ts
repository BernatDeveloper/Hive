import { useEffect, useState } from 'react'
import { socket } from './client'
import type { PresencePerson } from '../types'

// Quién está conectado a la sala actual (identidad de dispositivo — nunca
// vacío mientras haya conexión: al menos uno mismo). El servidor emite
// `presence` al entrar/salir cualquiera.
export function usePresence(): PresencePerson[] {
  const [people, setPeople] = useState<PresencePerson[]>([])

  useEffect(() => {
    function onPresence(data: { people: PresencePerson[] }) { setPeople(data.people) }
    function onDisconnect() { setPeople([]) }
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

  return people
}
