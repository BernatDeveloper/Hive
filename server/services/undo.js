import { randomUUID } from 'node:crypto'

// Ventana de "deshacer" para borrados. La fila se elimina de la DB de inmediato
// (los demás clientes la ven desaparecer), pero guardamos una copia unos
// segundos para poder re-insertarla con `undo-delete`.
const UNDO_WINDOW_MS = 12_000
const tombstones = new Map() // token → { room, timer, entry }

export function stash(room, entry) {
  const token = randomUUID()
  const timer = setTimeout(() => tombstones.delete(token), UNDO_WINDOW_MS)
  timer.unref?.()
  tombstones.set(token, { room, timer, entry })
  return token
}

export function pop(token, room) {
  const t = tombstones.get(token)
  if (!t || t.room !== room) return null
  clearTimeout(t.timer)
  tombstones.delete(token)
  return t.entry
}
