import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateRecurrenceInstances } from './recurrence.js'

const base = {
  title: 'Reunión',
  start: '2026-01-15',
  end: '2026-01-15',
  description: 'notas',
  color: '#ff0000',
  reminder_offset: 30,
}

test('cada regla genera el número de instancias de su horizonte', () => {
  const counts = {
    daily: 365,
    weekly: 104,
    monthly: 36,
    'monthly-first': 36,
    'monthly-last': 36,
    annual: 10,
  }
  for (const [rule, expected] of Object.entries(counts)) {
    const { instances } = generateRecurrenceInstances(base, rule)
    assert.equal(instances.length, expected, `${rule} debería generar ${expected}`)
  }
})

test('una regla desconocida no genera instancias', () => {
  const { instances } = generateRecurrenceInstances(base, 'no-existe')
  assert.equal(instances.length, 0)
})

test('todas las instancias comparten recurrence_id y tienen id único', () => {
  const { recurrenceId, instances } = generateRecurrenceInstances(base, 'weekly')
  assert.ok(recurrenceId)
  assert.ok(instances.every(i => i.recurrence_id === recurrenceId))
  const ids = new Set(instances.map(i => i.id))
  assert.equal(ids.size, instances.length)
})

test('propaga title, description, color y reminder_offset a cada instancia', () => {
  const { instances } = generateRecurrenceInstances(base, 'monthly')
  for (const i of instances) {
    assert.equal(i.title, 'Reunión')
    assert.equal(i.description, 'notas')
    assert.equal(i.color, '#ff0000')
    assert.equal(i.reminder_offset, 30)
    assert.equal(i.recurrence_rule, 'monthly')
  }
})

test('daily: la primera instancia es la fecha base y avanza de día en día', () => {
  const { instances } = generateRecurrenceInstances(base, 'daily')
  assert.equal(instances[0].start, '2026-01-15')
  assert.equal(instances[1].start, '2026-01-16')
  assert.equal(instances[31].start, '2026-02-15')
})

test('weekly: separación de 7 días entre instancias', () => {
  const { instances } = generateRecurrenceInstances(base, 'weekly')
  assert.equal(instances[0].start, '2026-01-15')
  assert.equal(instances[1].start, '2026-01-22')
  assert.equal(instances[2].start, '2026-01-29')
})

test('monthly-first: todas las instancias empiezan el día 01', () => {
  const { instances } = generateRecurrenceInstances(base, 'monthly-first')
  assert.ok(instances.every(i => i.start.slice(8, 10) === '01'))
})

test('monthly-last: cada instancia cae en el último día de su mes', () => {
  const { instances } = generateRecurrenceInstances(base, 'monthly-last')
  for (const i of instances.slice(0, 14)) {
    const [y, m, d] = i.start.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate() // día 0 del mes siguiente
    assert.equal(d, lastDay, `${i.start} no es fin de mes`)
  }
})

test('annual: mismo día y mes, año +1 cada vez', () => {
  const { instances } = generateRecurrenceInstances(base, 'annual')
  assert.equal(instances[0].start, '2026-01-15')
  assert.equal(instances[1].start, '2027-01-15')
  assert.equal(instances[9].start, '2035-01-15')
})

test('conserva la duración (span multi-día) del evento base', () => {
  const multiDay = { ...base, start: '2026-01-15', end: '2026-01-18' } // 3 días
  const { instances } = generateRecurrenceInstances(multiDay, 'weekly')
  for (const i of instances.slice(0, 5)) {
    const days = (new Date(i.end + 'T12:00') - new Date(i.start + 'T12:00')) / 86400000
    assert.equal(days, 3)
  }
})

test('evento con hora: preserva la parte de hora en start y end', () => {
  const timed = {
    ...base,
    start: '2026-01-15T09:00:00.000Z',
    end: '2026-01-15T10:30:00.000Z',
  }
  const { instances } = generateRecurrenceInstances(timed, 'daily')
  assert.ok(instances[0].start.endsWith('T09:00:00.000Z'))
  assert.ok(instances[0].end.endsWith('T10:30:00.000Z'))
  assert.ok(instances[5].start.startsWith('2026-01-20T09:00:00.000Z'))
})
