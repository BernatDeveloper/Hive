import { randomUUID } from 'node:crypto'

// Generación de instancias de eventos recurrentes. Módulo puro: no toca la DB.

function localDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 12) // local noon
}

function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(dateStr, n) {
  const d = localDate(dateStr)
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}

function addMonths(dateStr, n) {
  const d = localDate(dateStr)
  d.setMonth(d.getMonth() + n)
  return fmtDate(d)
}

function firstOfMonth(dateStr, n) {
  const d = localDate(dateStr)
  d.setMonth(d.getMonth() + n)
  d.setDate(1)
  return fmtDate(d)
}

function lastOfMonth(dateStr, n) {
  const d = localDate(dateStr)
  d.setMonth(d.getMonth() + n + 1)
  d.setDate(0)
  return fmtDate(d)
}

export function generateRecurrenceInstances(baseEvent, rule) {
  const recurrenceId = randomUUID()
  const hasTime = baseEvent.start.includes('T')
  const startPart = baseEvent.start.slice(0, 10)
  const startTime = hasTime ? baseEvent.start.slice(10) : ''
  const endPart = baseEvent.end.slice(0, 10)
  const endTime = hasTime ? baseEvent.end.slice(10) : ''
  const diffDays = Math.round((localDate(endPart) - localDate(startPart)) / 86400000)

  const startDates = []
  switch (rule) {
    case 'daily':
      for (let i = 0; i < 365; i++) startDates.push(addDays(startPart, i))
      break
    case 'weekly':
      for (let i = 0; i < 104; i++) startDates.push(addDays(startPart, i * 7))
      break
    case 'monthly':
      for (let i = 0; i < 36; i++) startDates.push(addMonths(startPart, i))
      break
    case 'monthly-first':
      for (let i = 0; i < 36; i++) startDates.push(firstOfMonth(startPart, i))
      break
    case 'monthly-last':
      for (let i = 0; i < 36; i++) startDates.push(lastOfMonth(startPart, i))
      break
    case 'annual':
      for (let i = 0; i < 10; i++) {
        const d = localDate(startPart)
        d.setFullYear(d.getFullYear() + i)
        startDates.push(fmtDate(d))
      }
      break
  }

  return {
    recurrenceId,
    instances: startDates.map(s => ({
      id: randomUUID(),
      title: baseEvent.title,
      start: s + startTime,
      end: addDays(s, diffDays) + endTime,
      description: baseEvent.description ?? '',
      category: baseEvent.category ?? 'otro',
      color: baseEvent.color ?? null,
      recurrence_rule: rule,
      recurrence_id: recurrenceId,
      reminder_offset: baseEvent.reminder_offset ?? null,
    }))
  }
}
