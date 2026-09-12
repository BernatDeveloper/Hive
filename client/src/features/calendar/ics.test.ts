import { describe, test, expect } from 'vitest'
import { eventsToICS } from './ics'
import type { Event } from '../../types'

function makeEvent(overrides: Partial<Event>): Event {
  return {
    id: 'id-1', room: 'sala', title: 'Evento', start: '2026-06-15', end: '2026-06-15',
    description: '', color: null, recurrence_rule: null, recurrence_id: null,
    reminder_offset: null, reminder_sent: 0,
    ...overrides,
  }
}

describe('eventsToICS', () => {
  test('evento de día completo: DTSTART/DTEND con VALUE=DATE, sin RRULE', () => {
    const ics = eventsToICS([makeEvent({ start: '2026-06-15', end: '2026-06-16' })], 'Mi calendario')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260615')
    expect(ics).toContain('DTEND;VALUE=DATE:20260616')
    expect(ics).not.toContain('RRULE')
  })

  test('evento con hora: DTSTART/DTEND en UTC ("...Z")', () => {
    const ics = eventsToICS([makeEvent({
      start: '2026-06-15T09:00:00.000Z', end: '2026-06-15T10:30:00.000Z',
    })], 'Mi calendario')
    expect(ics).toMatch(/DTSTART:20260615T090000Z/)
    expect(ics).toMatch(/DTEND:20260615T103000Z/)
  })

  test('agrupa por recurrence_id: una serie de N instancias produce un solo VEVENT con RRULE;COUNT=N', () => {
    const recurrence_id = 'rec-1'
    const events = [1, 2, 3].map(i => makeEvent({
      id: `ev-${i}`, start: `2026-06-${14 + i}`, end: `2026-06-${15 + i}`,
      recurrence_id, recurrence_rule: 'daily',
    }))
    const ics = eventsToICS(events, 'Mi calendario')
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1)
    expect(ics).toContain('RRULE:FREQ=DAILY;COUNT=3')
    // Usa el primer evento del grupo (orden por start) como representante.
    expect(ics).toContain('UID:ev-1@calendario-compartido')
  })

  test('eventos sueltos (sin recurrence_id) van cada uno en su propio VEVENT', () => {
    const events = [makeEvent({ id: 'a' }), makeEvent({ id: 'b', start: '2026-06-16', end: '2026-06-16' })]
    const ics = eventsToICS(events, 'Mi calendario')
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2)
  })

  test('escapa punto y coma, coma y salto de línea en título/descripción', () => {
    const ics = eventsToICS([makeEvent({ title: 'A; B, C', description: 'línea1\nlínea2' })], 'Cal')
    expect(ics).toContain('SUMMARY:A\\; B\\, C')
    expect(ics).toContain('DESCRIPTION:línea1\\nlínea2')
  })

  test('pliega (fold) líneas de más de 75 octetos con continuación indentada', () => {
    const longTitle = 'T'.repeat(120)
    const ics = eventsToICS([makeEvent({ title: longTitle })], 'Cal')
    const lines = ics.split('\r\n')
    const summaryStart = lines.findIndex(l => l.startsWith('SUMMARY:'))
    expect(summaryStart).toBeGreaterThanOrEqual(0)
    expect(lines[summaryStart].length).toBeLessThanOrEqual(75)
    expect(lines[summaryStart + 1].startsWith(' ')).toBe(true)
  })

  test('usa CRLF como separador de línea (RFC 5545)', () => {
    const ics = eventsToICS([makeEvent({})], 'Cal')
    expect(ics).toContain('\r\n')
    expect(ics.endsWith('\r\n')).toBe(true)
  })
})
