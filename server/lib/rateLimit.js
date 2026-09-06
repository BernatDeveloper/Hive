// Rate limiter de ventana deslizante, en memoria (suficiente para un proceso).
// createRateLimiter({ windowMs, max }) → check(key) → { allowed, retryAfterMs }.
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map() // key → timestamps[] dentro de la ventana

  function check(key) {
    const now = Date.now()
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs)
    recent.push(now)
    hits.set(key, recent)
    if (recent.length > max) {
      return { allowed: false, retryAfterMs: windowMs - (now - recent[0]) }
    }
    return { allowed: true, retryAfterMs: 0 }
  }

  // Barrido periódico: descarta claves cuya ventana ya expiró, para que el Map
  // no crezca sin límite.
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [key, times] of hits) {
      if (times.every(t => now - t >= windowMs)) hits.delete(key)
    }
  }, windowMs)
  sweep.unref?.()

  return check
}
