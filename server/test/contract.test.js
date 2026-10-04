import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { startTestServer, connect, once, emitAck } from './helpers.js'

// Fija la forma EXACTA de cada objeto y payload que emite el servidor. Si aquí
// falla algo, el cambio hay que reflejarlo también en client/src/types.ts —
// no hay tipos compartidos automáticos entre cliente y servidor.

// Claves de cada tipo, tal como las declara client/src/types.ts
const EVENT_KEYS = ['id', 'room', 'title', 'start', 'end', 'description', 'color', 'recurrence_rule', 'recurrence_id', 'reminder_offset', 'reminder_sent', 'updated_at', 'last_editor_name', 'last_editor_color']
const ROOM_KEYS = ['name', 'created_at', 'timezone', 'primary_color', 'background_color', 'text_color', 'sidebar_color']
const LIST_KEYS = ['id', 'room', 'title', 'created_at']
const LIST_ITEM_KEYS = ['id', 'list_id', 'room', 'text', 'checked']
const NOTE_KEYS = ['id', 'room', 'title', 'body', 'pinned', 'created_at', 'updated_at', 'last_editor_name', 'last_editor_color']
const PRESENCE_PERSON_KEYS = ['name', 'color', 'online', 'last_seen_at']

const keysOf = o => Object.keys(o).sort()
const sameKeys = (o, expected, msg) => assert.deepEqual(keysOf(o), [...expected].sort(), msg)

let server
const sockets = []
before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

async function room(ip) {
  const name = 'contract-' + Math.random().toString(36).slice(2, 8)
  const s = connect(server.url, ip)
  sockets.push(s)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234', editor_name: 'Ana', editor_color: '#ff0000' })
  return { s, name, granted: await once(s, 'access-granted') }
}

test('access-granted: claves del payload y del objeto room', async () => {
  const { granted } = await room('10.70.0.1')
  sameKeys(granted, ['room', 'events', 'lists', 'listItems', 'notes'], 'access-granted')
  sameKeys(granted.room, ROOM_KEYS, 'room')
})

test('event-created / event-updated: claves de Event', async () => {
  const { s, name } = await room('10.70.0.2')
  s.emit('create-event', { room: name, event: { title: 'C', start: '2026-08-01', end: '2026-08-01', color: '#ff0000', reminder_offset: 30 } })
  const created = await once(s, 'event-created')
  sameKeys(created, EVENT_KEYS, 'event-created')
  assert.equal(typeof created.reminder_sent, 'number')

  s.emit('update-event', { room: name, event: { ...created, title: 'C2' } })
  sameKeys(await once(s, 'event-updated'), EVENT_KEYS, 'event-updated')
})

test('list-created / list-item-created: claves', async () => {
  const { s, name } = await room('10.70.0.3')
  s.emit('create-list', { room: name, title: 'L' })
  const list = await once(s, 'list-created')
  sameKeys(list, LIST_KEYS, 'list-created')

  s.emit('create-list-item', { room: name, listId: list.id, text: 'x' })
  const item = await once(s, 'list-item-created')
  sameKeys(item, LIST_ITEM_KEYS, 'list-item-created')
  assert.equal(typeof item.checked, 'boolean')
})

test('list-updated / list-item-updated (toggle y texto): claves', async () => {
  const { s, name } = await room('10.70.0.10')
  s.emit('create-list', { room: name, title: 'L' })
  const list = await once(s, 'list-created')

  s.emit('update-list', { room: name, id: list.id, title: 'L2' })
  sameKeys(await once(s, 'list-updated'), LIST_KEYS, 'list-updated')

  s.emit('create-list-item', { room: name, listId: list.id, text: 'x' })
  const item = await once(s, 'list-item-created')

  s.emit('toggle-list-item', { room: name, id: item.id, checked: true })
  sameKeys(await once(s, 'list-item-updated'), LIST_ITEM_KEYS, 'list-item-updated (toggle)')

  s.emit('update-list-item', { room: name, id: item.id, text: 'y' })
  sameKeys(await once(s, 'list-item-updated'), LIST_ITEM_KEYS, 'list-item-updated (texto)')
})

test('clear-completed-items: list-items-deleted y ack', async () => {
  const { s, name } = await room('10.70.0.11')
  s.emit('create-list', { room: name, title: 'L' })
  const list = await once(s, 'list-created')
  s.emit('create-list-item', { room: name, listId: list.id, text: 'x' })
  const item = await once(s, 'list-item-created')
  s.emit('toggle-list-item', { room: name, id: item.id, checked: true })
  await once(s, 'list-item-updated')

  const deletedP = once(s, 'list-items-deleted')
  const ack = await emitAck(s, 'clear-completed-items', { room: name, listId: list.id })
  assert.deepEqual(keysOf(ack), ['label', 'undoToken'])
  assert.deepEqual(keysOf(await deletedP), ['ids'])
})

test('note-created / note-updated ack: claves de Note', async () => {
  const { s, name } = await room('10.70.0.4')
  s.emit('create-note', { room: name, title: 'N' })
  const note = await once(s, 'note-created')
  sameKeys(note, NOTE_KEYS, 'note-created')
  assert.equal(note.pinned, false)

  const ack = await emitAck(s, 'update-note', { room: name, note: { id: note.id, title: 'N', body: 'b', updated_at: note.updated_at } })
  assert.deepEqual(keysOf(ack), ['note', 'status'])
  sameKeys(ack.note, NOTE_KEYS, 'ack.note')
})

test('toggle-note-pin: note-updated con pinned y reordena antes que las no fijadas', async () => {
  const { s, name } = await room('10.70.0.12')
  s.emit('create-note', { room: name, title: 'Vieja' })
  const older = await once(s, 'note-created')
  s.emit('create-note', { room: name, title: 'Nueva' })
  await once(s, 'note-created')

  const updatedP = once(s, 'note-updated')
  s.emit('toggle-note-pin', { room: name, id: older.id, pinned: true })
  const updated = await updatedP
  sameKeys(updated, NOTE_KEYS, 'note-updated (pin)')
  assert.equal(updated.pinned, true)

  s.emit('join-room', { name, password: 'test1234' })
  const granted = await once(s, 'access-granted')
  assert.equal(granted.notes[0].id, older.id)
})

test('clone-list: list-cloned claves, ítems duplicados sin marcar', async () => {
  const { s, name } = await room('10.70.0.13')
  s.emit('create-list', { room: name, title: 'Compra' })
  const list = await once(s, 'list-created')
  s.emit('create-list-item', { room: name, listId: list.id, text: 'pan' })
  const item = await once(s, 'list-item-created')
  s.emit('toggle-list-item', { room: name, id: item.id, checked: true })
  await once(s, 'list-item-updated')

  const clonedP = once(s, 'list-cloned')
  s.emit('clone-list', { room: name, id: list.id })
  const cloned = await clonedP
  assert.deepEqual(keysOf(cloned), ['items', 'list'])
  sameKeys(cloned.list, LIST_KEYS, 'list-cloned.list')
  assert.equal(cloned.list.title, 'Compra (copia)')
  assert.equal(cloned.items.length, 1)
  sameKeys(cloned.items[0], LIST_ITEM_KEYS, 'list-cloned.items[0]')
  assert.equal(cloned.items[0].checked, false)
})

test('style-updated: claves de room', async () => {
  const { s, name } = await room('10.70.0.5')
  s.emit('update-room-style', { name, styles: { primary_color: '#123456', background_color: null, text_color: null, sidebar_color: null } })
  const st = await once(s, 'style-updated')
  sameKeys(st, ['name', 'primary_color', 'background_color', 'text_color', 'sidebar_color'], 'style-updated')
})

test('room-timezone-updated: claves', async () => {
  const { s, name } = await room('10.70.0.8')
  s.emit('update-room-timezone', { name, timezone: 'Atlantic/Canary' })
  const st = await once(s, 'room-timezone-updated')
  assert.deepEqual(keysOf(st), ['name', 'timezone'])
  assert.equal(st.timezone, 'Atlantic/Canary')
})

test('event-conflict: claves cuando expected_updated_at no coincide', async () => {
  const { s, name } = await room('10.70.0.9')
  s.emit('create-event', { room: name, event: { title: 'E', start: '2026-08-01', end: '2026-08-01' } })
  const created = await once(s, 'event-created')

  const conflictP = once(s, 'event-conflict')
  s.emit('update-event', { room: name, event: { ...created, title: 'x', expected_updated_at: 'versión-que-no-es' } })
  const payload = await conflictP
  assert.deepEqual(keysOf(payload), ['current'])
  sameKeys(payload.current, EVENT_KEYS, 'event-conflict.current')
})

test('delete-event ack: { undoToken, label }', async () => {
  const { s, name } = await room('10.70.0.6')
  s.emit('create-event', { room: name, event: { title: 'D', start: '2026-08-01', end: '2026-08-01' } })
  const ev = await once(s, 'event-created')
  const ack = await emitAck(s, 'delete-event', { room: name, id: ev.id })
  assert.deepEqual(keysOf(ack), ['label', 'undoToken'])
})

test('presence: { people: [{ name, color }] }', async () => {
  const { s } = await room('10.70.0.7')
  const p = once(s, 'presence')
  s.emit('get-presence')
  const payload = await p
  assert.deepEqual(keysOf(payload), ['people'])
  assert.ok(Array.isArray(payload.people))
  sameKeys(payload.people[0], PRESENCE_PERSON_KEYS, 'presence.people[0]')
})
