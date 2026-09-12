import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { updateEvent } from '../db/events.js'
import { startTestServer, connect, once, onceAny } from './helpers.js'

let server
const sockets = []

before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

async function joinedRoom(ip) {
  const name = 'evconc-' + Math.random().toString(36).slice(2, 9)
  const s = connect(server.url, ip)
  sockets.push(s)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  return { s, name }
}

async function newEvent(s, room) {
  s.emit('create-event', { room, event: { title: 'Base', start: '2026-06-01', end: '2026-06-01' } })
  return once(s, 'event-created')
}

test('update-event con expected_updated_at vigente → ok, sin conflicto', async () => {
  const { s, name } = await joinedRoom('10.30.0.1')
  const ev = await newEvent(s, name)

  const result = onceAny(s, ['event-updated', 'event-conflict'])
  s.emit('update-event', { room: name, event: { ...ev, title: 'T2', expected_updated_at: ev.updated_at } })
  const { event: evName, data } = await result
  assert.equal(evName, 'event-updated')
  assert.equal(data.title, 'T2')
  assert.notEqual(data.updated_at, ev.updated_at)
})

test('update-event con expected_updated_at obsoleto → event-conflict, sin broadcast, DB intacta', async () => {
  const { s, name } = await joinedRoom('10.30.0.2')
  const ev = await newEvent(s, name)

  // primera edición: avanza la versión
  const first = onceAny(s, ['event-updated', 'event-conflict'])
  s.emit('update-event', { room: name, event: { ...ev, title: 'v1', expected_updated_at: ev.updated_at } })
  const r1 = await first
  assert.equal(r1.event, 'event-updated')

  // segunda edición basada en la versión ORIGINAL (obsoleta)
  let gotBroadcast = false
  s.once('event-updated', () => { gotBroadcast = true })
  const conflictP = once(s, 'event-conflict')
  s.emit('update-event', { room: name, event: { ...ev, title: 'v2', expected_updated_at: ev.updated_at } })
  const conflict = await conflictP
  assert.equal(conflict.current.title, 'v1') // devuelve la versión buena

  await new Promise(r => setTimeout(r, 150))
  assert.equal(gotBroadcast, false, 'un conflicto no debe difundir event-updated')

  const inDb = db.prepare('SELECT title FROM event WHERE id = ?').get(ev.id)
  assert.deepEqual(inDb, { title: 'v1' })
})

test('dos editores: B guarda, A choca, A recarga con el expected_updated_at del conflicto y guarda', async () => {
  const { s: a, name } = await joinedRoom('10.30.0.3')
  const b = connect(server.url, '10.30.0.4')
  sockets.push(b)
  await once(b, 'connect')
  b.emit('join-room', { name, password: 'test1234' })
  await once(b, 'access-granted')

  const ev = await newEvent(a, name)
  await once(b, 'event-created')

  const bUpdated = once(b, 'event-updated')
  b.emit('update-event', { room: name, event: { ...ev, title: 'de B', expected_updated_at: ev.updated_at } })
  const fromB = await bUpdated
  assert.equal(fromB.title, 'de B')

  const conflictA = once(a, 'event-conflict')
  a.emit('update-event', { room: name, event: { ...ev, title: 'de A', expected_updated_at: ev.updated_at } })
  const { current } = await conflictA
  assert.equal(current.title, 'de B') // devuelve la versión buena (la de B)

  const aUpdated = once(a, 'event-updated')
  a.emit('update-event', { room: name, event: { ...ev, title: 'de A (2)', expected_updated_at: current.updated_at } })
  const finalUpdate = await aUpdated
  assert.equal(finalUpdate.title, 'de A (2)')
})

test('update-event sin expected_updated_at → last-write-wins (compat)', async () => {
  const { s, name } = await joinedRoom('10.30.0.5')
  const ev = await newEvent(s, name)

  const firstDone = onceAny(s, ['event-updated', 'event-conflict'])
  s.emit('update-event', { room: name, event: { ...ev, title: 'v1', expected_updated_at: ev.updated_at } })
  await firstDone

  const updatedP = once(s, 'event-updated')
  // sin expected_updated_at, aunque la versión base ya es obsoleta
  s.emit('update-event', { room: name, event: { ...ev, title: 'sin version' } })
  const updated = await updatedP
  assert.equal(updated.title, 'sin version')
})

test('updateEvent() con id inexistente → not-found (guarda directamente contra la DB)', () => {
  const result = updateEvent({ id: 'no-existe', title: 'x', start: '2026-01-01', end: '2026-01-01', description: '' })
  assert.equal(result.status, 'not-found')
})
