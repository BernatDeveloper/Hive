import { useEffect } from 'react'
import { socket, forgetRoom } from '../../socket'

// La sala ya no existe (limpiada por inactividad o contraseña cambiada mientras
// el cliente estaba desconectado): el servidor responde `access-denied` al
// re-`join-room` de la reconexión. Volvemos a la pantalla de entrada.
export function useRoomLost(onLeave: (message?: string) => void) {
  useEffect(() => {
    function onDenied() {
      forgetRoom()
      onLeave('La sala ya no está disponible. Puede que se haya eliminado por inactividad o que la contraseña haya cambiado.')
    }
    socket.on('access-denied', onDenied)
    return () => { socket.off('access-denied', onDenied) }
  }, [onLeave])
}
