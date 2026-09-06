import { socket } from './client'

export const CONNECTION_ERROR_MESSAGE =
  'No se puede conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.'

type Listeners = Record<string, (payload: unknown) => void>

// Espera la respuesta del servidor a un emit de auth. Registra los listeners
// `once` indicados + un timeout de red + `connect_error`. El primero que dispare
// hace cleanup de todos y ejecuta su callback; si es el timeout o `connect_error`,
// llama a `onNetworkError` con el mensaje de red. Devuelve `cancel()` para
// abortar manualmente (p. ej. al desmontar el componente).
export function awaitAuthResponse(
  listeners: Listeners,
  onNetworkError: (message: string) => void,
  timeoutMs = 8000,
): () => void {
  let settled = false

  const entries = Object.entries(listeners).map(([event, handler]) => {
    const wrapped = (payload: unknown) => { settle(); handler(payload) }
    socket.once(event, wrapped)
    return [event, wrapped] as const
  })

  const onConnectError = () => { settle(); onNetworkError(CONNECTION_ERROR_MESSAGE) }
  socket.on('connect_error', onConnectError)

  const timer = setTimeout(() => { settle(); onNetworkError(CONNECTION_ERROR_MESSAGE) }, timeoutMs)

  function settle() {
    if (settled) return
    settled = true
    clearTimeout(timer)
    for (const [event, wrapped] of entries) socket.off(event, wrapped)
    socket.off('connect_error', onConnectError)
  }

  return settle
}
