import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { getBookmark } from '../db/index.js'
import { startTestServer, connect, once, emitAck } from './helpers.js'

// Gestión de etiquetas: renombrar / borrar una etiqueta en todos los
// marcadores de la sala. Las URLs son IPs privadas: la vista previa falla al
// instante (SSRF bloqueado) y no se toca la red real.

let server
const sockets = []

before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

async function room(ip) {
  const name = 'tags-' + Math.random().toString(36).slice(2, 9)
  const s = connect(server.url, ip)
  sockets.push(s)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  return { s, name }
}

// Alta + vista previa fallida + etiquetas. Los listeners se registran antes de
// emitir: el alta y el fallo pueden llegar en el mismo paquete.
let urlCounter = 0
async function addTagged(s, name, tags) {
  const createdP = once(s, 'bookmark-created')
  const settledP = once(s, 'bookmark-updated')
  s.emit('create-bookmark', { room: name, url: `http://10.0.3.${++urlCounter}/` })
  const created = await createdP
  await settledP
  const updP = once(s, 'bookmark-updated')
  s.emit('update-bookmark', { room: name, id: created.id, tags })
  await updP
  return created.id
}

const tagsOf = id => getBookmark(id).tags

test('rename-bookmark-tag: cambia la etiqueta solo donde está y difunde únicamente los afectados', async () => {
  const { s, name } = await room('10.81.0.1')
  const a = await addTagged(s, name, ['reactjs', 'curso'])
  const b = await addTagged(s, name, ['otra'])

  const updP = once(s, 'bookmarks-updated')
  s.emit('rename-bookmark-tag', { room: name, from: 'reactjs', to: 'react' })
  const { bookmarks } = await updP
  assert.deepEqual(bookmarks.map(x => x.id), [a])
  assert.deepEqual(bookmarks[0].tags, ['react', 'curso'], 'conserva el orden')
  assert.deepEqual(tagsOf(b), ['otra'])
})

test('rename-bookmark-tag: renombrar a una etiqueta que ya existe las une sin duplicar', async () => {
  const { s, name } = await room('10.81.0.2')
  const both = await addTagged(s, name, ['reactjs', 'react'])
  const onlyOld = await addTagged(s, name, ['reactjs'])

  const updP = once(s, 'bookmarks-updated')
  s.emit('rename-bookmark-tag', { room: name, from: 'reactjs', to: 'react' })
  await updP
  assert.deepEqual(tagsOf(both), ['react'])
  assert.deepEqual(tagsOf(onlyOld), ['react'])
})

test('rename-bookmark-tag: sanea ambos nombres (mayúsculas, #, espacios)', async () => {
  const { s, name } = await room('10.81.0.3')
  const id = await addTagged(s, name, ['node js'])
  const updP = once(s, 'bookmarks-updated')
  s.emit('rename-bookmark-tag', { room: name, from: '  #NODE   JS ', to: ' #NodeJS ' })
  await updP
  assert.deepEqual(tagsOf(id), ['nodejs'])
})

test('rename-bookmark-tag: sin cambios, inexistente o inválido no difunde nada', async () => {
  const { s, name } = await room('10.81.0.4')
  await addTagged(s, name, ['a'])
  let got = 0
  s.on('bookmarks-updated', () => { got++ })
  s.emit('rename-bookmark-tag', { room: name, from: 'a', to: 'A' })          // misma etiqueta
  s.emit('rename-bookmark-tag', { room: name, from: 'no-existe', to: 'b' })  // nadie la tiene
  s.emit('rename-bookmark-tag', { room: name, from: 'a', to: '###' })        // vacía tras sanear
  s.emit('rename-bookmark-tag', { room: name, from: 'a', to: 42 })
  s.emit('rename-bookmark-tag', { room: name, from: 'x'.repeat(100), to: 'b' })
  await new Promise(r => setTimeout(r, 300))
  assert.equal(got, 0)
})

test('las etiquetas de otra sala no se tocan (renombrar ni borrar)', async () => {
  const a = await room('10.81.0.5')
  const b = await room('10.81.0.6')
  const mine = await addTagged(a.s, a.name, ['comun'])
  const theirs = await addTagged(b.s, b.name, ['comun'])

  const updP = once(a.s, 'bookmarks-updated')
  a.s.emit('rename-bookmark-tag', { room: a.name, from: 'comun', to: 'nueva' })
  await updP
  assert.deepEqual(tagsOf(mine), ['nueva'])
  assert.deepEqual(tagsOf(theirs), ['comun'])

  const delP = once(a.s, 'bookmarks-updated')
  await emitAck(a.s, 'delete-bookmark-tag', { room: a.name, tag: 'nueva' })
  await delP
  assert.deepEqual(tagsOf(theirs), ['comun'])
})

test('un socket sin sesión en la sala no puede renombrar ni borrar', async () => {
  const { s, name } = await room('10.81.0.7')
  const id = await addTagged(s, name, ['x'])
  const intruder = connect(server.url, '10.81.0.77')
  sockets.push(intruder)
  await once(intruder, 'connect')
  intruder.emit('rename-bookmark-tag', { room: name, from: 'x', to: 'y' })
  intruder.emit('delete-bookmark-tag', { room: name, tag: 'x' })
  await new Promise(r => setTimeout(r, 300))
  assert.deepEqual(tagsOf(id), ['x'])
})

test('delete-bookmark-tag: la quita de todos, conserva el resto y se puede deshacer', async () => {
  const { s, name } = await room('10.81.0.8')
  const a = await addTagged(s, name, ['borrar', 'queda'])
  const b = await addTagged(s, name, ['borrar'])
  const c = await addTagged(s, name, ['queda'])

  const updP = once(s, 'bookmarks-updated')
  const ack = await emitAck(s, 'delete-bookmark-tag', { room: name, tag: ' #Borrar ' })
  const { bookmarks } = await updP
  assert.deepEqual(bookmarks.map(x => x.id).sort(), [a, b].sort())
  assert.ok(ack.undoToken)
  assert.equal(ack.label, 'Etiqueta «#borrar»')
  assert.deepEqual(tagsOf(a), ['queda'])
  assert.deepEqual(tagsOf(b), [])
  assert.deepEqual(tagsOf(c), ['queda'])

  const restoredP = once(s, 'bookmarks-updated')
  assert.equal((await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })).ok, true)
  const restored = await restoredP
  assert.deepEqual(restored.bookmarks.map(x => x.id).sort(), [a, b].sort())
  assert.deepEqual(tagsOf(a), ['borrar', 'queda'], 'vuelve en su orden original')
  assert.deepEqual(tagsOf(b), ['borrar'])
})

test('delete-bookmark-tag: etiqueta que nadie tiene → ack vacío y sin difusión', async () => {
  const { s, name } = await room('10.81.0.9')
  await addTagged(s, name, ['a'])
  let got = 0
  s.on('bookmarks-updated', () => { got++ })
  const ack = await emitAck(s, 'delete-bookmark-tag', { room: name, tag: 'zzz' })
  assert.deepEqual(ack, {})
  await new Promise(r => setTimeout(r, 200))
  assert.equal(got, 0)
})

test('deshacer el borrado de una etiqueta no resucita un marcador borrado entretanto', async () => {
  const { s, name } = await room('10.81.0.10')
  const a = await addTagged(s, name, ['x'])
  const b = await addTagged(s, name, ['x'])
  const ack = await emitAck(s, 'delete-bookmark-tag', { room: name, tag: 'x' })
  await emitAck(s, 'delete-bookmark', { room: name, id: a })

  const restoredP = once(s, 'bookmarks-updated')
  await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })
  const { bookmarks } = await restoredP
  assert.deepEqual(bookmarks.map(x => x.id), [b])
  assert.equal(getBookmark(a), null)
})
