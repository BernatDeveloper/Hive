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
  const name = 'attr-' + Math.random().toString(36).slice(2, 9)
  const s = connect(server.url, ip)
  sockets.push(s)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  return { s, name }
}

test('create-event con editor_name/editor_color: el evento creado lleva la atribución', async () => {
  const { s, name } = await joinedRoom('10.80.0.1')
  s.emit('create-event', { room: name, event: { title: 'Cita', start: '2026-06-01', end: '2026-06-01', editor_name: 'Ana', editor_color: '#FF0000' } })
  const created = await once(s, 'event-created')
  assert.equal(created.last_editor_name, 'Ana')
  assert.equal(created.last_editor_color, '#ff0000')
})

test('update-event cambia la atribución al último editor', async () => {
  const { s, name } = await joinedRoom('10.80.0.2')
  s.emit('create-event', { room: name, event: { title: 'Cita', start: '2026-06-01', end: '2026-06-01', editor_name: 'Ana', editor_color: '#ff0000' } })
  const created = await once(s, 'event-created')

  s.emit('update-event', { room: name, event: { ...created, title: 'Cita 2', editor_name: 'Beto', editor_color: '#00ff00' } })
  const updated = await once(s, 'event-updated')
  assert.equal(updated.last_editor_name, 'Beto')
  assert.equal(updated.last_editor_color, '#00ff00')
})

test('editor_name ausente o inválido en create-event → last_editor_name null', async () => {
  const { s, name } = await joinedRoom('10.80.0.3')
  s.emit('create-event', { room: name, event: { title: 'Sin identidad', start: '2026-06-01', end: '2026-06-01' } })
  const created = await once(s, 'event-created')
  assert.equal(created.last_editor_name, null)
  assert.equal(created.last_editor_color, null)
})

test('serie recurrente: cada instancia hereda la atribución del creador', async () => {
  const { s, name } = await joinedRoom('10.80.0.4')
  s.emit('create-event', { room: name, event: { title: 'Semanal', start: '2026-06-01', end: '2026-06-01', recurrence_rule: 'weekly', editor_name: 'Ana', editor_color: '#ff0000' } })
  const batch = await once(s, 'events-created')
  assert.ok(batch.every(e => e.last_editor_name === 'Ana' && e.last_editor_color === '#ff0000'))
})

test('editar una serie (scope=all) actualiza la atribución de toda la serie', async () => {
  const { s, name } = await joinedRoom('10.80.0.5')
  s.emit('create-event', { room: name, event: { title: 'Semanal', start: '2026-06-01', end: '2026-06-01', recurrence_rule: 'weekly', editor_name: 'Ana', editor_color: '#ff0000' } })
  const batch = await once(s, 'events-created')

  s.emit('update-event', { room: name, event: { ...batch[0], title: 'Renombrada', editor_name: 'Beto', editor_color: '#00ff00' } })
  const { events } = await once(s, 'series-updated')
  assert.ok(events.every(e => e.last_editor_name === 'Beto'))
})

test('undo de un evento restaura también su atribución', async () => {
  const { s, name } = await joinedRoom('10.80.0.6')
  s.emit('create-event', { room: name, event: { title: 'Cita', start: '2026-06-01', end: '2026-06-01', editor_name: 'Ana', editor_color: '#ff0000' } })
  const created = await once(s, 'event-created')

  const ack = await emitAck(s, 'delete-event', { room: name, id: created.id })
  const restoredP = once(s, 'events-created')
  await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })
  const restored = await restoredP
  assert.equal(restored[0].last_editor_name, 'Ana')
})

test('create-note / update-note con editor_name/editor_color: atribución persistida', async () => {
  const { s, name } = await joinedRoom('10.80.0.7')
  s.emit('create-note', { room: name, title: 'N', editor_name: 'Ana', editor_color: '#ff0000' })
  const note = await once(s, 'note-created')
  assert.equal(note.last_editor_name, 'Ana')
  assert.equal(note.last_editor_color, '#ff0000')

  const ack = await emitAck(s, 'update-note', { room: name, note: { id: note.id, title: 'N2', body: 'b', updated_at: note.updated_at, editor_name: 'Beto', editor_color: '#00ff00' } })
  assert.equal(ack.status, 'ok')
  assert.equal(ack.note.last_editor_name, 'Beto')
  assert.equal(ack.note.last_editor_color, '#00ff00')
})

test('undo de una nota restaura también su atribución', async () => {
  const { s, name } = await joinedRoom('10.80.0.8')
  s.emit('create-note', { room: name, title: 'N', editor_name: 'Ana', editor_color: '#ff0000' })
  const note = await once(s, 'note-created')

  const ack = await emitAck(s, 'delete-note', { room: name, id: note.id })
  const restoredP = once(s, 'note-created')
  await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })
  const restored = await restoredP
  assert.equal(restored.last_editor_name, 'Ana')
})
