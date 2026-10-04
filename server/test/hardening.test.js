import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { countRooms } from '../db/index.js'
import { LIMITS } from '../config/limits.js'
import { startTestServer, connect, once } from './helpers.js'

// Endurecimiento de salas y cuotas, con los límites por defecto salvo donde
// el test los baja a propósito (y los restaura).

let server
const sockets = []
before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

async function open(ip) {
  const s = connect(server.url, ip)
  sockets.push(s)
  await once(s, 'connect')
  return s
}

let counter = 0
const roomName = () => `hard-${Date.now().toString(36)}-${++counter}`

async function authed(ip) {
  const s = await open(ip)
  const name = roomName()
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  return { s, name }
}

// Cambia un valor de LIMITS durante el test y lo devuelve a su sitio.
async function withLimits(patch, fn) {
  const saved = {}
  for (const key of Object.keys(patch)) saved[key] = LIMITS[key]
  Object.assign(LIMITS, patch)
  try { await fn() } finally { Object.assign(LIMITS, saved) }
}
const withQuota = (kind, max, fn) =>
  withLimits({ maxPerRoom: { ...LIMITS.maxPerRoom, [kind]: max } }, fn)

const collect = (socket, event, ms = 400) => new Promise(resolve => {
  const got = []
  const h = data => got.push(data)
  socket.on(event, h)
  setTimeout(() => { socket.off(event, h); resolve(got) }, ms)
})

// ─── No revelar qué salas existen ─────────────────────────

test('"no existe" y "contraseña incorrecta" dan el MISMO mensaje (el formulario no sirve para listar salas)', async () => {
  const { name } = await authed('10.92.0.1')
  const s = await open('10.92.0.2')

  s.emit('join-room', { name, password: 'contraseña-mala' })
  const wrongPassword = await once(s, 'access-denied')
  s.emit('join-room', { name: 'sala-que-no-existe-' + counter, password: 'test1234' })
  const noSuchRoom = await once(s, 'access-denied')

  assert.equal(wrongPassword, noSuchRoom)
  assert.match(wrongPassword, /sala o contraseña incorrectas/i)
})

// ─── Crear salas ──────────────────────────────────────────

test('crear salas: máximo por IP y hora, y un nombre ya cogido NO gasta cupo', async () => {
  const ip = '10.92.0.3'
  const s = await open(ip)
  const create = async (name) => {
    s.emit('create-room', { name, password: 'test1234' })
    return Promise.race([
      once(s, 'room-created').then(() => 'ok'),
      once(s, 'room-error'),
    ])
  }

  const first = roomName()
  assert.equal(await create(first), 'ok')
  for (let i = 0; i < 3; i++) assert.match(await create(first), /ya existe/i) // intentos fallidos

  for (let i = 0; i < 4; i++) assert.equal(await create(roomName()), 'ok') // 5 salas en total
  assert.match(await create(roomName()), /demasiadas salas/i)
})

test('tope global de salas', async () => {
  const s = await open('10.92.0.4')
  await withLimits({ maxRooms: countRooms() }, async () => {
    s.emit('create-room', { name: roomName(), password: 'test1234' })
    assert.match(await once(s, 'room-error'), /no se pueden crear más salas/i)
  })
})

// ─── Cuotas por sala ──────────────────────────────────────

test('cuota de notas por sala', async () => {
  await withQuota('note', 2, async () => {
    const { s, name } = await authed('10.92.0.5')
    for (let i = 0; i < 2; i++) {
      const p = once(s, 'note-created')
      s.emit('create-note', { room: name, title: 'n' + i })
      await p
    }
    const p = once(s, 'note-error')
    s.emit('create-note', { room: name, title: 'de más' })
    assert.match((await p).message, /límite de notas \(2\)/)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM note WHERE room = ?').get(name).n, 2)
  })
})

test('cuota de eventos: una serie que no cabe se rechaza ENTERA (no se crea a medias)', async () => {
  await withQuota('event', 10, async () => {
    const { s, name } = await authed('10.92.0.6')
    const p = once(s, 'event-error')
    s.emit('create-event', { room: name, event: { title: 'Serie', start: '2026-07-01', end: '2026-07-01', recurrence_rule: 'weekly' } })
    assert.match((await p).message, /límite de eventos/)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM event WHERE room = ?').get(name).n, 0)

    // un evento suelto sí cabe
    const ok = once(s, 'event-created')
    s.emit('create-event', { room: name, event: { title: 'Suelto', start: '2026-07-01', end: '2026-07-01' } })
    await ok
  })
})

test('cuota de listas e ítems (incluida la clonación, que duplica los ítems)', async () => {
  await withLimits({ maxPerRoom: { ...LIMITS.maxPerRoom, list: 3, list_item: 4 } }, async () => {
    const { s, name } = await authed('10.92.0.7')
    s.emit('create-list', { room: name, title: 'L' })
    const list = await once(s, 'list-created')
    for (let i = 0; i < 3; i++) {
      const p = once(s, 'list-item-created')
      s.emit('create-list-item', { room: name, listId: list.id, text: 'i' + i })
      await p
    }
    // 3 ítems + clon (3 más) = 6 > 4 → no se clona, y no queda una lista a medias
    const err = once(s, 'list-error')
    s.emit('clone-list', { room: name, id: list.id })
    assert.match((await err).message, /límite de ítems de lista \(4\)/)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM list WHERE room = ?').get(name).n, 1)

    // un ítem más cabe (4), el siguiente no
    const p4 = once(s, 'list-item-created')
    s.emit('create-list-item', { room: name, listId: list.id, text: 'i3' })
    await p4
    const err2 = once(s, 'list-error')
    s.emit('create-list-item', { room: name, listId: list.id, text: 'i4' })
    assert.match((await err2).message, /límite de ítems/)
  })
})

test('cuota de marcadores por sala', async () => {
  await withQuota('bookmark', 1, async () => {
    const { s, name } = await authed('10.92.0.8')
    const created = once(s, 'bookmark-created')
    s.emit('create-bookmark', { room: name, url: 'http://10.0.9.1/' }) // IP privada: la vista previa falla al instante
    await created
    const err = once(s, 'bookmark-error')
    s.emit('create-bookmark', { room: name, url: 'http://10.0.9.2/' })
    assert.match((await err).message, /límite de marcadores \(1\)/)
  })
})

// ─── Acciones caras ───────────────────────────────────────

test('create-event: máximo por minuto y socket (cada uno puede ser una serie de 365 filas)', async () => {
  const { s, name } = await authed('10.92.0.9')
  const errors = collect(s, 'event-error', 1500)
  const created = collect(s, 'event-created', 1500)
  for (let i = 0; i < 62; i++) {
    s.emit('create-event', { room: name, event: { title: 'e' + i, start: '2026-07-01', end: '2026-07-01' } })
  }
  const [errs, ok] = [await errors, await created]
  assert.ok(ok.length <= LIMITS.createEventsPerMinute, `se crearon ${ok.length}`)
  assert.ok(errs.some(e => /demasiado rápido/i.test(e.message)), 'avisa de que va demasiado rápido')
})

test('suscripción push: máximo por hora y socket, y cuota por sala (re-suscribir no gasta cupo)', async () => {
  await withQuota('push_subscription', 2, async () => {
    const { s, name } = await authed('10.92.0.10')
    const sub = n => ({ endpoint: `https://push.example/${name}/${n}`, keys: { p256dh: 'a'.repeat(20), auth: 'b'.repeat(10) } })

    for (const n of [1, 2]) {
      const p = once(s, 'push-subscribed')
      s.emit('subscribe-push', { room: name, subscription: sub(n) })
      await p
    }
    const err = once(s, 'push-error')
    s.emit('subscribe-push', { room: name, subscription: sub(3) })
    assert.match((await err).message, /límite de dispositivos/)

    // volver a suscribir uno que ya está sí se permite
    const again = once(s, 'push-subscribed')
    s.emit('subscribe-push', { room: name, subscription: sub(1) })
    await again
  })
})
