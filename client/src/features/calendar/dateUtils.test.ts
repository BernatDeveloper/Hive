import { describe, test, expect } from 'vitest'
import { addDaysToDateStr, isoToLocalDate, isoToLocalTime, dayOfWeekName, formatDateShort, buildEventDates, formatLocalDate, localDateKey } from './dateUtils'

describe('addDaysToDateStr', () => {
  test('cambio de mes hacia adelante', () => {
    expect(addDaysToDateStr('2026-01-31', 1)).toBe('2026-02-01')
  })

  test('cambio de año', () => {
    expect(addDaysToDateStr('2026-12-31', 1)).toBe('2027-01-01')
  })

  test('delta negativo cruza de mes hacia atrás', () => {
    expect(addDaysToDateStr('2026-03-01', -1)).toBe('2026-02-28')
  })

  test('año bisiesto: 29 de febrero existe', () => {
    expect(addDaysToDateStr('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('isoToLocalDate / isoToLocalTime', () => {
  test('round-trip: codifican y decodifican la misma fecha/hora local', () => {
    const d = new Date(2026, 5, 15, 14, 45) // 15 jun 2026, 14:45 hora local
    const iso = d.toISOString()
    expect(isoToLocalDate(iso)).toBe('2026-06-15')
    expect(isoToLocalTime(iso)).toBe('14:45')
  })

  test('rellena con ceros horas/minutos de un dígito', () => {
    const d = new Date(2026, 0, 5, 4, 5)
    expect(isoToLocalTime(d.toISOString())).toBe('04:05')
  })
})

describe('dayOfWeekName / formatDateShort', () => {
  test('parsea "YYYY-MM-DD" como fecha LOCAL, no UTC (evita el bug de off-by-one)', () => {
    // 2026-01-01 es jueves. Si se parseara con `new Date(str)` (UTC), en
    // zonas con offset negativo se leería como el día anterior (miércoles).
    expect(dayOfWeekName('2026-01-01')).toBe('jueves')
  })

  test('formatDateShort da "día de mes" en español', () => {
    expect(formatDateShort('2026-03-05')).toBe('5 de marzo')
  })
})

describe('formatLocalDate', () => {
  test('usa los componentes LOCALES del Date, no UTC', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  test('rellena mes y día con ceros', () => {
    expect(formatLocalDate(new Date(2026, 8, 3))).toBe('2026-09-03')
  })
})

describe('localDateKey', () => {
  test('evento de día completo ("YYYY-MM-DD" flotante): se usa tal cual', () => {
    expect(localDateKey('2026-06-15')).toBe('2026-06-15')
  })

  test('evento con hora (instante UTC "...Z"): se convierte al día local', () => {
    const iso = new Date(2026, 5, 15, 23, 30).toISOString() // 23:30 hora local
    expect(localDateKey(iso)).toBe('2026-06-15')
  })
})

describe('buildEventDates', () => {
  test('día completo, evento único: end es EXCLUSIVO (día siguiente al inclusivo del input)', () => {
    const { start, end } = buildEventDates({
      startDate: '2026-01-31', endDate: '2026-01-31',
      startTime: '09:00', endTime: '10:00',
      showTime: false, isRecurring: false,
    })
    expect(start).toBe('2026-01-31')
    expect(end).toBe('2026-02-01') // cruza de mes
  })

  test('con hora, evento único: start/end son instantes UTC que preservan la hora local', () => {
    const { start, end } = buildEventDates({
      startDate: '2026-06-15', endDate: '2026-06-15',
      startTime: '09:00', endTime: '10:30',
      showTime: true, isRecurring: false,
    })
    expect(isoToLocalDate(start)).toBe('2026-06-15')
    expect(isoToLocalTime(start)).toBe('09:00')
    expect(isoToLocalTime(end)).toBe('10:30')
  })

  test('serie recurrente con hora: el fin usa startDate + endTime, ignora endDate', () => {
    const { start, end } = buildEventDates({
      startDate: '2026-06-15', endDate: '2026-06-20', // endDate no debería importar
      startTime: '09:00', endTime: '10:30',
      showTime: true, isRecurring: true,
    })
    expect(isoToLocalDate(start)).toBe('2026-06-15')
    expect(isoToLocalDate(end)).toBe('2026-06-15')
    expect(isoToLocalTime(end)).toBe('10:30')
  })

  test('serie recurrente de día completo: el fin es la misma fecha de inicio (sin +1 día)', () => {
    const { start, end } = buildEventDates({
      startDate: '2026-06-15', endDate: '2026-06-20',
      startTime: '09:00', endTime: '10:00',
      showTime: false, isRecurring: true,
    })
    expect(start).toBe('2026-06-15')
    expect(end).toBe('2026-06-15')
  })
})
