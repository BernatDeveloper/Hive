import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { startTestServer, connect, once } from './helpers.js'

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
  assert.deepEqual(p1.people[0], { name: 'Ana', color: '#ff0000' })

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
