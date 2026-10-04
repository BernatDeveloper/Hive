import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { getBookmark, createBookmark, applyPreview } from '../db/index.js'
import { startTestServer, connect, once, emitAck } from './helpers.js'

// Atribución de marcadores: "quién lo editó y cuándo" (last_editor_* +
// edited_at). Cuenta como editar cambiar el contenido (título, descripción,
// etiquetas); marcar favorito/visto o cargar la vista previa, no.

let server
const sockets = []

before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

async function room(ip) {
  const name = 'edit-' + Math.random().toString(36).slice(2, 9)
  const s = connect(server.url, ip)
  sockets.push(s)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  return { s, name }
}

let urlCounter = 0
async function add(s, name, creator = {}) {
  const createdP = once(s, 'bookmark-created')
  const settledP = once(s, 'bookmark-updated') // IP privada: la vista previa falla al instante
  s.emit('create-bookmark', { room: name, url: `http://10.0.4.${++urlCounter}/`, editor_name: creator.name, editor_color: creator.color })
  const created = await createdP
  await settledP
  return created
}

async function update(s, name, id, fields) {
  const updP = once(s, 'bookmark-updated')
  s.emit('update-bookmark', { room: name, id, ...fields })
  return updP
}

test('un bookmark recién guardado no figura como editado', async () => {
  const { s, name } = await room('10.82.0.1')
  const created = await add(s, name, { name: 'Ana', color: '#ff0000' })
  assert.equal(created.last_editor_name, null)
  assert.equal(created.last_editor_color, null)
  assert.equal(created.edited_at, null)
  // la vista previa (que sí toca updated_at) tampoco lo marca como editado
  const now = getBookmark(created.id)
  assert.equal(now.edited_at, null)
  assert.equal(now.added_by_name, 'Ana')
})

test('editar título, descripción o etiquetas guarda quién y cuándo, sin tocar quién lo creó', async () => {
  const { s, name } = await room('10.82.0.2')
  const created = await add(s, name, { name: 'Ana', color: '#ff0000' })

  for (const [fields, who] of [
    [{ title: 'Nuevo título' }, 'Beto'],
    [{ description: 'Una nota' }, 'Carla'],
    [{ tags: ['a', 'b'] }, 'Dani'],
  ]) {
    const upd = await update(s, name, created.id, { ...fields, editor_name: who, editor_color: '#00ff00' })
    assert.equal(upd.last_editor_name, who)
    assert.equal(upd.last_editor_color, '#00ff00')
    assert.ok(upd.edited_at && !Number.isNaN(Date.parse(upd.edited_at)))
    assert.equal(upd.added_by_name, 'Ana', 'quién lo guardó no cambia')
  }
})

test('favorito y visto NO cuentan como editar (y no pisan al último editor)', async () => {
  const { s, name } = await room('10.82.0.3')
  const created = await add(s, name)
  const edited = await update(s, name, created.id, { title: 'Editado', editor_name: 'Beto', editor_color: '#00ff00' })

  const fav = await update(s, name, created.id, { favorite: true, editor_name: 'Carla', editor_color: '#0000ff' })
  assert.equal(fav.favorite, true)
  assert.equal(fav.last_editor_name, 'Beto')
  assert.equal(fav.edited_at, edited.edited_at)

  const seen = await update(s, name, created.id, { seen: true, editor_name: 'Carla', editor_color: '#0000ff' })
  assert.equal(seen.last_editor_name, 'Beto')
  assert.equal(seen.edited_at, edited.edited_at)

  // y sobre un marcador nunca editado, tampoco lo marcan
  const other = await add(s, name)
  const star = await update(s, name, other.id, { favorite: true, editor_name: 'Carla' })
  assert.equal(star.edited_at, null)
  assert.equal(star.last_editor_name, null)
})

test('"guardar" sin cambiar nada no cuenta como editar', async () => {
  const { s, name } = await room('10.82.0.4')
  const created = await add(s, name)
  const first = await update(s, name, created.id, { title: 'Igual', tags: ['x'], editor_name: 'Beto' })
  const again = await update(s, name, created.id, { title: 'Igual', tags: ['x'], description: '', editor_name: 'Carla' })
  assert.equal(again.last_editor_name, 'Beto')
  assert.equal(again.edited_at, first.edited_at)
})

test('editor ausente o inválido: se registra la edición pero sin nombre/color', async () => {
  const { s, name } = await room('10.82.0.5')
  const created = await add(s, name)
  const upd = await update(s, name, created.id, { title: 'T', editor_name: '   ', editor_color: 'rojo' })
  assert.ok(upd.edited_at)
  assert.equal(upd.last_editor_name, null)
  assert.equal(upd.last_editor_color, null)
})

test('renombrar una etiqueta marca como editados solo los afectados', async () => {
  const { s, name } = await room('10.82.0.6')
  const a = await add(s, name)
  const b = await add(s, name)
  await update(s, name, a.id, { tags: ['viejo'] })
  await update(s, name, b.id, { tags: ['otro'] })

  const batchP = once(s, 'bookmarks-updated')
  s.emit('rename-bookmark-tag', { room: name, from: 'viejo', to: 'nuevo', editor_name: 'Eva', editor_color: '#ff00ff' })
  const { bookmarks } = await batchP
  assert.deepEqual(bookmarks.map(x => x.id), [a.id])
  assert.equal(bookmarks[0].last_editor_name, 'Eva')
  assert.ok(bookmarks[0].edited_at)
  assert.equal(getBookmark(b.id).last_editor_name, null)
})

test('deshacer el borrado de una etiqueta devuelve también la atribución anterior', async () => {
  const { s, name } = await room('10.82.0.7')
  const edited = await add(s, name)
  const untouched = await add(s, name)
  await update(s, name, edited.id, { tags: ['x'], editor_name: 'Beto', editor_color: '#00ff00' })
  const before = getBookmark(edited.id)
  await update(s, name, untouched.id, { tags: ['x'] }) // sin editor: queda con nombre null pero edited_at
  const beforeUntouched = getBookmark(untouched.id)

  const batchP = once(s, 'bookmarks-updated')
  const ack = await emitAck(s, 'delete-bookmark-tag', { room: name, tag: 'x', editor_name: 'Carla', editor_color: '#0000ff' })
  const { bookmarks } = await batchP
  assert.ok(bookmarks.every(b => b.last_editor_name === 'Carla'))

  const restoredP = once(s, 'bookmarks-updated')
  await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })
  await restoredP
  const after1 = getBookmark(edited.id)
  assert.deepEqual(after1.tags, ['x'])
  assert.equal(after1.last_editor_name, 'Beto')
  assert.equal(after1.edited_at, before.edited_at)
  assert.equal(getBookmark(untouched.id).edited_at, beforeUntouched.edited_at)
})

test('borrar y deshacer un marcador conserva su atribución de edición', async () => {
  const { s, name } = await room('10.82.0.8')
  const created = await add(s, name)
  const edited = await update(s, name, created.id, { title: 'Con editor', editor_name: 'Beto', editor_color: '#00ff00' })
  const ack = await emitAck(s, 'delete-bookmark', { room: name, id: created.id })
  const restoredP = once(s, 'bookmark-created')
  await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })
  const restored = await restoredP
  assert.equal(restored.last_editor_name, 'Beto')
  assert.equal(restored.edited_at, edited.edited_at)
})

test('applyPreview (la vista previa) no cuenta como edición', () => {
  const roomName = 'edit-db-' + Math.random().toString(36).slice(2, 8)
  db.prepare('INSERT INTO room (name, password_hash) VALUES (?, ?)').run(roomName, 'x')
  const bm = createBookmark(roomName, 'https://ejemplo.com/a', 'Ana', '#ff0000')
  const done = applyPreview(bm.id, { title: 'Real', description: 'D', image: null, siteName: null })
  assert.equal(done.title, 'Real')
  assert.equal(done.edited_at, null)
  assert.equal(done.last_editor_name, null)
})
