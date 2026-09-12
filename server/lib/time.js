// Helpers de fecha/hora puros, sin dependencias. Compartidos por la zona
// horaria de sala (recordatorios) y por la concurrencia optimista (eventos,
// notas): ambas necesitan un testigo de versión monótono.

// Offset (ms) de una zona IANA en un instante UTC dado.
function tzOffsetMs(timeZone, utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(utcMs).map(x => [x.type, x.value]))
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUTC - utcMs
}

// Hora de pared ("YYYY-MM-DDTHH:mm[:ss]") interpretada EN `timeZone` → ms UTC.
export function zonedWallTimeToInstant(wall, timeZone) {
  const [d, t = '00:00'] = wall.split('T')
  const [Y, Mo, D] = d.split('-').map(Number)
  const [H, Mi, S = 0] = t.split(':').map(Number)
  const guess = Date.UTC(Y, Mo - 1, D, H, Mi, S)
  const off = tzOffsetMs(timeZone, guess)
  return guess - off // una iteración: correcto salvo ambigüedad en el salto DST
}

// Comprueba que `tz` es una zona IANA que Intl reconoce (rechaza vacíos,
// basura y valores absurdamente largos antes de tocar Intl).
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 60) return false
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// Testigo de versión estrictamente creciente para concurrencia optimista
// (notas y eventos únicos): dos guardados en el mismo milisegundo no pueden
// compartir sello, o el segundo pasaría por "vigente" cuando en realidad
// llegó después.
export function nextTimestamp(prev) {
  const now = new Date().toISOString()
  return now > prev ? now : new Date(new Date(prev).getTime() + 1).toISOString()
}
