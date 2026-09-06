import type { Event } from '../../types'

// RRULE (RFC 5545) por cada regla de recurrencia del proyecto. COUNT lo pone
// eventsToICS según el tamaño del grupo.
const RRULE_FREQ: Record<string, string> = {
  daily: 'FREQ=DAILY',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  'monthly-first': 'FREQ=MONTHLY;BYMONTHDAY=1',
  'monthly-last': 'FREQ=MONTHLY;BYMONTHDAY=-1',
  annual: 'FREQ=YEARLY',
}

const pad = (n: number) => String(n).padStart(2, '0')

function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// Evento con hora: guardado como instante UTC ISO ("...Z"). Día completo:
// "YYYY-MM-DD" (DTEND en iCal es exclusivo, igual que lo guarda FullCalendar).
function icsDateLines(ev: Event): string[] {
  if (ev.start.includes('T')) {
    return [`DTSTART:${utcStamp(new Date(ev.start))}`, `DTEND:${utcStamp(new Date(ev.end))}`]
  }
  return [
    `DTSTART;VALUE=DATE:${ev.start.replace(/-/g, '')}`,
    `DTEND;VALUE=DATE:${ev.end.replace(/-/g, '')}`,
  ]
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// RFC 5545: líneas <= 75 octetos, continuación con un espacio inicial.
function fold(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 0) {
    chunks.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  return chunks.join('\r\n')
}

export function eventsToICS(events: Event[], calName: string): string {
  const dtstamp = utcStamp(new Date())

  // Agrupa por recurrence_id; los eventos sueltos van cada uno en su grupo.
  const groups = new Map<string, Event[]>()
  for (const ev of events) {
    const key = ev.recurrence_id ?? `one:${ev.id}`
    const group = groups.get(key)
    if (group) group.push(ev)
    else groups.set(key, [ev])
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendario Compartido//ES',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ]

  for (const group of groups.values()) {
    group.sort((a, b) => a.start.localeCompare(b.start))
    const first = group[0]
    const freq = first.recurrence_id && first.recurrence_rule ? RRULE_FREQ[first.recurrence_rule] : null

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${first.id}@calendario-compartido`)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(...icsDateLines(first))
    if (freq) lines.push(`RRULE:${freq};COUNT=${group.length}`)
    lines.push(`SUMMARY:${escapeText(first.title)}`)
    if (first.description) lines.push(`DESCRIPTION:${escapeText(first.description)}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function downloadICS(events: Event[], roomName: string): void {
  const ics = eventsToICS(events, `Calendario — ${roomName}`)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${roomName.replace(/[^a-z0-9\-_]+/gi, '_') || 'calendario'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
