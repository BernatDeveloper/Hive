// Cubo de fichas: permite ráfagas de hasta `capacity` mensajes y un ritmo
// sostenido de `refillPerSec`. Más adecuado que una ventana fija para tráfico
// humano a ráfagas (marcar varios ítems seguidos) que sí corta un bucle de script.
// `now` es inyectable para poder probarlo sin esperar.
export function createTokenBucket({ capacity, refillPerSec, now = Date.now }) {
  let tokens = capacity
  let last = now()

  return {
    // true = hay ficha (se consume); false = hay que descartar el mensaje.
    take(cost = 1) {
      const t = now()
      tokens = Math.min(capacity, tokens + ((t - last) / 1000) * refillPerSec)
      last = t
      if (tokens >= cost) {
        tokens -= cost
        return true
      }
      return false
    },
  }
}
