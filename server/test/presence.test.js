import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { startTestServer, connect, once } from './helpers.js'
import { buildPeople } from '../sockets/presence.js'

let server
const sockets = []

before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

function client(ip) {
  const s = connect(server.url, ip)
  sockets.push(s)
  return s
}

test('presence: sube al entrar y baja al salir, con nombre y color', async () => {
  const name = 'pres-' + Math.random().toString(36).slice(2, 8)

  const a = client('10.50.0.1')
  await once(a, 'connect')
  a.emit('create-room', { name, password: 'test1234' })
  await once(a, 'room-created')

  const presA = once(a, 'presence')
  a.emit('join-room', { name, password: 'test1234', editor_name: 'Ana', editor_color: '#ff0000' })
  await once(a, 'access-granted')
  const p1 = await presA
  assert.equal(p1.people.length, 1)
  assert.deepEqual(p1.people[0], { name: 'Ana', color: '#ff0000', online: true, last_seen_at: null })

  // B entra → A recibe presence con los dos nombres
  const b = client('10.50.0.2')
  await once(b, 'connect')
  const presA2 = once(a, 'presence')
  b.emit('join-room', { name, password: 'test1234', editor_name: 'Beto', editor_color: '#00FF00' })
  await once(b, 'access-granted')
  const p2 = await presA2
  assert.equal(p2.people.length, 2)
  assert.ok(p2.people.some(p => p.name === 'Ana'))
  assert.ok(p2.people.some(p => p.name === 'Beto' && p.color === '#00ff00')) // el color se guarda en minúsculas

  // get-presence bajo demanda
  const onDemand = once(b, 'presence')
  b.emit('get-presence')
  assert.equal((await onDemand).people.length, 2)

  // B se desconecta → A recibe presence solo con Ana
  const presA3 = once(a, 'presence')
  b.disconnect()
  const p3 = await presA3
  assert.equal(p3.people.length, 1)
  assert.equal(p3.people[0].name, 'Ana')
})

test('presence: identidad ausente o con forma inválida cae a valores por defecto', async () => {
  const name = 'pres-' + Math.random().toString(36).slice(2, 8)
  const a = client('10.50.0.3')
  await once(a, 'connect')
  a.emit('create-room', { name, password: 'test1234' })
  await once(a, 'room-created')

  const presA = once(a, 'presence')
  a.emit('join-room', { name, password: 'test1234' }) // sin editor_name/editor_color
  await once(a, 'access-granted')
  const p = await presA
  assert.equal(p.people[0].name, 'Invitado')
  assert.match(p.people[0].color, /^#[0-9a-f]{6}$/)

  const b = client('10.50.0.4')
  await once(b, 'connect')
  const presA2 = once(a, 'presence')
  b.emit('join-room', { name, password: 'test1234', editor_name: '   ', editor_color: 'no-es-un-color' })
  await once(b, 'access-granted')
  const p2 = await presA2
  assert.equal(p2.people.length, 2)
  assert.ok(p2.people.every(x => x.name === 'Invitado'), 'nombre ausente o en blanco cae a "Invitado"')
  assert.ok(p2.people.every(x => /^#[0-9a-f]{6}$/.test(x.color)), 'color inválido cae a un hex por defecto')
})

test('update-identity: refresca la presencia en vivo, para uno mismo y para el resto', async () => {
  const name = 'pres-' + Math.random().toString(36).slice(2, 8)

  const a = client('10.50.0.5')
  await once(a, 'connect')
  a.emit('create-room', { name, password: 'test1234' })
  await once(a, 'room-created')
  const joinPresA = once(a, 'presence')
  a.emit('join-room', { name, password: 'test1234', editor_name: 'Ana', editor_color: '#ff0000' })
  await once(a, 'access-granted')
  await joinPresA // drena el broadcast del propio join de A

  const b = client('10.50.0.6')
  await once(b, 'connect')
  const joinPresA2 = once(a, 'presence')
  const joinPresB = once(b, 'presence')
  b.emit('join-room', { name, password: 'test1234', editor_name: 'Beto', editor_color: '#00ff00' })
  await once(b, 'access-granted')
  await Promise.all([joinPresA2, joinPresB]) // drena el broadcast del join de B en ambos sockets

  const presA = once(a, 'presence')
  const presB = once(b, 'presence')
  a.emit('update-identity', { name, identity: { name: 'Ana Renombrada', color: '#ff0000' } })

  const [pA, pB] = await Promise.all([presA, presB])
  for (const p of [pA, pB]) {
    assert.equal(p.people.length, 2)
    assert.ok(p.people.some(x => x.name === 'Ana Renombrada'), 'el renombrado se ve, incluida la propia pestaña')
    assert.ok(p.people.some(x => x.name === 'Beto'), 'la otra identidad no se toca')
  }
})

test('update-identity: un socket sin join en esa sala no puede tocar su presencia', async () => {
  const name = 'pres-' + Math.random().toString(36).slice(2, 8)
  const a = client('10.50.0.7')
  await once(a, 'connect')
  a.emit('create-room', { name, password: 'test1234' })
  await once(a, 'room-created')
  a.emit('join-room', { name, password: 'test1234', editor_name: 'Ana', editor_color: '#ff0000' })
  await once(a, 'access-granted')

  const intruder = client('10.50.0.8')
  await once(intruder, 'connect')
  intruder.emit('update-identity', { name, identity: { name: 'Intruso', color: '#000000' } })
  await new Promise(r => setTimeout(r, 200))

  const p = once(a, 'presence')
  a.emit('get-presence')
  const { people } = await p
  assert.equal(people.length, 1)
  assert.equal(people[0].name, 'Ana')
})

// ── Miembros de la sala (room_member): también los no conectados ─────────────

async function newRoom(ip) {
  const name = 'memb-' + Math.random().toString(36).slice(2, 8)
  const s = client(ip)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  return { name, creator: s }
}

async function joinAs(s, room, editor_name, device_id) {
  const pres = once(s, 'presence')
  s.emit('join-room', { name: room, password: 'test1234', editor_name, editor_color: '#123456', device_id })
  await once(s, 'access-granted')
  await pres // drena el broadcast del propio join
}

async function presenceOf(s) {
  const p = once(s, 'presence')
  s.emit('get-presence')
  return (await p).people
}

test('miembros: quien se desconecta sigue en la lista, como desconectado y con "visto por última vez"', async () => {
  const { name, creator: a } = await newRoom('10.50.1.1')
  await joinAs(a, name, 'Ana', 'device-ana-0001')
  const b = client('10.50.1.2')
  await once(b, 'connect')
  const bJoinSeenByA = once(a, 'presence')
  await joinAs(b, name, 'Beto', 'device-beto-001')
  await bJoinSeenByA // drena el broadcast del join de B en A

  const presA = once(a, 'presence')
  b.disconnect()
  const { people } = await presA
  assert.deepEqual(people.map(p => [p.name, p.online]), [['Ana', true], ['Beto', false]])
  assert.equal(people[0].last_seen_at, null)
  assert.match(people[1].last_seen_at, /^\d{4}-\d{2}-\d{2}T/)
})

test('miembros: varias pestañas del mismo dispositivo cuentan como una sola persona', async () => {
  const { name, creator: a } = await newRoom('10.50.1.3')
  await joinAs(a, name, 'Ana', 'device-ana-0002')
  const a2 = client('10.50.1.4')
  await once(a2, 'connect')
  await joinAs(a2, name, 'Ana', 'device-ana-0002')
  assert.deepEqual((await presenceOf(a)).map(p => [p.name, p.online]), [['Ana', true]])

  // Cerrar una pestaña no la marca como desconectada: la otra sigue dentro.
  const presA = once(a, 'presence')
  a2.disconnect()
  assert.deepEqual((await presA).people.map(p => [p.name, p.online]), [['Ana', true]])
})

test('miembros: renombrarse actualiza su fila, sin dejar el nombre viejo como fantasma', async () => {
  const { name, creator: a } = await newRoom('10.50.1.5')
  await joinAs(a, name, 'Ana', 'device-ana-0003')
  const b = client('10.50.1.6')
  await once(b, 'connect')
  await joinAs(b, name, 'Beto', 'device-beto-003')

  const renamed = once(b, 'presence')
  a.emit('update-identity', { name, identity: { name: 'Ana María', color: '#ff0000' } })
  await renamed
  const gone = once(b, 'presence')
  a.disconnect()
  await gone

  const people = await presenceOf(b)
  assert.deepEqual(people.map(p => [p.name, p.online]), [['Beto', true], ['Ana María', false]])
})

test('miembros: sin device_id (o inválido) hay presencia en vivo pero no queda como miembro', async () => {
  const { name, creator: a } = await newRoom('10.50.1.7')
  await joinAs(a, name, 'Ana', 'x') // demasiado corto → se ignora
  const b = client('10.50.1.8')
  await once(b, 'connect')
  await joinAs(b, name, 'Beto', 'device-beto-004')
  assert.equal((await presenceOf(b)).length, 2)

  const presB = once(b, 'presence')
  a.disconnect()
  assert.deepEqual((await presB).people.map(p => p.name), ['Beto'])
})

test('buildPeople: conectados primero (alfabético), luego el resto por "visto por última vez"', () => {
  const people = buildPeople(
    [
      { name: 'zoe', color: '#111111', deviceId: 'd1' },
      { name: 'Ana', color: '#222222', deviceId: 'd2' },
      { name: 'Ana (otra pestaña)', color: '#222222', deviceId: 'd2' },
      { name: 'Invitado', color: '#333333', deviceId: null },
    ],
    [
      { device_id: 'd1', name: 'zoe', color: '#111111', last_seen_at: '2026-09-01T10:00:00.000Z' },
      { device_id: 'd3', name: 'Viejo', color: '#444444', last_seen_at: '2026-01-01T10:00:00.000Z' },
      { device_id: 'd4', name: 'Reciente', color: '#555555', last_seen_at: '2026-06-01T10:00:00.000Z' },
    ],
  )
  assert.deepEqual(people.map(p => [p.name, p.online]), [
    ['Ana', true], ['Invitado', true], ['zoe', true], ['Reciente', false], ['Viejo', false],
  ])
})
