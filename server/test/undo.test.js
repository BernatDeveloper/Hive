import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { startTestServer, connect, once, emitAck } from './helpers.js'

let server
const sockets = []

before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

async function room(ip) {
  const name = 'undo-' + Math.random().toString(36).slice(2, 9)
  const s = connect(server.url, ip)
  sockets.push(s)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  return { s, name }
}

async function currentEvents(s, name) {
  s.emit('join-room', { name, password: 'test1234' })
  return (await once(s, 'access-granted')).events
}
async function currentState(s, name) {
  s.emit('join-room', { name, password: 'test1234' })
  return once(s, 'access-granted')
}

test('undo de un evento suelto lo restaura', async () => {
  const { s, name } = await room('10.60.0.1')
  s.emit('create-event', { room: name, event: { title: 'Cita', start: '2026-07-01', end: '2026-07-01' } })
  const ev = await once(s, 'event-created')

  const ack = await emitAck(s, 'delete-event', { room: name, id: ev.id })
  assert.ok(ack.undoToken)
  assert.match(ack.label, /Cita/)
  assert.equal((await currentEvents(s, name)).length, 0)

  const restoredP = once(s, 'events-created')
  const undoAck = await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })
  assert.equal(undoAck.ok, true)
  const restored = await restoredP
  assert.equal(restored[0].id, ev.id)
  assert.equal((await currentEvents(s, name)).length, 1)
})

test('undo de una serie entera la restaura', async () => {
  const { s, name } = await room('10.60.0.2')
  s.emit('create-event', { room: name, event: { title: 'Serie', start: '2026-07-01', end: '2026-07-01', recurrence_rule: 'weekly' } })
  const batch = await once(s, 'events-created')

  const ack = await emitAck(s, 'delete-event', { room: name, id: batch[0].id, scope: 'all' })
  assert.match(ack.label, /y 103 más/)
  assert.equal((await currentEvents(s, name)).length, 0)

  const restoredP = once(s, 'events-created')
  await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })
  await restoredP
  assert.equal((await currentEvents(s, name)).length, 104)
})

test('undo de una lista restaura la lista y sus ítems', async () => {
  const { s, name } = await room('10.60.0.3')
  s.emit('create-list', { room: name, title: 'Compra' })
  const list = await once(s, 'list-created')
  s.emit('create-list-item', { room: name, listId: list.id, text: 'pan' })
  await once(s, 'list-item-created')
  s.emit('create-list-item', { room: name, listId: list.id, text: 'leche' })
  await once(s, 'list-item-created')

  const ack = await emitAck(s, 'delete-list', { room: name, id: list.id })
  assert.match(ack.label, /Compra/)
  let st = await currentState(s, name)
  assert.equal(st.lists.length, 0)
  assert.equal(st.listItems.length, 0)

  const listP = once(s, 'list-created')
  await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })
  await listP
  st = await currentState(s, name)
  assert.equal(st.lists.length, 1)
  assert.equal(st.listItems.length, 2)
})

test('undo de una nota la restaura con su contenido', async () => {
  const { s, name } = await room('10.60.0.4')
  s.emit('create-note', { room: name, title: 'Ideas' })
  const note = await once(s, 'note-created')
  await emitAck(s, 'update-note', { room: name, note: { id: note.id, title: 'Ideas', body: 'texto importante', updated_at: note.updated_at } })

  const ack = await emitAck(s, 'delete-note', { room: name, id: note.id })
  assert.match(ack.label, /Ideas/)
  assert.equal((await currentState(s, name)).notes.length, 0)

  const restoredP = once(s, 'note-created')
  await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })
  const restored = await restoredP
  assert.equal(restored.body, 'texto importante')
  assert.equal((await currentState(s, name)).notes.length, 1)
})

test('undo con token caducado/desconocido → ok:false', async () => {
  const { s, name } = await room('10.60.0.5')
  const ack = await emitAck(s, 'undo-delete', { room: name, token: 'token-que-no-existe' })
  assert.equal(ack.ok, false)
})

test('undo de otra sala se rechaza', async () => {
  const { s: a, name: nameA } = await room('10.60.0.6')
  a.emit('create-note', { room: nameA, title: 'X' })
  const note = await once(a, 'note-created')
  const ack = await emitAck(a, 'delete-note', { room: nameA, id: note.id })

  const { s: b, name: nameB } = await room('10.60.0.7')
  const bAck = await emitAck(b, 'undo-delete', { room: nameB, token: ack.undoToken })
  assert.equal(bAck.ok, false)
})
