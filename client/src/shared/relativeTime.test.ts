import { describe, test, expect } from 'vitest'
import { formatRelativeTime } from './relativeTime'

const NOW = new Date('2026-06-15T12:00:00.000Z').getTime()
const isoMinutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()

describe('formatRelativeTime', () => {
  test('menos de un minuto → "justo ahora"', () => {
    expect(formatRelativeTime(isoMinutesAgo(0.5), NOW)).toBe('justo ahora')
  })

  test('minutos, sin redondear hacia arriba', () => {
    expect(formatRelativeTime(isoMinutesAgo(5), NOW)).toBe('hace 5 min')
    expect(formatRelativeTime(isoMinutesAgo(59), NOW)).toBe('hace 59 min')
  })

  test('horas, con singular/plural correcto', () => {
    expect(formatRelativeTime(isoMinutesAgo(60), NOW)).toBe('hace 1 hora')
    expect(formatRelativeTime(isoMinutesAgo(180), NOW)).toBe('hace 3 horas')
    expect(formatRelativeTime(isoMinutesAgo(23 * 60), NOW)).toBe('hace 23 horas')
  })

  test('días, con singular/plural correcto', () => {
    expect(formatRelativeTime(isoMinutesAgo(24 * 60), NOW)).toBe('hace 1 día')
    expect(formatRelativeTime(isoMinutesAgo(3 * 24 * 60), NOW)).toBe('hace 3 días')
  })
})
