import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/connection.js'
import { touchList, createList } from '../db/index.js'
import { startTestServer, connect, once, emitAck } from './helpers.js'

// "Última modificación" de una lista: quién y cuándo. Cuenta crearla,
// renombrarla, clonarla y cualquier cambio de sus ítems (añadir, marcar,
// desmarcar, editar texto, borrar, vaciar completados).

let server
const sockets = []

before(async () => { server = await startTestServer() })
after(async () => { await server.close(); db.close() })
afterEach(() => { for (const s of sockets.splice(0)) s.close() })

async function room(ip) {
  const name = 'lact-' + Math.random().toString(36).slice(2, 9)
  const s = connect(server.url, ip)
  sockets.push(s)
  await once(s, 'connect')
  s.emit('create-room', { name, password: 'test1234' })
  await once(s, 'room-created')
  s.emit('join-room', { name, password: 'test1234' })
  await once(s, 'access-granted')
  return { s, name }
}

const ANA = { editor_name: 'Ana', editor_color: '#ff0000' }
const BETO = { editor_name: 'Beto', editor_color: '#00ff00' }

async function newList(s, name, who = ANA) {
  const p = once(s, 'list-created')
  s.emit('create-list', { room: name, title: 'Compra', ...who })
  return p
}

// Emite una acción sobre ítems y devuelve [eventoDelCambio, listaActualizada].
// Los listeners se registran ANTES de emitir: ambos eventos pueden llegar en el
// mismo paquete.
async function act(s, name, emitFn, itemEvent) {
  const itemP = once(s, itemEvent)
  const listP = once(s, 'list-updated')
  emitFn()
  return [await itemP, await listP]
}

async function addItem(s, name, listId, text, who = ANA) {
  const [item] = await act(s, name, () => s.emit('create-list-item', { room: name, listId, text, ...who }), 'list-item-created')
  return item
}

async function currentList(s, name, id) {
  s.emit('join-room', { name, password: 'test1234' })
  const granted = await once(s, 'access-granted')
  return granted.lists.find(l => l.id === id)
}

test('crear una lista deja a quien la creó como autor de la última modificación', async () => {
  const { s, name } = await room('10.83.0.1')
  const list = await newList(s, name)
  assert.equal(list.last_editor_name, 'Ana')
  assert.equal(list.last_editor_color, '#ff0000')
  assert.ok(list.edited_at && !Number.isNaN(Date.parse(list.edited_at)))
})

test('añadir un ítem: la lista pasa a figurar como modificada por quien lo añadió', async () => {
  const { s, name } = await room('10.83.0.2')
  const list = await newList(s, name, ANA)
  const [item, updated] = await act(s, name, () => s.emit('create-list-item', { room: name, listId: list.id, text: 'Leche', ...BETO }), 'list-item-created')
  assert.equal(item.text, 'Leche')
  assert.equal(updated.id, list.id)
  assert.equal(updated.last_editor_name, 'Beto')
  assert.equal(updated.last_editor_color, '#00ff00')
  assert.ok(updated.edited_at >= list.edited_at)
})

test('marcar y desmarcar un ítem cuentan, cada vez con quien lo hizo', async () => {
  const { s, name } = await room('10.83.0.3')
  const list = await newList(s, name)
  const item = await addItem(s, name, list.id, 'Pan')

  const [, checked] = await act(s, name, () => s.emit('toggle-list-item', { room: name, id: item.id, checked: true, ...BETO }), 'list-item-updated')
  assert.equal(checked.last_editor_name, 'Beto')

  const [, unchecked] = await act(s, name, () => s.emit('toggle-list-item', { room: name, id: item.id, checked: false, ...ANA }), 'list-item-updated')
  assert.equal(unchecked.last_editor_name, 'Ana')
})

test('editar el texto de un ítem, borrarlo y vaciar completados también cuentan', async () => {
  const { s, name } = await room('10.83.0.4')
  const list = await newList(s, name)
  const a = await addItem(s, name, list.id, 'A')
  const b = await addItem(s, name, list.id, 'B')

  const [, edited] = await act(s, name, () => s.emit('update-list-item', { room: name, id: a.id, text: 'A2', ...BETO }), 'list-item-updated')
  assert.equal(edited.last_editor_name, 'Beto')

  await act(s, name, () => s.emit('toggle-list-item', { room: name, id: b.id, checked: true, ...ANA }), 'list-item-updated')

  const delItemP = once(s, 'list-item-deleted')
  const listP = once(s, 'list-updated')
  await emitAck(s, 'delete-list-item', { room: name, id: a.id, ...BETO })
  await delItemP
  assert.equal((await listP).last_editor_name, 'Beto')

  const delItemsP = once(s, 'list-items-deleted')
  const listP2 = once(s, 'list-updated')
  await emitAck(s, 'clear-completed-items', { room: name, listId: list.id, ...ANA })
  await delItemsP
  assert.equal((await listP2).last_editor_name, 'Ana')
})

test('renombrar y clonar una lista también dejan la atribución', async () => {
  const { s, name } = await room('10.83.0.5')
  const list = await newList(s, name, ANA)

  const renamedP = once(s, 'list-updated')
  s.emit('update-list', { room: name, id: list.id, title: 'Nuevo', ...BETO })
  const renamed = await renamedP
  assert.equal(renamed.title, 'Nuevo')
  assert.equal(renamed.last_editor_name, 'Beto')

  const clonedP = once(s, 'list-cloned')
  s.emit('clone-list', { room: name, id: list.id, ...BETO })
  const { list: copy } = await clonedP
  assert.equal(copy.last_editor_name, 'Beto')
  assert.ok(copy.edited_at)
})

test('editor ausente o inválido: se registra la modificación pero sin nombre/color', async () => {
  const { s, name } = await room('10.83.0.6')
  const list = await newList(s, name)
  const [, updated] = await act(s, name, () => s.emit('create-list-item', { room: name, listId: list.id, text: 'X', editor_name: '   ', editor_color: 'rojo' }), 'list-item-created')
  assert.equal(updated.last_editor_name, null)
  assert.equal(updated.last_editor_color, null)
  assert.ok(updated.edited_at)
})

test('un cambio que no se aplica (ítem inexistente / texto vacío) no toca la atribución', async () => {
  const { s, name } = await room('10.83.0.7')
  const list = await newList(s, name, ANA)
  let updates = 0
  s.on('list-updated', () => { updates++ })
  s.emit('toggle-list-item', { room: name, id: 'no-existe', checked: true, ...BETO })
  s.emit('update-list-item', { room: name, id: 'no-existe', text: 'x', ...BETO })
  s.emit('create-list-item', { room: name, listId: list.id, text: '   ', ...BETO })
  s.emit('clear-completed-items', { room: name, listId: list.id, ...BETO }) // nada marcado
  await new Promise(r => setTimeout(r, 300))
  assert.equal(updates, 0)
  assert.equal((await currentList(s, name, list.id)).last_editor_name, 'Ana')
})

test('deshacer un ítem borrado devuelve la atribución anterior de la lista', async () => {
  const { s, name } = await room('10.83.0.8')
  const list = await newList(s, name, ANA)
  const item = await addItem(s, name, list.id, 'Huevos', ANA)

  const delListP = once(s, 'list-updated')
  const ack = await emitAck(s, 'delete-list-item', { room: name, id: item.id, ...BETO })
  assert.equal((await delListP).last_editor_name, 'Beto')

  const restoredItemP = once(s, 'list-item-created')
  const restoredListP = once(s, 'list-updated')
  assert.equal((await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })).ok, true)
  await restoredItemP
  const restored = await restoredListP
  assert.equal(restored.last_editor_name, 'Ana', 'vuelve a figurar quien la tocó antes')
})

test('deshacer "vaciar completados" devuelve la atribución anterior de la lista', async () => {
  const { s, name } = await room('10.83.0.9')
  const list = await newList(s, name, ANA)
  const item = await addItem(s, name, list.id, 'Café', ANA)
  await act(s, name, () => s.emit('toggle-list-item', { room: name, id: item.id, checked: true, ...ANA }), 'list-item-updated')

  const clearedListP = once(s, 'list-updated')
  const ack = await emitAck(s, 'clear-completed-items', { room: name, listId: list.id, ...BETO })
  assert.equal((await clearedListP).last_editor_name, 'Beto')

  const restoredListP = once(s, 'list-updated')
  await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })
  assert.equal((await restoredListP).last_editor_name, 'Ana')
})

test('deshacer el borrado de una lista la devuelve con su atribución', async () => {
  const { s, name } = await room('10.83.0.10')
  const list = await newList(s, name, ANA)
  await addItem(s, name, list.id, 'x', BETO)
  const before = await currentList(s, name, list.id)

  const ack = await emitAck(s, 'delete-list', { room: name, id: list.id })
  const restoredP = once(s, 'list-created')
  await emitAck(s, 'undo-delete', { room: name, token: ack.undoToken })
  const restored = await restoredP
  assert.equal(restored.last_editor_name, 'Beto')
  assert.equal(restored.edited_at, before.edited_at)
})

test('al entrar (access-granted) las listas traen su atribución', async () => {
  const { s, name } = await room('10.83.0.11')
  const list = await newList(s, name, ANA)
  const granted = await currentList(s, name, list.id)
  assert.equal(granted.last_editor_name, 'Ana')
  assert.deepEqual(Object.keys(granted).sort(), ['created_at', 'edited_at', 'id', 'last_editor_color', 'last_editor_name', 'room', 'title'])
})

test('touchList está acotado por sala: no toca la lista de otra sala', () => {
  const a = 'lact-db-a-' + Math.random().toString(36).slice(2, 7)
  const b = 'lact-db-b-' + Math.random().toString(36).slice(2, 7)
  for (const n of [a, b]) db.prepare('INSERT INTO room (name, password_hash) VALUES (?, ?)').run(n, 'x')
  const list = createList(a, 'L', { name: 'Ana' })
  assert.equal(touchList(b, list.id, { name: 'Intruso' }), null)
  assert.equal(touchList(a, list.id, { name: 'Beto' }).last_editor_name, 'Beto')
})
