import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { io as ioClient } from 'socket.io-client'
import { db } from '../db/connection.js'
import { config } from '../config/env.js'
import { LIMITS } from '../config/limits.js'
import { startTestServer, once } from './helpers.js'

// Límites pequeños, fijados ANTES de arrancar el servidor (createIo y los
// cubos de cada socket los leen al crearse): así se prueban los cortes sin
// tener que enviar miles de mensajes.
LIMITS.eventBucket = { capacity: 20, refillPerSec: 1 }
LIMITS.writeBucket = { capacity: 10, refillPerSec: 1 }
LIMITS.maxConnectionsPerIp = 3
LIMITS.handshakesPerMinutePerIp = 8
LIMITS.strikesToBan = 5
LIMITS.banMs = 500
LIMITS.maxMessageBytes = 5_000

let server
const sockets = []
before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Abre un socket (solo websocket, sin reconexión) y resuelve cuando conecta;
// rechaza si el servidor lo rechaza. `ip` va en X-Forwarded-For (TRUST_PROXY=true en tests).
function open(ip, { headers = {}, transports = ['websocket'] } = {}) {
  const s = ioClient(server.url, {
    transports,
    forceNew: true,
    reconnection: false,
    extraHeaders: { 'x-forwarded-for': ip, ...headers },
  })
  sockets.push(s)
  return new Promise((resolve, reject) => {
    s.once('connect', () => resolve(s))
    s.once('connect_error', err => reject(err))
  })
}

const rejected = (promise) => promise.then(() => false, () => true)

async function authed(ip) {
  const s = await open(ip)
  const name = 'guard-' + Math.random().toString(36).slice(2, 9)
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  return { s, name }
}

test('un uso normal (mensajes espaciados) nunca se corta', async () => {
  const { s, name } = await authed('10.90.0.1')
  for (let i = 0; i < 5; i++) {
    const p = once(s, 'note-created')
    s.emit('create-note', { room: name, title: 'n' + i })
    await p
    await sleep(60)
  }
})

test('inundar de mensajes: se descartan, el emisor recibe "rate-limited" y otra IP no se ve afectada', async () => {
  const { s } = await authed('10.90.0.2')
  const limited = once(s, 'rate-limited')
  for (let i = 0; i < 12; i++) s.emit('get-presence') // lecturas: solo cuentan para el cubo general (20)
  for (let i = 0; i < 40; i++) s.emit('get-presence')
  await limited // llegó el aviso: se estaba descartando

  const other = await authed('10.90.0.3')
  const p = once(other.s, 'note-created')
  other.s.emit('create-note', { room: other.name, title: 'ok' })
  await p
})

test('el cubo de ESCRITURAS es más estrecho: una ráfaga de altas no pasa entera', async () => {
  const { s, name } = await authed('10.90.0.4')
  // Dos tandas: socket.io entrega los mensajes aceptados al handler en el
  // SIGUIENTE ciclo, y si el baneo cierra el socket en el mismo ciclo en que se
  // aceptaron se ignoran. Con la primera tanda ya procesada, lo aceptado queda.
  for (let i = 0; i < 8; i++) s.emit('create-note', { room: name, title: 'n' + i })
  await sleep(150)
  for (let i = 8; i < 25; i++) s.emit('create-note', { room: name, title: 'n' + i })
  await sleep(400)
  // Se cuenta en la base de datos, no en los avisos al cliente (se pierden al banear).
  const created = db.prepare('SELECT COUNT(*) AS n FROM note WHERE room = ?').get(name).n
  assert.ok(created >= 1, 'las primeras sí entran')
  assert.ok(created < 25, `no deberían entrar las 25 (entraron ${created})`)
})

test('descartes repetidos banean la IP: se cierran sus sockets, se rechazan las nuevas conexiones y el baneo caduca', async () => {
  const { s } = await authed('10.90.0.5')
  const closed = new Promise(resolve => s.once('disconnect', reason => resolve(reason)))
  for (let i = 0; i < 80; i++) s.emit('get-presence')
  assert.equal(await closed, 'io server disconnect')

  assert.equal(await rejected(open('10.90.0.5')), true, 'IP baneada: conexión rechazada')
  const other = await open('10.90.0.6')
  assert.ok(other.connected, 'otra IP sigue pudiendo conectar')

  await sleep(LIMITS.banMs + 150)
  assert.equal(await rejected(open('10.90.0.5')), false, 'caducó el baneo')
})

test('máximo de conexiones abiertas por IP, que se libera al cerrar', async () => {
  const ip = '10.90.0.7'
  const a = await open(ip)
  await open(ip)
  await open(ip)
  assert.equal(await rejected(open(ip)), true, 'la 4ª sobra')
  a.close()
  await sleep(200)
  assert.equal(await rejected(open(ip)), false, 'al cerrar una, vuelve a haber hueco')
})

test('máximo de conexiones NUEVAS por minuto y por IP', async () => {
  const ip = '10.90.0.8'
  for (let i = 0; i < 8; i++) {
    const s = await open(ip)
    s.close()
    await sleep(30)
  }
  assert.equal(await rejected(open(ip)), true, 'la 9ª del minuto se rechaza')
  assert.equal(await rejected(open('10.90.0.9')), false, 'otra IP, sin problema')
})

test('detrás de un proxy NO declarado de confianza los límites por IP se desactivan (si no, un usuario castigaría a todos)', async () => {
  config.trustProxy = false
  try {
    // llega X-Forwarded-For pero no nos fiamos: la IP sería la del proxy
    for (let i = 0; i < 6; i++) await open('10.90.0.10') // > maxConnectionsPerIp (3)
  } finally {
    config.trustProxy = true
  }
})

test('un mensaje mayor que el máximo cierra la conexión', async () => {
  const { s, name } = await authed('10.90.0.11')
  const closed = new Promise(resolve => s.once('disconnect', resolve))
  s.emit('create-note', { room: name, title: 'x'.repeat(20_000) })
  await Promise.race([closed, sleep(3000).then(() => { throw new Error('la conexión no se cerró') })])
})

test('el ORIGEN se comprueba también en WebSocket (CORS no lo hace): uno ajeno se rechaza', async () => {
  for (const transports of [['websocket'], ['polling']]) {
    assert.equal(
      await rejected(open('10.90.0.12', { headers: { Origin: 'https://evil.example' }, transports })),
      true,
      `origen ajeno por ${transports[0]}`,
    )
  }
  // en desarrollo (NODE_ENV sin 'production') cualquier puerto de localhost y las IPs de red local valen
  for (const origin of ['http://localhost:5173', 'http://192.168.1.40:5173']) {
    assert.equal(await rejected(open('10.90.0.13', { headers: { Origin: origin } })), false, origin)
  }
  // sin cabecera Origin (scripts, otros clientes que no son un navegador): pasa
  assert.equal(await rejected(open('10.90.0.14')), false)
})
