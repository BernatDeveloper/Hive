import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { startTestServer, connect, once } from './helpers.js'

let server
const sockets = []

before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() }) // cierra la DB → setup.js puede borrar el fichero
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

function client(ip) {
  const s = connect(server.url, ip)
  sockets.push(s)
  return s
}

// Crea una sala nueva y devuelve un socket ya autenticado en ella.
async function joinedRoom(ip = '10.1.0.1') {
  const name = 'room-' + Math.random().toString(36).slice(2, 9)
  const s = client(ip)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  return { s, name }
}

test('create-room: éxito y nombre duplicado', async () => {
  const name = 'dup-' + Math.random().toString(36).slice(2, 8)
  const s = client('10.2.0.1')
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  assert.deepEqual(await once(s, 'room-created'), { name })

  s.emit('create-room', { name, password: 'otra-clave' })
  assert.match(await once(s, 'room-error'), /ya existe/i)
})

test('create-room: rechaza contraseñas de menos de 8 caracteres', async () => {
  const s = client('10.2.9.1')
  await once(s, 'connect')
  s.emit('create-room', { name: 'short-' + Math.random().toString(36).slice(2, 7), password: 'abc123' })
  assert.match(await once(s, 'room-error'), /al menos 8/i)

  const name = 'ok8-' + Math.random().toString(36).slice(2, 7)
  s.emit('create-room', { name, password: 'abcd1234' })
  assert.deepEqual(await once(s, 'room-created'), { name })
})

test('join-room: contraseña correcta vs incorrecta', async () => {
  const { name } = await joinedRoom('10.2.0.2')
  const s = client('10.2.0.3')
  await once(s, 'connect')

  s.emit('join-room', { name, password: 'MALA' })
  assert.match(await once(s, 'access-denied'), /incorrecta/i)

  s.emit('join-room', { name, password: 'test1234' })
  const granted = await once(s, 'access-granted')
  assert.deepEqual(
    Object.keys(granted).sort(),
    ['events', 'lists', 'listItems', 'notes', 'bookmarks', 'room'].sort(),
  )
})

test('autorización por sala: un socket sin join no puede escribir', async () => {
  const { s: owner, name } = await joinedRoom('10.3.0.1')

  const intruder = client('10.3.0.2')
  await once(intruder, 'connect')
  intruder.emit('create-event', { room: name, event: { title: 'hack', start: '2026-05-01', end: '2026-05-01' } })
  intruder.emit('create-note', { room: name, title: 'hack' })
  await new Promise(r => setTimeout(r, 200))

  owner.emit('join-room', { name, password: 'test1234' })
  const g = await once(owner, 'access-granted')
  assert.equal(g.events.length, 0)
  assert.equal(g.notes.length, 0)
})

test('evento: crear / editar / borrar', async () => {
  const { s, name } = await joinedRoom('10.4.0.1')

  s.emit('create-event', { room: name, event: { title: 'Cita', start: '2026-06-01', end: '2026-06-01', color: '#00ff00' } })
  const created = await once(s, 'event-created')
  assert.equal(created.title, 'Cita')
  assert.equal(created.color, '#00ff00')
  assert.ok(created.id)

  s.emit('update-event', { room: name, event: { ...created, title: 'Cita movida', start: '2026-06-02', end: '2026-06-02' } })
  const updated = await once(s, 'event-updated')
  assert.equal(updated.title, 'Cita movida')
  assert.equal(updated.start, '2026-06-02')

  s.emit('delete-event', { room: name, id: created.id })
  assert.equal(await once(s, 'event-deleted'), created.id)

  s.emit('join-room', { name, password: 'test1234' })
  assert.equal((await once(s, 'access-granted')).events.length, 0)
})

test('evento recurrente: crea la serie con recurrence_id compartido', async () => {
  const { s, name } = await joinedRoom('10.4.0.2')

  s.emit('create-event', { room: name, event: { title: 'Semanal', start: '2026-06-01', end: '2026-06-01', recurrence_rule: 'weekly' } })
  const batch = await once(s, 'events-created')
  assert.equal(batch.length, 104)
  assert.equal(new Set(batch.map(e => e.recurrence_id)).size, 1)
  assert.ok(batch[0].recurrence_id)

  // editar una instancia afecta a toda la serie
  s.emit('update-event', { room: name, event: { ...batch[0], title: 'Renombrada' } })
  const seriesUpd = await once(s, 'series-updated')
  assert.ok(seriesUpd.events.every(e => e.title === 'Renombrada'))
})

test('payload inválido: no persiste ni tumba el handler', async () => {
  const { s, name } = await joinedRoom('10.5.0.1')

  s.emit('create-event', { room: name, event: { title: 'x'.repeat(500), start: '2026-06-01', end: '2026-06-01' } })
  s.emit('create-event', { room: name, event: { title: 'ok', start: 'no-es-fecha', end: 'no-es-fecha' } })
  await new Promise(r => setTimeout(r, 200))

  // el server sigue respondiendo a un evento válido
  s.emit('create-event', { room: name, event: { title: 'Bueno', start: '2026-06-01', end: '2026-06-01' } })
  assert.equal((await once(s, 'event-created')).title, 'Bueno')

  s.emit('join-room', { name, password: 'test1234' })
  const g = await once(s, 'access-granted')
  assert.equal(g.events.length, 1)
})

test('rate limiting: corta tras 10 intentos de auth por IP', async () => {
  const s = client('10.9.9.99')
  await once(s, 'connect')

  let limitedAt = -1
  for (let i = 1; i <= 13; i++) {
    s.emit('join-room', { name: 'no-existe', password: 'x' })
    const msg = await once(s, 'access-denied')
    if (/demasiados intentos/i.test(msg) && limitedAt === -1) limitedAt = i
  }
  assert.ok(limitedAt > 0 && limitedAt <= 12, `esperaba corte hacia el 11, fue ${limitedAt}`)
})
