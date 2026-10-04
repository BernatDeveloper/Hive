import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { createBookmark, updateBookmark, applyPreview, failStalePreviews, getBookmark, sanitizeTags, placeholderTitle } from '../db/index.js'
import { startTestServer, connect, once, emitAck } from './helpers.js'

let server
const sockets = []

before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

async function room(ip, label = 'bm') {
  const name = `${label}-` + Math.random().toString(36).slice(2, 9)
  const s = connect(server.url, ip)
  sockets.push(s)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  return { s, name }
}

// Registra los listeners ANTES de emitir: el alta y el fallo de la vista previa
// pueden llegar en el mismo paquete y no hay microtarea entre ambos mensajes.
async function addBookmark(s, name, url = URL_BLOCKED) {
  const createdP = once(s, 'bookmark-created')
  const settledP = once(s, 'bookmark-updated')
  s.emit('create-bookmark', { room: name, url })
  return { created: await createdP, settled: await settledP }
}

function collect(socket, event, n, ms = 3000) {
  return new Promise((resolve, reject) => {
    const out = []
    const t = setTimeout(() => reject(new Error(`timeout: ${out.length}/${n} "${event}"`)), ms)
    const handler = data => {
      out.push(data)
      if (out.length === n) { clearTimeout(t); socket.off(event, handler); resolve(out) }
    }
    socket.on(event, handler)
  })
}

// Una URL con "punto" pero que apunta a una IP privada: el servidor la acepta
// y la descarga de la vista previa falla de forma determinista (SSRF
// bloqueado), sin tocar internet.
const URL_OK = 'https://ejemplo.com/tutorial' // nunca se llega a guardar (solo para el intruso): sin red real
const URL_BLOCKED = 'http://10.0.0.5/pagina'

// ─── Handlers ────────────────────────────────────────────

test('create-bookmark: difunde la tarjeta al momento (pending) y luego la actualiza', async () => {
  const { s, name } = await room('10.80.0.1')
  const createdP = once(s, 'bookmark-created')
  const updatedP = once(s, 'bookmark-updated')
  s.emit('create-bookmark', { room: name, url: URL_BLOCKED, editor_name: 'Ana', editor_color: '#ff0000' })

  const created = await createdP
  assert.equal(created.url, URL_BLOCKED)
  assert.equal(created.title, '10.0.0.5')           // provisional: el dominio
  assert.equal(created.preview_status, 'pending')
  assert.equal(created.added_by_name, 'Ana')
  assert.equal(created.added_by_color, '#ff0000')
  assert.deepEqual(created.tags, [])
  assert.equal(created.favorite, false)
  assert.equal(created.seen, false)

  const updated = await updatedP
  assert.equal(updated.id, created.id)
  assert.equal(updated.preview_status, 'failed')    // red privada → bloqueada
})

test('create-bookmark: sin esquema se asume https; basura se rechaza con bookmark-error', async () => {
  const { s, name } = await room('10.80.0.2')
  const { created } = await addBookmark(s, name, '10.0.0.9/x')
  assert.equal(created.url, 'https://10.0.0.9/x')

  for (const bad of ['', 'hola', 'javascript:alert(1)', 'file:///etc/passwd', 'https://u:p@ejemplo.com', 42, null]) {
    const errP = once(s, 'bookmark-error')
    s.emit('create-bookmark', { room: name, url: bad })
    assert.match((await errP).message, /válido/, `rechaza ${String(bad)}`)
  }
})

test('create-bookmark exige estar autenticado en la sala', async () => {
  const { name } = await room('10.80.0.3')
  const intruder = connect(server.url, '10.80.0.33')
  sockets.push(intruder)
  await once(intruder, 'connect')
  let got = false
  intruder.on('bookmark-created', () => { got = true })
  intruder.emit('create-bookmark', { room: name, url: URL_OK })
  await new Promise(r => setTimeout(r, 200))
  assert.equal(got, false)
})

test('access-granted incluye los marcadores de la sala (y no los de otra)', async () => {
  const a = await room('10.80.0.4')
  const b = await room('10.80.0.5')
  const { created } = await addBookmark(a.s, a.name)

  a.s.emit('join-room', { name: a.name, password: 'test1234' })
  const grantedA = await once(a.s, 'access-granted')
  assert.deepEqual(grantedA.bookmarks.map(x => x.id), [created.id])

  b.s.emit('join-room', { name: b.name, password: 'test1234' })
  assert.deepEqual((await once(b.s, 'access-granted')).bookmarks, [])
})

test('update-bookmark: edición parcial, etiquetas saneadas, favorito y visto', async () => {
  const { s, name } = await room('10.80.0.6')
  const { created: bm } = await addBookmark(s, name)

  let updP = once(s, 'bookmark-updated')
  s.emit('update-bookmark', { room: name, id: bm.id, title: '  Mi título  ', description: 'Para ver luego', tags: ['  React ', '#react', 'Node  JS', '', 7, 'x'.repeat(50)] })
  let upd = await updP
  assert.equal(upd.title, 'Mi título')
  assert.equal(upd.description, 'Para ver luego')
  assert.deepEqual(upd.tags, ['react', 'node js', 'x'.repeat(30)])
  assert.equal(upd.favorite, false)

  updP = once(s, 'bookmark-updated')
  s.emit('update-bookmark', { room: name, id: bm.id, favorite: true })
  upd = await updP
  assert.equal(upd.favorite, true)
  assert.equal(upd.title, 'Mi título', 'un campo ausente no se toca')
  assert.deepEqual(upd.tags, ['react', 'node js', 'x'.repeat(30)])

  updP = once(s, 'bookmark-updated')
  s.emit('update-bookmark', { room: name, id: bm.id, seen: true, title: '   ' })
  upd = await updP
  assert.equal(upd.seen, true)
  assert.equal(upd.title, '10.0.0.5', 'título vacío vuelve al provisional')
})

test('update-bookmark: valores de tipo incorrecto se ignoran', async () => {
  const { s, name } = await room('10.80.0.7')
  const { created: bm } = await addBookmark(s, name)

  const updP = once(s, 'bookmark-updated')
  s.emit('update-bookmark', { room: name, id: bm.id, favorite: 'sí', seen: 1, title: 5, tags: 'react' })
  const upd = await updP
  assert.equal(upd.favorite, false)
  assert.equal(upd.seen, false)
  assert.equal(upd.title, '10.0.0.5')
  assert.deepEqual(upd.tags, [])
})

test('update-bookmark: no se puede editar un marcador de otra sala', async () => {
  const a = await room('10.80.0.8')
  const b = await room('10.80.0.9')
  const { created: bm } = await addBookmark(a.s, a.name)

  let touched = false
  a.s.on('bookmark-updated', () => { touched = true })
  b.s.emit('update-bookmark', { room: b.name, id: bm.id, title: 'hackeado' })
  await new Promise(r => setTimeout(r, 200))
  assert.equal(touched, false)
  assert.equal(getBookmark(bm.id).title, '10.0.0.5')
})

test('refresh-bookmark: vuelve a pending y reintenta la vista previa', async () => {
  const { s, name } = await room('10.80.0.10')
  const { created: bm, settled } = await addBookmark(s, name)
  assert.equal(settled.preview_status, 'failed')

  const updatesP = collect(s, 'bookmark-updated', 2)
  s.emit('refresh-bookmark', { room: name, id: bm.id })
  const updates = await updatesP
  assert.equal(updates[0].preview_status, 'pending')
  assert.equal(updates[1].preview_status, 'failed')
})

test('delete-bookmark + undo-delete restauran el marcador tal cual', async () => {
  const { s, name } = await room('10.80.0.11')
  const { created: bm } = await addBookmark(s, name)
  const updP = once(s, 'bookmark-updated')
  s.emit('update-bookmark', { room: name, id: bm.id, tags: ['a', 'b'], favorite: true })
  await updP

  const deletedP = once(s, 'bookmark-deleted')
  const ack = await emitAck(s, 'delete-bookmark', { room: name, id: bm.id })
  assert.equal(await deletedP, bm.id)
  assert.ok(ack.undoToken)
  assert.match(ack.label, /10\.0\.0\.5/)
  assert.equal(getBookmark(bm.id), null)

  const restoredP = once(s, 'bookmark-created')
  assert.equal((await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })).ok, true)
  const restored = await restoredP
  assert.equal(restored.id, bm.id)
  assert.deepEqual(restored.tags, ['a', 'b'])
  assert.equal(restored.favorite, true)
})

test('limite de ritmo: demasiadas altas seguidas dan bookmark-error', async () => {
  const { s, name } = await room('10.80.0.12')
  let errors = 0
  s.on('bookmark-error', () => { errors++ })
  // 30 altas permitidas por minuto y socket: las 5 últimas se rechazan. Se
  // espera a que terminen las 30 vistas previas (fallan al instante: IP
  // privada) para no dejar trabajo suelto cuando se cierre la DB.
  const settled = collect(s, 'bookmark-updated', 30)
  for (let i = 0; i < 35; i++) s.emit('create-bookmark', { room: name, url: `http://10.0.1.${i}/` })
  await settled
  assert.equal(errors, 5)
})

// ─── Capa de datos ───────────────────────────────────────

function dbRoom() {
  const name = 'bmdb-' + Math.random().toString(36).slice(2, 9)
  db.prepare('INSERT INTO room (name, password_hash) VALUES (?, ?)').run(name, 'x')
  return name
}

test('applyPreview: rellena título, descripción e imagen cuando nadie los ha tocado', () => {
  const bm = createBookmark(dbRoom(), 'https://www.ejemplo.com/a', 'Ana', '#00ff00')
  assert.equal(bm.title, 'ejemplo.com')
  const done = applyPreview(bm.id, { title: 'Título real', description: 'Desc', image: 'https://ejemplo.com/i.png', siteName: 'Ejemplo' })
  assert.equal(done.title, 'Título real')
  assert.equal(done.description, 'Desc')
  assert.equal(done.image, 'https://ejemplo.com/i.png')
  assert.equal(done.site_name, 'Ejemplo')
  assert.equal(done.preview_status, 'done')
})

test('applyPreview: lo que el usuario ya escribió a mano no se pisa', () => {
  const bm = createBookmark(dbRoom(), 'https://ejemplo.com/a')
  updateBookmark(bm.id, { title: 'Mi título', description: 'Mi nota' })
  const done = applyPreview(bm.id, { title: 'Título real', description: 'Desc', image: null, siteName: null })
  assert.equal(done.title, 'Mi título')
  assert.equal(done.description, 'Mi nota')
})

test('applyPreview: null = fallo; y si la fila se borró por el camino devuelve null', () => {
  const bm = createBookmark(dbRoom(), 'https://ejemplo.com/a')
  assert.equal(applyPreview(bm.id, null).preview_status, 'failed')
  db.prepare('DELETE FROM bookmark WHERE id = ?').run(bm.id)
  assert.equal(applyPreview(bm.id, { title: 'x' }), null)
})

test('failStalePreviews: lo que quedó pending tras un reinicio pasa a failed', () => {
  const bm = createBookmark(dbRoom(), 'https://ejemplo.com/a')
  assert.equal(bm.preview_status, 'pending')
  failStalePreviews()
  assert.equal(getBookmark(bm.id).preview_status, 'failed')
})

test('sanitizeTags y placeholderTitle', () => {
  assert.deepEqual(sanitizeTags(['A', 'a', ' b  c ', '#d', '  #e', '']), ['a', 'b c', 'd', 'e'])
  assert.equal(sanitizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 10)
  assert.deepEqual(sanitizeTags('no es array'), [])
  assert.equal(placeholderTitle('https://www.youtube.com/watch?v=1'), 'youtube.com')
})

test('borrar la sala borra sus marcadores (cascada)', () => {
  const name = dbRoom()
  const bm = createBookmark(name, 'https://ejemplo.com/a')
  db.prepare('DELETE FROM room WHERE name = ?').run(name)
  assert.equal(getBookmark(bm.id), null)
})
