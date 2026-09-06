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

test('presence: sube al entrar y baja al salir', async () => {
  const name = 'pres-' + Math.random().toString(36).slice(2, 8)

  const a = client('10.50.0.1')
  await once(a, 'connect')
  a.emit('create-room', { name, password: 'test1234' })
  await once(a, 'room-created')

  const presA = once(a, 'presence')
  a.emit('join-room', { name, password: 'test1234' })
  await once(a, 'access-granted')
  assert.equal((await presA).count, 1)

  // B entra → A recibe presence 2
  const b = client('10.50.0.2')
  await once(b, 'connect')
  const presA2 = once(a, 'presence')
  b.emit('join-room', { name, password: 'test1234' })
  await once(b, 'access-granted')
  assert.equal((await presA2).count, 2)

  // get-presence bajo demanda
  const onDemand = once(b, 'presence')
  b.emit('get-presence')
  assert.equal((await onDemand).count, 2)

  // B se desconecta → A recibe presence 1
  const presA3 = once(a, 'presence')
  b.disconnect()
  assert.equal((await presA3).count, 1)
})
