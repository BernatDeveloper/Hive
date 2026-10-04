// Guarda por IP para el nivel de conexión: cuántos sockets abiertos, cuántas
// conexiones nuevas por minuto y baneo temporal tras demasiadas faltas.
// Todo en memoria (una sola instancia de servidor, como el resto de límites).
// `now` es inyectable para probarlo sin esperar.
export function createIpGuard({ maxConnections, handshakesPerMinute, strikesToBan, strikeWindowMs, banMs, now = Date.now }) {
  const open = new Map()        // ip → sockets abiertos
  const handshakes = new Map()  // ip → marcas de tiempo de las conexiones del último minuto
  const strikes = new Map()     // ip → marcas de tiempo de las faltas dentro de la ventana
  const bans = new Map()        // ip → instante en que termina el baneo

  const recent = (list, windowMs, t) => (list ?? []).filter(x => t - x < windowMs)

  function isBanned(ip) {
    const until = bans.get(ip)
    if (until === undefined) return false
    if (now() >= until) { bans.delete(ip); return false }
    return true
  }

  return {
    isBanned,

    // Se llama al empezar una conexión (antes de crearla). ok:true = se acepta
    // y queda anotada para el límite por minuto.
    check(ip) {
      const t = now()
      if (isBanned(ip)) return { ok: false, reason: 'banned' }
      if ((open.get(ip) ?? 0) >= maxConnections) return { ok: false, reason: 'too-many-connections' }
      const hs = recent(handshakes.get(ip), 60_000, t)
      if (hs.length >= handshakesPerMinute) {
        handshakes.set(ip, hs)
        return { ok: false, reason: 'too-many-requests' }
      }
      hs.push(t)
      handshakes.set(ip, hs)
      return { ok: true }
    },

    connected(ip) { open.set(ip, (open.get(ip) ?? 0) + 1) },
    disconnected(ip) {
      const n = (open.get(ip) ?? 0) - 1
      if (n > 0) open.set(ip, n)
      else open.delete(ip)
    },

    // Suma una falta. Devuelve true SOLO cuando esa falta dispara un baneo
    // nuevo (para que quien llama cierre los sockets de esa IP una vez).
    strike(ip) {
      const t = now()
      if (isBanned(ip)) return false
      const list = recent(strikes.get(ip), strikeWindowMs, t)
      list.push(t)
      if (list.length >= strikesToBan) {
        strikes.delete(ip)
        bans.set(ip, t + banMs)
        return true
      }
      strikes.set(ip, list)
      return false
    },

    // Barrido: descarta lo caducado para que los Map no crezcan sin límite.
    sweep() {
      const t = now()
      for (const [ip, until] of bans) if (t >= until) bans.delete(ip)
      for (const [ip, list] of handshakes) {
        const r = recent(list, 60_000, t)
        if (r.length === 0) handshakes.delete(ip)
        else handshakes.set(ip, r)
      }
      for (const [ip, list] of strikes) {
        const r = recent(list, strikeWindowMs, t)
        if (r.length === 0) strikes.delete(ip)
        else strikes.set(ip, r)
      }
    },
  }
}
