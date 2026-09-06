import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { startTestServer, connect, once } from './helpers.js'

let server
const sockets = []

before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

// Sala + serie semanal (104 instancias) ordenadas por start.
async function seriesRoom(ip) {
  const name = 'series-' + Math.random().toString(36).slice(2, 9)
  const s = connect(server.url, ip)
  sockets.push(s)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  s.emit('create-event', { room: name, event: { title: 'Reu', start: '2026-06-01', end: '2026-06-01', recurrence_rule: 'weekly' } })
  const batch = await once(s, 'events-created')
  batch.sort((a, b) => a.start.localeCompare(b.start))
  return { s, name, batch }
}

async function currentEvents(s, name) {
  s.emit('join-room', { name, password: 'test1234' })
  const g = await once(s, 'access-granted')
  return g.events.sort((a, b) => a.start.localeCompare(b.start))
}

test('update scope=single: solo esa instancia cambia y se desengancha', async () => {
  const { s, name, batch } = await seriesRoom('10.40.0.1')
  const pivot = batch[5]

  s.emit('update-event', { room: name, event: { ...pivot, title: 'Cambiada' }, scope: 'single' })
  const upd = await once(s, 'event-updated')
  assert.equal(upd.id, pivot.id)
  assert.equal(upd.title, 'Cambiada')
  assert.equal(upd.recurrence_id, null)
  assert.equal(upd.recurrence_rule, null)

  const all = await currentEvents(s, name)
  assert.equal(all.length, 104)
  const others = all.filter(e => e.id !== pivot.id)
  assert.ok(others.every(e => e.title === 'Reu'), 'el resto no debe cambiar')
  assert.ok(others.every(e => e.recurrence_id === batch[0].recurrence_id), 'el resto mantiene la serie')
})

test('update scope=future: instancias desde el pivote, recurrence_id nuevo; anteriores intactas', async () => {
  const { s, name, batch } = await seriesRoom('10.40.0.2')
  const oldRid = batch[0].recurrence_id
  const pivot = batch[10]

  s.emit('update-event', { room: name, event: { ...pivot, title: 'Futuras', color: '#00ff00' }, scope: 'future' })
  const { events: changed } = await once(s, 'series-updated')
  assert.equal(changed.length, 94) // 104 - 10
  const newRid = changed[0].recurrence_id
  assert.notEqual(newRid, oldRid)
  assert.ok(changed.every(e => e.recurrence_id === newRid))
  assert.ok(changed.every(e => e.title === 'Futuras' && e.color === '#00ff00'))

  const all = await currentEvents(s, name)
  const before = all.filter(e => e.start < pivot.start)
  const after = all.filter(e => e.start >= pivot.start)
  assert.equal(before.length, 10)
  assert.equal(after.length, 94)
  assert.ok(before.every(e => e.title === 'Reu' && e.recurrence_id === oldRid), 'anteriores intactas')
  assert.ok(after.every(e => e.title === 'Futuras' && e.recurrence_id === newRid))
})

test('update scope=all: toda la serie cambia', async () => {
  const { s, name, batch } = await seriesRoom('10.40.0.3')
  s.emit('update-event', { room: name, event: { ...batch[3], title: 'Todo' }, scope: 'all' })
  const { events } = await once(s, 'series-updated')
  assert.equal(events.length, 104)
  const all = await currentEvents(s, name)
  assert.ok(all.every(e => e.title === 'Todo'))
})

test('delete scope=single: quita solo esa instancia', async () => {
  const { s, name, batch } = await seriesRoom('10.40.0.4')
  s.emit('delete-event', { room: name, id: batch[7].id, scope: 'single' })
  assert.equal(await once(s, 'event-deleted'), batch[7].id)
  const all = await currentEvents(s, name)
  assert.equal(all.length, 103)
  assert.ok(!all.some(e => e.id === batch[7].id))
})

test('delete scope=future: quita desde el pivote; anteriores quedan', async () => {
  const { s, name, batch } = await seriesRoom('10.40.0.5')
  const pivot = batch[40]
  s.emit('delete-event', { room: name, id: pivot.id, scope: 'future' })
  const { ids } = await once(s, 'events-deleted')
  assert.equal(ids.length, 64) // 104 - 40
  const all = await currentEvents(s, name)
  assert.equal(all.length, 40)
  assert.ok(all.every(e => e.start < pivot.start))
})

test('delete scope=all: quita la serie entera', async () => {
  const { s, name, batch } = await seriesRoom('10.40.0.6')
  s.emit('delete-event', { room: name, id: batch[0].id, scope: 'all' })
  await once(s, 'series-deleted')
  const all = await currentEvents(s, name)
  assert.equal(all.length, 0)
})

test('scope ausente o inválido → comportamiento "all" (compat)', async () => {
  const { s, name, batch } = await seriesRoom('10.40.0.7')
  s.emit('update-event', { room: name, event: { ...batch[2], title: 'Compat' } }) // sin scope
  const { events } = await once(s, 'series-updated')
  assert.equal(events.length, 104)
})
