// "hace N min/horas/días" a partir de un ISO — usado para la atribución
// ("Editado por X · hace N min") en EventModal y Notes.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  if (diff < MINUTE) return 'justo ahora'
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE)
    return `hace ${m} min`
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR)
    return `hace ${h} hora${h === 1 ? '' : 's'}`
  }
  const d = Math.floor(diff / DAY)
  return `hace ${d} día${d === 1 ? '' : 's'}`
}
