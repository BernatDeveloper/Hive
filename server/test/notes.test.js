import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { startTestServer, connect, once, emitAck } from './helpers.js'

let server
const sockets = []

before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

async function joinedRoom(ip) {
  const name = 'notes-' + Math.random().toString(36).slice(2, 9)
  const s = connect(server.url, ip)
  sockets.push(s)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  return { s, name }
}

async function newNote(s, room) {
  s.emit('create-note', { room, title: 'Base' })
  return once(s, 'note-created')
}

test('update-note con updated_at vigente → ok + broadcast', async () => {
  const { s, name } = await joinedRoom('10.20.0.1')
  const note = await newNote(s, name)

  const broadcastP = once(s, 'note-updated')
  const ack = await emitAck(s, 'update-note', { room: name, note: { id: note.id, title: 'T2', body: 'hola', updated_at: note.updated_at } })
  assert.equal(ack.status, 'ok')
  assert.equal(ack.note.title, 'T2')
  assert.notEqual(ack.note.updated_at, note.updated_at)

  const bc = await broadcastP
  assert.equal(bc.body, 'hola')
})

test('update-note con updated_at obsoleto → conflict, sin broadcast, DB intacta', async () => {
  const { s, name } = await joinedRoom('10.20.0.2')
  const note = await newNote(s, name)

  // primera edición: avanza la versión
  const ok1 = await emitAck(s, 'update-note', { room: name, note: { id: note.id, title: 'v1', body: 'uno', updated_at: note.updated_at } })
  assert.equal(ok1.status, 'ok')

  // segunda edición basada en la versión ORIGINAL (obsoleta)
  let gotBroadcast = false
  s.once('note-updated', () => { gotBroadcast = true })
  const conflict = await emitAck(s, 'update-note', { room: name, note: { id: note.id, title: 'v2', body: 'dos', updated_at: note.updated_at } })
  assert.equal(conflict.status, 'conflict')
  assert.equal(conflict.note.title, 'v1') // devuelve la versión buena

  await new Promise(r => setTimeout(r, 150))
  assert.equal(gotBroadcast, false, 'un conflicto no debe difundir note-updated')

  const inDb = db.prepare('SELECT title, body FROM note WHERE id = ?').get(note.id)
  assert.deepEqual(inDb, { title: 'v1', body: 'uno' })
})

test('dos editores: B guarda, A choca, A recarga y guarda', async () => {
  const { s: a, name } = await joinedRoom('10.20.0.3')
  const b = connect(server.url, '10.20.0.4')
  sockets.push(b)
  await once(b, 'connect')
  b.emit('join-room', { name, password: 'test1234' })
  await once(b, 'access-granted')

  const note = await newNote(a, name)
  await once(b, 'note-created') // B también recibe la nota

  // B guarda sobre v0
  const okB = await emitAck(b, 'update-note', { room: name, note: { id: note.id, title: 'de B', body: 'bbb', updated_at: note.updated_at } })
  assert.equal(okB.status, 'ok')

  // A guarda sobre v0 (obsoleto) → conflicto, recibe la versión de B
  const conflictA = await emitAck(a, 'update-note', { room: name, note: { id: note.id, title: 'de A', body: 'aaa', updated_at: note.updated_at } })
  assert.equal(conflictA.status, 'conflict')
  assert.equal(conflictA.note.title, 'de B')

  // A "recarga" (usa la versión de B) y vuelve a guardar → ok
  const okA = await emitAck(a, 'update-note', { room: name, note: { id: note.id, title: 'de A (2)', body: 'aaa2', updated_at: conflictA.note.updated_at } })
  assert.equal(okA.status, 'ok')
  assert.equal(okA.note.title, 'de A (2)')
})

test('update-note sin updated_at → last-write-wins (compat)', async () => {
  const { s, name } = await joinedRoom('10.20.0.5')
  const note = await newNote(s, name)

  await emitAck(s, 'update-note', { room: name, note: { id: note.id, title: 'x', body: 'x', updated_at: note.updated_at } })
  const ack = await emitAck(s, 'update-note', { room: name, note: { id: note.id, title: 'sin version', body: 'y' } })
  assert.equal(ack.status, 'ok')
  assert.equal(ack.note.title, 'sin version')
})

test('update-note con id inexistente → not-found', async () => {
  const { s, name } = await joinedRoom('10.20.0.6')
  const ack = await emitAck(s, 'update-note', { room: name, note: { id: 'no-existe', title: 'x', body: 'y' } })
  assert.equal(ack.status, 'not-found')
})
