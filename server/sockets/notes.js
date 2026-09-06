import { createNote, updateNote, deleteNote } from '../db/index.js'
import { isNonEmptyString, isAuthedFor, broadcast } from './helpers.js'
import { safeOn } from './handler.js'

export function registerNoteHandlers(io, socket) {
  safeOn(socket, 'create-note', 'note-error', { message: 'No se pudo crear la nota' }, ({ room, title }) => {
    if (!isNonEmptyString(room)) return
    if (!isAuthedFor(socket, room)) return
    const safeTitle = typeof title === 'string' && title.trim() ? title.trim() : 'Sin título'
    const note = createNote(room, safeTitle)
    broadcast(io, room, 'note-created', note)
  })

  safeOn(socket, 'update-note', 'note-error', { message: 'No se pudo actualizar la nota' }, ({ room, note }) => {
    if (!isNonEmptyString(room)) return
    if (!isAuthedFor(socket, room)) return
    if (typeof note !== 'object' || note === null || !isNonEmptyString(note.id)) return
    const safeNote = {
      id: note.id,
      title: typeof note.title === 'string' ? note.title : '',
      body: typeof note.body === 'string' ? note.body : '',
    }
    const updated = updateNote(safeNote)
    broadcast(io, room, 'note-updated', updated)
  })

  safeOn(socket, 'delete-note', 'note-error', { message: 'No se pudo eliminar la nota' }, ({ room, id }) => {
    if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
    if (!isAuthedFor(socket, room)) return
    deleteNote(id)
    broadcast(io, room, 'note-deleted', id)
  })
}
